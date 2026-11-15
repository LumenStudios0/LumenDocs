import { hasPermission, resolveAccess } from './access-control.js'
import { handlePluginDownloads } from './plugin-downloads.js'
import { staffKnowledge } from './staff-knowledge.js'
import { handleStaffOperations } from './staff-operations.js'
import { handleLoyalty } from './loyalty.js'

const productPattern = /^[A-Za-z0-9_.-]{1,64}$/
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const text = (value, min, max) => typeof value === 'string' && value.trim().length >= min && value.trim().length <= max

export async function licensingRequest(env, path, options = {}) {
  if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) throw new Error('Licensing is not configured')
  const base = new URL(env.LICENSE_API_URL)
  if (base.protocol !== 'https:' || base.username || base.password) throw new Error('Invalid licensing URL')
  const response = await fetch(new URL(`/v1/admin${path}`, base), {
    ...options,
    headers: {
      Authorization: `Bearer ${env.LICENSE_ADMIN_API_TOKEN}`,
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
    signal: AbortSignal.timeout(10000),
  })
  const raw = await response.text()
  if (raw.length > 2000000) throw new Error('Licensing response is too large')
  const data = JSON.parse(raw)
  return { ok: response.ok, status: response.status, data }
}

function releaseView(row) {
  return {
    id: row.id, productId: row.product_id, version: row.version, channel: row.channel,
    body: row.body, minecraftVersions: row.minecraft_versions, published: Boolean(row.published),
    createdAt: row.created_at, updatedAt: row.updated_at,
  }
}

