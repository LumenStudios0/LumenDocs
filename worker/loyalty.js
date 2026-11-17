import { licensingRequest } from './product-tools.js'

const tiers = [
  { id: 'spark', name: 'Spark', count: 1, ips: 4, subclients: 1, discount: 0 },
  { id: 'radiance', name: 'Radiance', count: 3, ips: 5, subclients: 2, discount: 5 },
  { id: 'nova', name: 'Nova', count: 7, ips: 7, subclients: 3, discount: 10 },
  { id: 'elite', name: 'Lumen Elite', count: null, ips: 10, subclients: 5, discount: 15 },
]
const idPattern = /^\d{5,22}$/
const productPattern = /^[A-Za-z0-9_.-]{1,64}$/

export async function activeOwnership(env, id) {
  const result = await licensingRequest(env, `/customers/${encodeURIComponent(id)}`)
  if (result.status === 404 && result.data?.detail === 'Customer account not found') return []
  const data = result.data
  if (!result.ok || data?.customerDiscordId !== id || !Array.isArray(data.products) ||
      typeof data.verificationRequired !== 'boolean' || typeof data.status !== 'string') throw new Error('Invalid customer access response')
  if (data.status !== 'active' || data.verificationRequired) return []
  const ids = new Set()
  for (const product of data.products) {
    if (!product || !productPattern.test(product.productId ?? '') || typeof product.productActive !== 'boolean' ||
        typeof product.status !== 'string' || (product.expiresAt !== null &&
          (typeof product.expiresAt !== 'string' || !Number.isFinite(Date.parse(product.expiresAt))))) throw new Error('Invalid product access response')
    if (product.productActive && product.status === 'active' && (!product.expiresAt || Date.parse(product.expiresAt) > Date.now())) ids.add(product.productId)
  }
  return [...ids]
}

async function activeRegistry(env) {
  const products = new Map()
  let total
  for (let page = 1; page <= 100; page++) {
    const result = await licensingRequest(env, `/products?pageSize=100&page=${page}`)
    if (!result.ok || !Array.isArray(result.data?.items) || !Number.isInteger(result.data.total) || result.data.total < 0 ||
        (total !== undefined && total !== result.data.total)) throw new Error('Invalid product registry')
    total = result.data.total
    for (const product of result.data.items) {
      if (!productPattern.test(product?.productId ?? '') || typeof product.name !== 'string' ||
          typeof product.active !== 'boolean' || !Array.isArray(product.plugins) ||
          !product.plugins.every(plugin => typeof plugin === 'string') || products.has(product.productId)) throw new Error('Invalid product registry')
      products.set(product.productId, product)
    }
    if (products.size === total) return [...products.values()].filter(product => product.active && product.plugins.length)
    if (!result.data.items.length || products.size > total) throw new Error('Incomplete product registry')
  }
  throw new Error('Product registry too large')
}

export async function loyaltyStatus(env, id) {
  const [owned, registry] = await Promise.all([activeOwnership(env, id), activeRegistry(env)])
  const ownedSet = new Set(owned)
  const eligible = registry.filter(product => ownedSet.has(product.productId))
  const all = registry.length > 0 && eligible.length === registry.length
  const tier = all ? tiers[3] : [...tiers.slice(0, 3)].reverse().find(item => eligible.length >= item.count) || null
  return { tier, count: eligible.length, total: registry.length, products: eligible.map(({ productId, name }) => ({ productId, name })) }
}

export async function delegatedProducts(env, memberId) {
  const rows = (await env.COMMUNITY_DB.prepare(
    `SELECT owner_id,product_id,member_id,created_at FROM loyalty_subclients WHERE member_id = ? ORDER BY owner_id,product_id`,
  ).bind(memberId).all()).results || []
  if (rows.length > 100) throw new Error('Too many delegated licenses to verify')
  const statuses = new Map()
  const allowed = new Set()
  for (const row of rows) {
    if (!statuses.has(row.owner_id)) statuses.set(row.owner_id, await loyaltyStatus(env, row.owner_id))
    const status = statuses.get(row.owner_id)
    if (!status.tier || !status.products.some(product => product.productId === row.product_id)) continue
    const position = await env.COMMUNITY_DB.prepare(
      `SELECT COUNT(*) AS n FROM loyalty_subclients WHERE owner_id = ? AND product_id = ?
       AND (created_at < ? OR (created_at = ? AND member_id <= ?))`,
    ).bind(row.owner_id, row.product_id, row.created_at, row.created_at, memberId).first()
    if (position.n <= status.tier.subclients) allowed.add(row.product_id)
  }
  return [...allowed]
}

