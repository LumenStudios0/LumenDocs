import { hasPermission, resolveAccess } from './access-control.js'

export function validImageUrl(value) {
  if (value == null) return true
  if (typeof value !== 'string' || value.length > 2000 || /[\u0000-\u0020]/.test(value)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password
  } catch { return false }
}

function trialView(row, staff) {
  return {
    id: row.id, productId: row.product_id, reason: row.reason, status: row.status,
    createdAt: row.created_at, reviewNote: row.review_note, expiresAt: row.expires_at,
    ...(staff ? { customerDiscordId: row.user_id } : {}),
  }
}

export async function expansionRoute(request, env, suffix, user, access, deps, helpers) {
  const { json, bodyJson, paginate, parsePage, validText, ticketView, notificationView } = helpers
  const reply = (payload, status = 200) => json(request, payload, status, deps.respond)
  const db = env.COMMUNITY_DB
  const url = new URL(request.url)
  const method = request.method
  const staff = suffix.startsWith('/staff/')
  const parsedBody = async (max = 12000) => {
    const parsed = await bodyJson(request, max)
    return parsed.error ? { response: reply({ error: parsed.error }, parsed.status) } : parsed
  }
  if (suffix === '/trial-products' && method === 'GET') {
    try {
      return reply({ items: (await trialProducts(env, user, access)).map(product => ({
        productId: product.productId, name: typeof product.name === 'string' ? product.name : product.productId,
      })) })
    } catch {
      return reply({ error: 'Trial products are temporarily unavailable. The active licensing registry could not be verified.' }, 503)
    }
  }
  if (method === 'GET' && ['/incidents', '/updates', '/staff/scheduled'].includes(suffix)) {
    const page = parsePage(url)
    const table = suffix === '/incidents' ? 'community_incidents'
      : suffix === '/updates' ? 'community_notifications' : 'community_scheduled_notifications'
    const where = suffix === '/updates' ? "WHERE kind = 'update' AND audience IN ('all','product')"
      : suffix === '/staff/scheduled' ? "WHERE state = 'pending'" : ''
    const order = suffix === '/incidents' ? 'started_at DESC, id' : suffix === '/updates' ? 'created_at DESC, id' : 'scheduled_at, id'
    const result = await paginate(db, `SELECT COUNT(*) AS total FROM ${table} ${where}`,
      `SELECT * FROM ${table} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [], page)
    const items = result.items.map(row => suffix === '/incidents' ? {
      id: row.id, serviceId: row.service_id, status: row.status, previousStatus: row.previous_status,
      startedAt: row.started_at, resolvedAt: row.resolved_at, message: row.message,
    } : { ...notificationView(row, false, staff),
      ...(staff ? { scheduledAt: row.scheduled_at, state: row.state } : {}) })
    return reply({ ...result, items })
  }
  let match = suffix.match(/^\/staff\/scheduled\/([0-9a-f-]{36})$/i)
  if (match && method === 'DELETE') {
    const result = await db.prepare("UPDATE community_scheduled_notifications SET state = 'cancelled' WHERE id = ? AND state = 'pending'")
      .bind(match[1]).run()
    return result.meta?.changes ? reply({ ok: true }) : reply({ error: 'Pending schedule not found' }, 404)
  }
  match = suffix.match(/^\/issues\/([0-9a-f-]{36})\/subscription$/i)
  if (match && ['GET', 'PUT'].includes(method)) {
    const issue = await db.prepare('SELECT id FROM community_issues WHERE id = ? AND published = 1').bind(match[1]).first()
    if (!issue) return reply({ error: 'Published issue not found' }, 404)
    if (method === 'PUT') {
      const parsed = await parsedBody(1000)
      if (parsed.response) return parsed.response
      if (typeof parsed.value?.subscribed !== 'boolean') return reply({ error: 'subscribed must be true or false' }, 400)
      if (parsed.value.subscribed) {
        await db.prepare(`INSERT OR IGNORE INTO community_issue_subscriptions (issue_id,user_id,created_at)
          SELECT id,?,? FROM community_issues WHERE id = ? AND published = 1`)
          .bind(user.id, new Date().toISOString(), match[1]).run()
      } else {
        await db.prepare('DELETE FROM community_issue_subscriptions WHERE issue_id = ? AND user_id = ?').bind(match[1], user.id).run()
      }
    }
    return reply({ subscribed: Boolean(await db.prepare('SELECT 1 FROM community_issue_subscriptions WHERE issue_id = ? AND user_id = ?')
      .bind(match[1], user.id).first()) })
  }
  match = suffix.match(/^\/tickets\/([0-9a-f-]{36})\/rating$/i)
  if (match && method === 'PUT') {
    const parsed = await parsedBody(3000)
    if (parsed.response) return parsed.response
    const { score, comment = '' } = parsed.value ?? {}
    if (!Number.isInteger(score) || score < 1 || score > 5 || !validText(comment, 0, 2000)) {
      return reply({ error: 'Use a score from 1 to 5 and an optional comment up to 2000 characters' }, 400)
    }
    const ticket = await db.prepare('SELECT owner_id, status FROM community_tickets WHERE id = ?').bind(match[1]).first()
    if (!ticket || ticket.owner_id !== user.id) return reply({ error: 'Ticket not found' }, 404)
    if (ticket.status !== 'closed') return reply({ error: 'Only closed tickets can be rated' }, 409)
    const saved = await db.prepare("UPDATE community_tickets SET rating_score = ?, rating_comment = ? WHERE id = ? AND owner_id = ? AND status = 'closed'")
      .bind(score, comment.trim(), match[1], user.id).run()
    return saved.meta?.changes ? reply({ rating: { score, comment: comment.trim() } }) : reply({ error: 'Ticket is no longer closed' }, 409)
  }
  match = suffix.match(/^\/staff\/tickets\/([0-9a-f-]{36})\/(escalation|follow-up)$/i)
  if (match && method === 'PUT') {
    const parsed = await parsedBody(3000)
    if (parsed.response) return parsed.response
    const body = parsed.value ?? {}
    const now = new Date().toISOString()
    let result
    if (match[2] === 'escalation') {
      if (!validText(body.reason, 3, 2000)) return reply({ error: 'Escalation reason must be 3–2000 characters' }, 400)
      const target = body.targetId ?? null
      const targetMember = target === null ? null : (await deps.getStaffMembers(env)).find(member => member.id === target)
      if (target !== null && (typeof target !== 'string' || !/^\d{5,22}$/.test(target) ||
          !targetMember ||
          !hasPermission(await resolveAccess(target, env), 'tickets.manage'))) {
        return reply({ error: 'Choose an authorized support staff target' }, 400)
      }
      const statements = [db.prepare(`UPDATE community_tickets SET escalation_reason = ?, escalation_by = ?, escalation_at = ?,
        escalation_target_id = ?, updated_at = ?,
        assignee_id = CASE WHEN ? IS NULL THEN assignee_id ELSE ? END,
        assignee_name = CASE WHEN ? IS NULL THEN assignee_name ELSE ? END WHERE id = ?`)
        .bind(body.reason.trim(), user.id, now, target, now, target, target, target,
          target === user.id ? user.globalName || user.username : targetMember?.name ?? null, match[1])]
      if (target !== null) {
        statements.push(db.prepare(`INSERT INTO community_notifications (id,recipient_id,title,body,kind,audience,link,created_at)
          SELECT ?,?,'Ticket escalated','A ticket needs your attention','escalation','user',?,?
          FROM community_tickets WHERE id = ? AND escalation_target_id = ?`)
          .bind(crypto.randomUUID(), target, `/admin/?ticket=${match[1]}`, now, match[1], target))
      }
      result = (await db.batch(statements))[0]
    } else {
      if (!Number.isInteger(body.hours) || body.hours < 1 || body.hours > 168) return reply({ error: 'Follow-up hours must be 1–168' }, 400)
      result = await db.prepare('UPDATE community_tickets SET follow_up_hours = ? WHERE id = ?').bind(body.hours, match[1]).run()
    }
    if (!result.meta?.changes) return reply({ error: 'Ticket not found' }, 404)
    return reply({ ticket: ticketView(await db.prepare('SELECT * FROM community_tickets WHERE id = ?').bind(match[1]).first(), true) })
  }
  if (suffix === '/trials' || suffix === '/staff/trials') {
    if (method === 'GET') {
      const where = staff ? '' : 'WHERE user_id = ?'
      const result = await paginate(db, `SELECT COUNT(*) AS total FROM community_trials ${where}`,
        `SELECT * FROM community_trials ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, staff ? [] : [user.id], parsePage(url))
      return reply({ ...result, items: result.items.map(row => trialView(row, staff)) })
    }
    if (!staff && method === 'POST') {
      const parsed = await parsedBody(4000)
      if (parsed.response) return parsed.response
      const body = parsed.value ?? {}
      if (!validText(body.productId, 1, 100) || !validText(body.reason, 5, 2000)) return reply({ error: 'Provide a product and a reason of 5–2000 characters' }, 400)
      try {
        const available = await trialProducts(env, user, access)
        if (!available.some(product => product.productId === body.productId.trim())) {
          return reply({ error: 'Choose an available trial product from the licensing registry' }, 400)
        }
      } catch {
        return reply({ error: 'Trial products are temporarily unavailable. The active licensing registry could not be verified.' }, 503)
      }
      const row = { id: crypto.randomUUID(), product_id: body.productId.trim(), reason: body.reason.trim(),
        status: 'pending', created_at: new Date().toISOString(), review_note: '', expires_at: null }
      const result = await db.prepare(`INSERT OR IGNORE INTO community_trials (id,user_id,product_id,reason,created_at) VALUES (?,?,?,?,?)`)
        .bind(row.id, user.id, row.product_id, row.reason, row.created_at).run()
      return result.meta?.changes ? reply({ item: trialView(row, false) }, 201) : reply({ error: 'A request already awaits review for this product' }, 409)
    }
  }
  match = suffix.match(/^\/staff\/trials\/([0-9a-f-]{36})$/i)
  if (match && method === 'PUT') {
    const parsed = await parsedBody(3000)
    if (parsed.response) return parsed.response
    const body = parsed.value ?? {}
    const durationDays = body.durationDays ?? 7
    if (!['approved', 'declined'].includes(body.status) || !validText(body.reviewNote ?? '', 0, 2000) ||
        !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 30) return reply({ error: 'Invalid trial review or duration (1–30 days)' }, 400)
    if (body.status === 'approved' && !hasPermission(access, 'licenses.grant')) return reply({ error: 'Permission required: licenses.grant' }, 403)
    const row = await db.prepare('SELECT * FROM community_trials WHERE id = ?').bind(match[1]).first()
    if (!row) return reply({ error: 'Trial request not found' }, 404)
    if (row.status !== 'pending') return reply({ error: 'This request has already been reviewed or requires manual grant verification' }, 409)
    if (body.status === 'declined') {
      const saved = await db.prepare("UPDATE community_trials SET status = 'declined', review_note = ?, reviewed_by = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
        .bind((body.reviewNote ?? '').trim(), user.id, new Date().toISOString(), row.id).run()
      return saved.meta?.changes ? reply({ item: trialView({ ...row, status: 'declined', review_note: (body.reviewNote ?? '').trim() }, true) })
        : reply({ error: 'This request is already being reviewed' }, 409)
    }
    try {
      await validateTrialGrant(env, row, user, access)
    } catch (error) {
      return reply({ error: error.message }, error.status ?? 503)
    }
    const now = new Date().toISOString()
    const expiresAt = new Date(Date.now() + durationDays * 86400000).toISOString()
    const claimed = await db.prepare(`UPDATE community_trials SET status = 'processing', reviewed_by = ?, reviewed_at = ?, expires_at = ?,
      review_note = 'Grant in progress. If interrupted, verify licensing manually before further action.'
      WHERE id = ? AND status = 'pending'`).bind(user.id, now, expiresAt, row.id).run()
    if (!claimed.meta?.changes) return reply({ error: 'This request is already being reviewed' }, 409)
    try {
      const result = await licensingRequest(env, '/v1/admin/licenses', user, access, {
        productId: row.product_id, customerDiscordId: row.user_id, expiresAt,
      })
      if (!result.ok || !result.payload || typeof result.payload !== 'object' ||
          !(typeof result.payload.licenseId === 'string' || typeof result.payload.licenseKey === 'string')) {
        throw new Error('Unconfirmed grant')
      }
    } catch {
      await db.prepare(`UPDATE community_trials SET status = 'grant_failed',
        review_note = 'Grant outcome unconfirmed. Verify the licensing service manually before taking further action.' WHERE id = ? AND status = 'processing'`)
        .bind(row.id).run()
      return reply({ error: 'Grant not confirmed. Verify licensing manually; this request will not automatically retry.' }, 502)
    }
    // Keep approval and its private notification atomic after a confirmed external grant.
    try {
      await db.batch([
        db.prepare("UPDATE community_trials SET status = 'approved', review_note = ? WHERE id = ? AND status = 'processing'")
          .bind((body.reviewNote ?? '').trim(), row.id),
        db.prepare(`INSERT INTO community_notifications (id,recipient_id,title,body,kind,product_id,audience,link,created_at)
          VALUES (?,?,'Trial access granted',?,'license',?,'user','/account/licenses',?)`)
          .bind(crypto.randomUUID(), row.user_id, `Your trial access expires on ${expiresAt}.`, row.product_id, now),
      ])
    } catch {
      return reply({ error: 'The grant was confirmed, but local finalization failed. Verify licensing manually; do not grant it again.' }, 502)
    }
    return reply({ item: trialView({ ...row, status: 'approved', review_note: (body.reviewNote ?? '').trim(), expires_at: expiresAt }, true) })
  }
  return null
}