function audit(db, user, access, action, target, details) {
  return db.prepare(
    'INSERT INTO website_access_audit (id, actor_id, actor_role, action, target, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), user.id, access.role, action, target, JSON.stringify(details), new Date().toISOString())
}

async function activeProduct(env, id) {
  const result = await licensingRequest(env, '/products?pageSize=100')
  if (!result.ok || !Array.isArray(result.data.items)) throw new Error('Could not verify product registry')
  let page = result.data
  for (let number = 1; number <= 100; number++) {
    const found = page.items.find(item => item.productId === id)
    if (found) return found.active && Array.isArray(found.plugins) && found.plugins.length > 0
    if (number * 100 >= page.total) return false
    const next = await licensingRequest(env, `/products?pageSize=100&page=${number + 1}`)
    if (!next.ok || !Array.isArray(next.data.items) || !next.data.items.length) throw new Error('Incomplete product registry')
    page = next.data
  }
  throw new Error('Product registry exceeds the scan limit')
}

async function bulkGrant(request, env, user, access, send) {
  const raw = await request.text()
  if (raw.length > 8000) return send({ error: 'Request is too large' }, 413)
  let body
  try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON' }, 400) }
  const ids = body?.customerIds
  const expiry = body?.expiresAt ?? null
  if (!uuidPattern.test(body?.requestId ?? '') || typeof body?.productId !== 'string' || !productPattern.test(body.productId) ||
      !Array.isArray(ids) || !ids.length || ids.length > 10 || ids.some(id => typeof id !== 'string' || !/^\d{5,22}$/.test(id)) ||
      new Set(ids).size !== ids.length ||
      (expiry !== null && (typeof expiry !== 'string' || !Number.isFinite(Date.parse(expiry)) || Date.parse(expiry) <= Date.now()))) {
    return send({ error: 'Choose a product, a valid request ID, up to 10 unique Discord IDs, and a future expiry or lifetime access.' }, 400)
  }
  const expiresAt = expiry === null ? null : new Date(expiry).toISOString()
  const old = await env.COMMUNITY_DB.prepare(
    'SELECT * FROM studio_bulk_grants WHERE actor_id = ? AND request_id = ?',
  ).bind(user.id, body.requestId).all()
  if ((old.results || []).some(row => row.product_id !== body.productId || row.expires_at !== expiresAt || !ids.includes(row.customer_id)) ||
      (old.results?.length && old.results.length !== ids.length)) {
    return send({ error: 'This request ID belongs to a different batch. Refresh before starting another batch.' }, 409)
  }
  if (!old.results?.length) {
    if (!await activeProduct(env, body.productId)) return send({ error: 'Choose an active product with a linked plugin.' }, 409)
    const now = new Date().toISOString()
    // Reserve the entire batch before making any external changes.
    await env.COMMUNITY_DB.batch(ids.map(id => env.COMMUNITY_DB.prepare(
      `INSERT INTO studio_bulk_grants
       (request_id, actor_id, customer_id, product_id, expires_at, state, created_at)
       VALUES (?, ?, ?, ?, ?, 'processing', ?)`,
    ).bind(body.requestId, user.id, id, body.productId, expiresAt, now)))
  } else {
    return send({ results: old.results.map(row => ({ customerId: row.customer_id, state: row.state, message: row.message })) })
  }
  const results = []
  for (const id of ids) {
    let state = 'failed'
    let message = 'Grant was not attempted.'
    let grantAttempted = false
    try {
      const customer = await licensingRequest(env, `/customers/${id}`)
      if (customer.status !== 404 && (!customer.ok || customer.data.customerDiscordId !== id ||
          !Array.isArray(customer.data.products))) throw new Error('Could not verify customer access')
      if (customer.ok && customer.data.products.some(product =>
        !product || typeof product.productId !== 'string' || typeof product.status !== 'string' ||
        (product.expiresAt != null && (typeof product.expiresAt !== 'string' || !Number.isFinite(Date.parse(product.expiresAt)))))) {
        throw new Error('Customer product access is invalid')
      }
      if (customer.ok && (customer.data.status !== 'active' || customer.data.products.some(product =>
        product.productId === body.productId && product.status === 'active' &&
        (!product.expiresAt || Date.parse(product.expiresAt) > Date.now())))) {
        state = 'skipped'
        message = 'Existing access or account restriction: review this customer individually.'
      } else {
        grantAttempted = true
        const grant = await licensingRequest(env, '/licenses', {
          method: 'POST',
          headers: { 'X-Admin-Actor': `${user.id}:${access.role}` },
          body: JSON.stringify({ productId: body.productId, customerDiscordId: id, expiresAt }),
        })
        if (grant.ok) {
          state = 'granted'
          message = 'License granted.'
        } else {
          state = grant.status >= 500 ? 'uncertain' : 'failed'
          message = state === 'uncertain' ? 'Check the customer account before retrying; the result is uncertain.' : `Licensing declined this grant (HTTP ${grant.status}).`
        }
      }
    } catch (error) {
      console.error('Bulk grant operation failed:', error instanceof Error ? error.name : 'Unknown error')
      state = grantAttempted ? 'uncertain' : 'failed'
      message = grantAttempted ? 'Check the customer account before retrying; the result is uncertain.' : 'Customer access could not be verified; no grant was attempted.'
    }
    const updates = [env.COMMUNITY_DB.prepare(
      'UPDATE studio_bulk_grants SET state = ?, message = ? WHERE actor_id = ? AND request_id = ? AND customer_id = ?',
    ).bind(state, message, user.id, body.requestId, id),
    audit(env.COMMUNITY_DB, user, access, 'license.bulk_grant', id, { productId: body.productId, state, requestId: body.requestId })]
    if (state === 'granted') updates.push(env.COMMUNITY_DB.prepare(
      `INSERT INTO community_notifications (id, recipient_id, title, body, kind, product_id, audience, link, created_at)
       VALUES (?, ?, 'License granted', ?, 'license', ?, 'user', '/account/licenses', ?)`,
    ).bind(crypto.randomUUID(), id, `Staff granted access to ${body.productId}${expiresAt ? ` until ${expiresAt}` : ''}.`, body.productId, new Date().toISOString()))
    try { await env.COMMUNITY_DB.batch(updates) }
    catch (error) {
      console.error('Bulk grant result could not be recorded:', error)
      return send({ error: 'Some grants may have succeeded but results could not be saved. Check customer accounts; do not repeat the batch.', results }, 503)
    }
    results.push({ customerId: id, state, message })
  }
  return send({ results })
}

export async function handleProductTools(request, env, origin, path, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  if (path === '/studio/loyalty' || path === '/studio/loyalty/subclients') return handleLoyalty(request, env, origin, path, deps)
  if (path === '/studio/staff/docs') return staffKnowledge(request, env, origin, deps)
  if (/^\/studio\/staff\/(operations|presence|tasks|warnings|commissions|guide-feedback|tickets)(\/|$)/.test(path)) {
    return handleStaffOperations(request, env, origin, path, deps)
  }
  if (!env.COMMUNITY_DB) return send({ error: 'The website database is unavailable.' }, 503)
  if (path === '/studio/downloads' || path.startsWith('/studio/downloads/')) {
    return handlePluginDownloads(request, env, origin, path, { ...deps, licensingRequest })
  }
  const url = new URL(request.url)
  const publicRead = path === '/studio/releases' && request.method === 'GET'
  let user, access
  if (!publicRead) {
    const authorization = request.headers.get('Authorization') || ''
    user = await deps.verifyLoginToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '', env)
    if (!user) return send({ error: 'Sign in to use these tools.' }, 401)
    access = await resolveAccess(user.id, env)
    const permission = path === '/studio/bulk-grants' ? 'licenses.grant' : 'products.manage'
    if (!hasPermission(access, 'dashboard.view') || !hasPermission(access, permission)) return send({ error: `Permission required: ${permission}` }, 403)
    const limiter = request.method === 'GET' ? env.ADMIN_READ_LIMITER : env.ADMIN_WRITE_LIMITER
    if (!limiter) return send({ error: 'Staff request limiter is not configured.' }, 503)
    if (!(await limiter.limit({ key: `admin:${user.id}` })).success) return send({ error: 'Too many staff requests. Please wait a minute.' }, 429)
  }
  if (path === '/studio/bulk-grants' && request.method === 'POST') return bulkGrant(request, env, user, access, send)
  if ((path === '/studio/releases' || path === '/studio/staff/releases') && request.method === 'GET') {
    const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1))
    const where = publicRead ? 'WHERE published = 1' : ''
    const count = await env.COMMUNITY_DB.prepare(`SELECT COUNT(*) AS total FROM studio_releases ${where}`).first()
    const rows = await env.COMMUNITY_DB.prepare(`SELECT * FROM studio_releases ${where} ORDER BY updated_at DESC LIMIT 20 OFFSET ?`).bind((page - 1) * 20).all()
    return send({ items: (rows.results || []).map(releaseView), total: count.total, page, pageSize: 20 })
  }
  const match = path.match(/^\/studio\/staff\/releases\/([0-9a-f-]{36})$/i)
  if ((path === '/studio/staff/releases' && request.method === 'POST') || (match && request.method === 'PUT')) {
    const raw = await request.text()
    if (raw.length > 16000) return send({ error: 'Release is too large.' }, 413)
    let body
    try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
    if (!body || typeof body.productId !== 'string' || !productPattern.test(body.productId) || !text(body.version, 1, 60) ||
        !text(body.body, 1, 6000) || !['stable', 'beta'].includes(body.channel) || typeof body.published !== 'boolean' ||
        (body.minecraftVersions !== undefined && !text(body.minecraftVersions, 0, 200))) {
      return send({ error: 'Enter a product ID, version, stable/beta channel, release notes, and publication state.' }, 400)
    }
    const previous = match ? await env.COMMUNITY_DB.prepare('SELECT * FROM studio_releases WHERE id = ?').bind(match[1]).first() : null
    if (match && !previous) return send({ error: 'Release not found.' }, 404)
    if (previous?.published && (previous.product_id !== body.productId || previous.version !== body.version.trim())) return send({ error: 'Published releases keep their product and version identifiers.' }, 409)
    const duplicate = await env.COMMUNITY_DB.prepare('SELECT id FROM studio_releases WHERE product_id = ? AND version = ?').bind(body.productId, body.version.trim()).first()
    if (duplicate && duplicate.id !== previous?.id) return send({ error: 'That product version already exists.' }, 409)
    const id = previous?.id || crypto.randomUUID()
    const now = new Date().toISOString()
    const statement = previous
      ? env.COMMUNITY_DB.prepare('UPDATE studio_releases SET product_id = ?, version = ?, channel = ?, body = ?, minecraft_versions = ?, published = ?, updated_at = ? WHERE id = ?').bind(body.productId, body.version.trim(), body.channel, body.body.trim(), body.minecraftVersions?.trim() || '', +body.published, now, id)
      : env.COMMUNITY_DB.prepare('INSERT INTO studio_releases (id, product_id, version, channel, body, minecraft_versions, published, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(id, body.productId, body.version.trim(), body.channel, body.body.trim(), body.minecraftVersions?.trim() || '', +body.published, user.id, now, now)
    const statements = [statement, audit(env.COMMUNITY_DB, user, access, 'product.release_saved', id, { productId: body.productId, version: body.version.trim(), published: body.published })]
    if (body.published) statements.push(env.COMMUNITY_DB.prepare(
      `INSERT OR IGNORE INTO community_notifications (id, title, body, kind, product_id, audience, link, created_at)
       VALUES (?, ?, ?, 'update', ?, 'product', '/updates', ?)`,
    ).bind(id, `${body.productId} ${body.version.trim()}`, body.body.trim(), body.productId, now))
    if (body.published && previous?.published) statements.push(env.COMMUNITY_DB.prepare(
      'UPDATE community_notifications SET title = ?, body = ? WHERE id = ?',
    ).bind(`${body.productId} ${body.version.trim()}`, body.body.trim(), id))
    if (!body.published && previous?.published) statements.push(env.COMMUNITY_DB.prepare(
      'DELETE FROM community_notifications WHERE id = ?',
    ).bind(id))
    await env.COMMUNITY_DB.batch(statements)
    return send({ release: releaseView(await env.COMMUNITY_DB.prepare('SELECT * FROM studio_releases WHERE id = ?').bind(id).first()) }, previous ? 200 : 201)
  }
  return send({ error: 'Product tool route or method not found.' }, 404)
}