export async function handleLoyalty(request, env, origin, path, deps) {
  const send = (body, status = 200) => deps.respond(body, status, origin)
  if (!env.COMMUNITY_DB) return send({ error: 'Loyalty storage is unavailable.' }, 503)
  const authorization = request.headers.get('Authorization') || ''
  const user = await deps.verifyLoginToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '', env)
  if (!user || !idPattern.test(user.id)) return send({ error: 'Sign in with Discord to use loyalty.' }, 401)
  const isRead = request.method === 'GET'
  if (!['GET', 'POST'].includes(request.method) || (path !== '/studio/loyalty' && path !== '/studio/loyalty/subclients')) return send({ error: 'Not found.' }, 404)
  if (path === '/studio/loyalty' && !isRead) return send({ error: 'Method not allowed.' }, 405)
  const limiter = isRead ? env.ADMIN_READ_LIMITER : env.ADMIN_WRITE_LIMITER
  if (!limiter) return send({ error: 'Loyalty rate limiting is unavailable.' }, 503)
  if (!(await limiter.limit({ key: `loyalty:${user.id}` })).success) return send({ error: 'Please wait before trying again.' }, 429)
  try {
    if (path === '/studio/loyalty') {
      const status = await loyaltyStatus(env, user.id)
      await env.COMMUNITY_DB.prepare('UPDATE member_profiles SET tier=?,tier_checked_at=? WHERE user_id=?')
        .bind(status.tier?.id || null, new Date().toISOString(), user.id).run()
      const rows = (await env.COMMUNITY_DB.prepare('SELECT product_id AS productId,member_id AS memberId,created_at AS createdAt FROM loyalty_subclients WHERE owner_id = ? ORDER BY created_at,member_id')
        .bind(user.id).all()).results || []
      return send({ ...status, tiers, subclients: rows })
    }
    if (request.method !== 'POST') return send({ error: 'Method not allowed.' }, 405)
    const raw = await request.text()
    if (raw.length > 1000) return send({ error: 'Request is too large.' }, 413)
    let body
    try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
    if (!['add', 'remove'].includes(body?.action) || !productPattern.test(body.productId ?? '') ||
        typeof body.memberId !== 'string' || !idPattern.test(body.memberId) || body.memberId === user.id) return send({ error: 'Choose a plugin and another valid Discord user ID.' }, 400)
    if (body.action === 'remove') {
      const result = await env.COMMUNITY_DB.prepare('DELETE FROM loyalty_subclients WHERE owner_id = ? AND product_id = ? AND member_id = ?')
        .bind(user.id, body.productId, body.memberId).run()
      return result.meta.changes ? send({ removed: true }) : send({ error: 'Sub-client not found.' }, 404)
    }
    const status = await loyaltyStatus(env, user.id)
    if (!status.tier || !status.products.some(product => product.productId === body.productId)) return send({ error: 'An active owned product is required.' }, 403)
    const member = await env.COMMUNITY_DB.prepare('SELECT discord_id FROM website_members WHERE discord_id = ?').bind(body.memberId).first()
    if (!member) return send({ error: 'This person must sign in to the website with Discord first.' }, 404)
    const result = await env.COMMUNITY_DB.prepare(
      `INSERT INTO loyalty_subclients(owner_id,product_id,member_id,created_at)
       SELECT ?,?,?,? WHERE (SELECT COUNT(*) FROM loyalty_subclients WHERE owner_id = ? AND product_id = ?) < ?
       AND (SELECT COUNT(*) FROM loyalty_subclients WHERE member_id = ?) < 100
       ON CONFLICT(owner_id,product_id,member_id) DO NOTHING`,
    ).bind(user.id, body.productId, body.memberId, new Date().toISOString(), user.id, body.productId, status.tier.subclients, body.memberId).run()
    return result.meta.changes ? send({ added: true }, 201) : send({ error: 'Already added, or the sub-client limit has been reached.' }, 409)
  } catch (error) {
    console.error('Loyalty request failed:', error instanceof Error ? error.name : 'Unknown error')
    return send({ error: 'Loyalty or licensing data could not be verified. Please try again later.' }, 503)
  }
}