async function licensingRequest(env, path, user, access, body) {
  const base = new URL(env.LICENSE_API_URL)
  if (base.protocol !== 'https:' || base.username || base.password || !env.LICENSE_ADMIN_API_TOKEN) throw new Error('Licensing is unavailable')
  const response = await fetch(new URL(path, base), {
    method: body ? 'POST' : 'GET', redirect: 'error',
    headers: { Authorization: `Bearer ${env.LICENSE_ADMIN_API_TOKEN}`, 'X-Admin-Actor': `${user.id}:${access.role}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000),
  })
  const text = await response.text()
  if (text.length > 250000) throw new Error('Licensing response is too large')
  return { ok: response.ok, status: response.status, payload: response.status === 404 ? null : JSON.parse(text) }
}

async function trialProducts(env, user, access) {
  const products = []
  const seen = new Set()
  let total = null
  for (let page = 1; page <= 25; page++) {
    const result = await licensingRequest(env, `/v1/admin/products?page=${page}&pageSize=100`, user, access)
    const data = result.payload
    if (!result.ok || !Array.isArray(data?.items) || !Number.isInteger(data.total) || data.total < 0 || data.page !== page ||
        data.pageSize !== 100 || data.items.length > 100 || (total !== null && total !== data.total)) throw new Error('Unverified registry')
    total = data.total
    const expected = Math.min(100, Math.max(0, total - (page - 1) * 100))
    if (data.items.length !== expected) throw new Error('Incomplete registry')
    for (const candidate of data.items) {
      if (!candidate || typeof candidate.productId !== 'string' || !candidate.productId.trim() || candidate.productId.length > 100 ||
          seen.has(candidate.productId) || (candidate.name != null && (typeof candidate.name !== 'string' || candidate.name.length > 160))) {
        throw new Error('Invalid registry')
      }
      seen.add(candidate.productId)
      if (candidate.active === true && Array.isArray(candidate.plugins) && candidate.plugins.length &&
          candidate.plugins.every(plugin => typeof plugin === 'string' && plugin.length > 0 && plugin.length <= 100)) products.push(candidate)
    }
    if (page * 100 >= total) return products
  }
  throw new Error('Registry exceeds the scan limit')
}

async function validateTrialGrant(env, row, user, access) {
  const fail = (message, status = 503) => { throw Object.assign(new Error(message), { status }) }
  try {
    const product = (await trialProducts(env, user, access)).find(candidate => candidate.productId === row.product_id)
    if (!product) fail('Trial requires an active product with a linked plugin', 409)
    const result = await licensingRequest(env, `/v1/admin/customers/${encodeURIComponent(row.user_id)}`, user, access)
    if (result.status === 404) return
    const profile = result.payload
    if (!result.ok || profile?.customerDiscordId !== row.user_id || !Array.isArray(profile.products) ||
        profile.status !== 'active') fail('Customer entitlements could not be safely verified', 409)
    if (profile.products.some(license => !license || typeof license.productId !== 'string')) fail('Customer entitlements could not be safely verified')
    // Even expired/revoked ownership needs manual review: never replace an existing paid entitlement.
    if (profile.products.some(license => license.productId === row.product_id)) fail('Customer already owns this product; existing licenses will not be changed', 409)
  } catch (error) {
    if (error.status) throw error
    fail('The licensing service could not safely verify this trial')
  }
}

export async function runCommunityExpansionChecks(env) {
  if (!env.COMMUNITY_DB) return
  const db = env.COMMUNITY_DB
  const now = new Date().toISOString()
  const errors = []
  try {
    const schedules = await db.prepare("SELECT id FROM community_scheduled_notifications WHERE state = 'pending' AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 20").bind(now).all()
    for (const row of schedules.results ?? []) {
      await db.batch([
        db.prepare(`INSERT OR IGNORE INTO community_notifications (id,title,body,kind,product_id,audience,image_url,link,created_at)
          SELECT id,title,body,kind,product_id,audience,image_url,'/account/notifications',?
          FROM community_scheduled_notifications WHERE id = ? AND state = 'pending' AND scheduled_at <= ?`).bind(now, row.id, now),
        db.prepare(`UPDATE community_scheduled_notifications SET state = 'published'
          WHERE id = ? AND state = 'pending' AND EXISTS (SELECT 1 FROM community_notifications WHERE id = ?)`).bind(row.id, row.id),
      ])
    }
  } catch { errors.push('Scheduled publication could not complete') }
  if (env.DISCORD_BUG_REPORT_WEBHOOK) {
    try { await sendFollowups(env, now) } catch { errors.push('Ticket follow-ups could not complete') }
  }
  if (errors.length) console.error('Community scheduled tasks:', errors.join('; '))
  return { errors }
}

async function sendFollowups(env, now) {
  const db = env.COMMUNITY_DB
  let webhook
  try {
    webhook = new URL(env.DISCORD_BUG_REPORT_WEBHOOK)
    if (webhook.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(webhook.hostname) ||
        !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(webhook.pathname) || webhook.username || webhook.password) throw new Error('Invalid webhook')
  } catch {
    console.error('Discord follow-up webhook configuration is invalid')
    return
  }
  // A crashed/ambiguous delivery is not safe to resend: webhook APIs have no idempotency key.
  await db.prepare(`UPDATE community_ticket_followups SET state = 'failed' WHERE state = 'sending' AND updated_at < ?`)
    .bind(new Date(Date.now() - 15 * 60000).toISOString()).run()
  const rows = await db.prepare(`SELECT t.* FROM community_tickets t
    LEFT JOIN community_ticket_followups f ON f.ticket_id = t.id AND f.cycle = t.unanswered_cycle
    WHERE t.status = 'open' AND t.last_sender_staff = 0 AND t.unanswered_since IS NOT NULL
      AND julianday(t.unanswered_since) + t.follow_up_hours / 24.0 <= julianday(?)
      AND (f.ticket_id IS NULL OR (f.state = 'pending' AND f.attempts < 5 AND f.next_attempt_at <= ?))
    ORDER BY t.unanswered_since LIMIT 20`).bind(now, now).all()
  for (const ticket of rows.results ?? []) {
    try {
      await db.prepare(`INSERT OR IGNORE INTO community_ticket_followups (ticket_id,cycle,updated_at,next_attempt_at) VALUES (?,?,?,?)`)
        .bind(ticket.id, ticket.unanswered_cycle, now, now).run()
      const claimed = await db.prepare(`UPDATE community_ticket_followups SET state = 'sending', attempts = attempts + 1, updated_at = ?
        WHERE ticket_id = ? AND cycle = ? AND state = 'pending' AND attempts < 5 AND next_attempt_at <= ?
        AND EXISTS (SELECT 1 FROM community_tickets WHERE id = ? AND status = 'open' AND last_sender_staff = 0
          AND unanswered_cycle = ? AND julianday(unanswered_since) + follow_up_hours / 24.0 <= julianday(?))`)
        .bind(now, ticket.id, ticket.unanswered_cycle, now, ticket.id, ticket.unanswered_cycle, now).run()
      if (!claimed.meta?.changes) continue
      let state = 'failed'
      try {
        const hours = Math.max(1, Math.floor((Date.now() - Date.parse(ticket.unanswered_since)) / 3600000))
        const response = await fetch(webhook, {
          method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `This ticket has not been answered for ${hours} hours. [Open ticket](https://lumenstudio.fyi/admin/?ticket=${encodeURIComponent(ticket.id)})`,
            allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(10000),
        })
        if (response.ok) state = 'sent'
        else if (response.status === 429 || response.status >= 500) state = 'pending'
      } catch { /* Delivery may have succeeded; do not retry an ambiguous network result. */ }
      await db.prepare(`UPDATE community_ticket_followups SET state = CASE WHEN attempts >= 5 AND ? = 'pending' THEN 'failed' ELSE ? END,
        updated_at = ?, next_attempt_at = ? WHERE ticket_id = ? AND cycle = ? AND state = 'sending'`)
        .bind(state, state, new Date().toISOString(), new Date(Date.now() + 15 * 60000).toISOString(), ticket.id, ticket.unanswered_cycle).run()
    } catch { console.error('A ticket follow-up could not complete') }
  }
}