async function reminderId(value) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export async function runProductChecks(env) {
  if (!env.COMMUNITY_DB || !env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) return
  const job = await env.COMMUNITY_DB.prepare("SELECT cursor FROM studio_jobs WHERE id = 'expiry'").first()
  let page = job?.cursor || 1
  for (let scan = 0; scan < 2; scan++) {
    const result = await licensingRequest(env, `/customers?pageSize=25&page=${page}`)
    if (!result.ok || !Array.isArray(result.data.items) || !Number.isInteger(result.data.total)) throw new Error('Expiry scan received an invalid customer page')
    const statements = []
    for (const customer of result.data.items) {
      if (!/^\d{5,22}$/.test(customer.customerDiscordId || '') || !Array.isArray(customer.products)) throw new Error('Expiry scan received an invalid customer')
      if (customer.status !== 'active') continue
      for (const product of customer.products) {
        if (product.status !== 'active' || !product.expiresAt || product.productActive === false) continue
        const remaining = Date.parse(product.expiresAt) - Date.now()
        if (!Number.isFinite(remaining)) throw new Error('Expiry scan received an invalid expiry')
        if (remaining <= 0 || remaining > 7 * 86400000) continue
        if (!productPattern.test(product.productId || '')) throw new Error('Expiry scan received an invalid product')
        const window = remaining <= 86400000 ? '1-day' : '7-day'
        const id = await reminderId(`expiry:${customer.customerDiscordId}:${product.productId}:${product.expiresAt}:${window}`)
        statements.push(env.COMMUNITY_DB.prepare(
          `INSERT OR IGNORE INTO community_notifications (id, recipient_id, title, body, kind, product_id, audience, link, created_at)
           VALUES (?, ?, 'License expires soon', ?, 'license', ?, 'user', '/account/licenses', ?)`,
        ).bind(id, customer.customerDiscordId, `Your ${product.productName || product.productId} access expires on ${product.expiresAt}.`, product.productId, new Date().toISOString()))
      }
    }
    if (statements.length) {
      for (let start = 0; start < statements.length; start += 50) await env.COMMUNITY_DB.batch(statements.slice(start, start + 50))
    }
    page = page * 25 >= result.data.total ? 1 : page + 1
    await env.COMMUNITY_DB.prepare("INSERT INTO studio_jobs (id, cursor) VALUES ('expiry', ?) ON CONFLICT(id) DO UPDATE SET cursor = excluded.cursor").bind(page).run()
    if (page === 1) break
  }
}
