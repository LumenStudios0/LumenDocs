import { hasPermission, resolveAccess, siteSettings } from './access-control.js'

const STATUS_VALUES = new Set(['operational', 'degraded', 'outage', 'maintenance'])
const SERVICES = [
  { id: 'website', name: 'Website' },
  { id: 'discord', name: 'Discord sign-in' },
  { id: 'licensing', name: 'Licensing service' },
]
const DEFAULT_PREFERENCES = { updates: true, announcements: true, ticketReplies: true, products: [] }

function json(request, payload, status, respond) {
  const origin = request.headers.get('Origin') ?? new URL(request.url).origin
  return respond(payload, status, origin)
}

function parsePage(url) {
  const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1))
  const pageSize = Math.max(1, Math.min(50, Number.parseInt(url.searchParams.get('pageSize') ?? '20', 10) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

function validText(value, min, max) {
  return typeof value === 'string' && value.trim().length >= min && value.trim().length <= max
}

function cleanText(value) {
  return value.trim()
}

function ticketView(row, staff = false) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    productId: row.product_id,
    status: row.status,
    customerName: row.owner_name,
    assignedTo: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name } : null,
    labels: JSON.parse(row.labels || '[]'),
    serverSoftware: row.server_software,
    minecraftVersion: row.minecraft_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(staff ? { customerDiscordId: row.owner_id } : {}),
  }
}

async function deliverTicketAlert(env, id) {
  try {
    return await sendTicketAlert(env, id)
  } catch (error) {
    console.error('Ticket saved but alert processing failed:', error)
    return 'pending'
  }
}

async function sendTicketAlert(env, id) {
  if (!env.DISCORD_BUG_REPORT_WEBHOOK) return 'not_configured'
  const now = new Date().toISOString()
  const expiredLease = new Date(Date.now() - 5 * 60000).toISOString()
  const claimed = await env.COMMUNITY_DB.prepare(
    `UPDATE community_ticket_alerts SET state = 'sending', attempts = attempts + 1, updated_at = ?
     WHERE ticket_id = ? AND (state = 'pending' OR (state = 'sending' AND updated_at < ?)) AND attempts < 5`,
  ).bind(now, id, expiredLease).run()
  if (!claimed.meta?.changes) return 'pending'
  let deliveryError = null
  try {
    const webhook = new URL(env.DISCORD_BUG_REPORT_WEBHOOK)
    if (webhook.protocol !== 'https:' || !['discord.com', 'discordapp.com'].includes(webhook.hostname) ||
        !/^\/api(?:\/v\d+)?\/webhooks\/\d+\/[^/]+$/.test(webhook.pathname) || webhook.username || webhook.password) {
      throw new Error('Discord ticket webhook configuration is invalid')
    }
    const link = `https://lumenstudio.fyi/admin/?ticket=${encodeURIComponent(id)}`
    const response = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `A new ticket has been opened! [Click here to open it](${link})`,
        allowed_mentions: { parse: [] },
      }),
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Discord ticket alert returned HTTP ${response.status}`)
  } catch (error) {
    deliveryError = error instanceof Error && /^Discord ticket (alert returned HTTP \d+|webhook configuration is invalid)$/.test(error.message)
      ? error.message : 'Discord ticket alert could not be delivered'
    console.error('Ticket alert delivery failed:', deliveryError)
  }
  await env.COMMUNITY_DB.prepare(
    `UPDATE community_ticket_alerts SET state = CASE WHEN ? IS NULL THEN 'sent' WHEN attempts >= 5 THEN 'failed' ELSE 'pending' END,
     last_error = ?, updated_at = ? WHERE ticket_id = ?`,
  ).bind(deliveryError, deliveryError, new Date().toISOString(), id).run()
  return deliveryError ? 'pending' : 'sent'
}

function alertStatement(env, id, now) {
  return env.COMMUNITY_DB.prepare(
    'INSERT INTO community_ticket_alerts (ticket_id, updated_at) VALUES (?, ?)',
  ).bind(id, now)
}

function issueView(row) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    productId: row.product_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function notificationView(row, read = false, includeAudience = false) {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    kind: row.kind,
    productId: row.product_id,
    createdAt: row.created_at,
    read: Boolean(read),
    link: row.link,
    ...(includeAudience ? { audience: row.audience } : {}),
  }
}

async function bodyJson(request, maxBytes = 12000) {
  const text = await request.text()
  if (text.length > maxBytes) return { error: 'Request is too large', status: 413 }
  try {
    return { value: JSON.parse(text) }
  } catch {
    return { error: 'Expected a JSON request', status: 400 }
  }
}

async function session(request, env, deps, staffRequired = false) {
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const user = await deps.verifyLoginToken(token, env)
  if (!user) return { response: json(request, { error: 'Sign in to access the community' }, 401, deps.respond) }
  const access = await resolveAccess(user.id, env)
  const role = hasPermission(access, 'dashboard.view') ? access.role : null
  if (staffRequired && !role) {
    return { response: json(request, { error: 'Staff access is required' }, 403, deps.respond) }
  }
  return { user, role, access }
}

async function limit(request, env, user, deps, key = 'community') {
  if (!env.ASSISTANT_LIMITER) {
    return json(request, { error: 'The community service is not configured' }, 503, deps.respond)
  }
  const result = await env.ASSISTANT_LIMITER.limit({ key: `${key}:${user.id}` })
  return result.success
    ? null
    : json(request, { error: 'Please wait before using the community service again' }, 429, deps.respond)
}

function unavailable(request, deps, staff = false) {
  return json(request, {
    error: staff ? 'The community database is not configured. Provision COMMUNITY_DB and apply the community migrations.'
      : 'Website support is temporarily unavailable. Please try again later.',
    code: 'COMMUNITY_SERVICE_UNAVAILABLE',
  }, 503, deps.respond)
}

async function requireDb(request, env, deps, staff = false) {
  return env.COMMUNITY_DB ? null : unavailable(request, deps, staff)
}

async function paginate(db, countSql, listSql, values, page) {
  const count = await db.prepare(countSql).bind(...values).first()
  const items = await db.prepare(listSql).bind(...values, page.pageSize, page.offset).all()
  return { items: items.results ?? [], total: Number(count?.total ?? 0), page: page.page, pageSize: page.pageSize }
}

async function issueList(request, env, url, deps) {
  const page = parsePage(url)
  const result = await paginate(
    env.COMMUNITY_DB,
    'SELECT COUNT(*) AS total FROM community_issues WHERE published = 1',
    `SELECT * FROM community_issues WHERE published = 1 ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [],
    page,
  )
  return json(request, { ...result, items: result.items.map(issueView) }, 200, deps.respond)
}

async function createTicket(request, env, user, deps, body, typeOverride) {
  const { settings } = await siteSettings(env)
  if (!settings.supportOpen && !hasPermission(await resolveAccess(user.id, env), 'tickets.manage')) {
    return json(request, { error: settings.supportClosedMessage, code: 'SUPPORT_PAUSED' }, 503, deps.respond)
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(request, { error: 'Expected a ticket object' }, 400, deps.respond)
  const type = typeOverride ?? body.type
  const types = new Set(['support', 'bug', 'compatibility', 'feature'])
  if (!types.has(type)) return json(request, { error: 'Choose a valid ticket type' }, 400, deps.respond)
  if (!validText(body.title, 3, 160) || !validText(body.body, 5, 8000)) {
    return json(request, { error: 'Title must be 3–160 characters and body 5–8000 characters' }, 400, deps.respond)
  }
  const optional = (key, max) => body[key] == null ? null : validText(body[key], 1, max) ? cleanText(body[key]) : false
  const productId = optional('productId', 100)
  const serverSoftware = optional('serverSoftware', 100)
  const minecraftVersion = optional('minecraftVersion', 50)
  if ([productId, serverSoftware, minecraftVersion].includes(false)) {
    return json(request, { error: 'One or more ticket fields are invalid' }, 400, deps.respond)
  }
  if (type === 'compatibility' && (!serverSoftware || !minecraftVersion)) {
    return json(request, { error: 'Compatibility tickets require server software and Minecraft version' }, 400, deps.respond)
  }

  const now = new Date().toISOString()
  const id = crypto.randomUUID()
  await env.COMMUNITY_DB.batch([env.COMMUNITY_DB.prepare(
    `INSERT INTO community_tickets
      (id, owner_id, owner_name, type, title, body, product_id, server_software, minecraft_version, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
  ).bind(id, user.id, user.globalName || user.username, type, cleanText(body.title), cleanText(body.body), productId, serverSoftware, minecraftVersion, now, now),
  alertStatement(env, id, now)])
  const record = {
    id, type, title: cleanText(body.title), body: cleanText(body.body), product_id: productId,
    server_software: serverSoftware, minecraft_version: minecraftVersion, status: 'open',
    created_at: now, updated_at: now,
    owner_name: user.globalName || user.username,
  }
  const alertDelivery = await deliverTicketAlert(env, id)
  return { ...ticketView(record), ...(await deps.getAdminRole(user.id, env) ? { alertDelivery } : {}) }
}

async function tickets(request, env, url, user, deps) {
  const page = parsePage(url)
  const result = await paginate(
    env.COMMUNITY_DB,
    'SELECT COUNT(*) AS total FROM community_tickets WHERE owner_id = ?',
    `SELECT * FROM community_tickets WHERE owner_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    [user.id],
    page,
  )
  return json(request, { ...result, items: result.items.map(row => ticketView(row)) }, 200, deps.respond)
}

async function ticketDetail(request, env, user, deps, id, isStaff) {
  const row = await env.COMMUNITY_DB.prepare('SELECT * FROM community_tickets WHERE id = ?').bind(id).first()
  if (!row) return json(request, { error: 'Ticket not found' }, 404, deps.respond)
  if (!isStaff && row.owner_id !== user.id) return json(request, { error: 'Ticket not found' }, 404, deps.respond)
  const replies = await env.COMMUNITY_DB.prepare(
    'SELECT id, body, author_name, staff, created_at FROM community_replies WHERE ticket_id = ? ORDER BY created_at',
  ).bind(id).all()
  return json(request, {
    ticket: {
      ...ticketView(row, isStaff),
      ...(isStaff ? { alertConfigured: Boolean(env.DISCORD_BUG_REPORT_WEBHOOK), alert: await env.COMMUNITY_DB.prepare(
        'SELECT state, attempts, last_error AS lastError FROM community_ticket_alerts WHERE ticket_id = ?',
      ).bind(id).first() } : {}),
    },
    replies: (replies.results ?? []).map(reply => ({
      id: reply.id, body: reply.body, authorName: reply.author_name,
      staff: Boolean(reply.staff), createdAt: reply.created_at,
    })),
  }, 200, deps.respond)
}

async function addReply(request, env, user, deps, id, isStaff) {
  const parsed = await bodyJson(request)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  if (!validText(parsed.value?.body, 1, 6000)) return json(request, { error: 'Reply must be 1–6000 characters' }, 400, deps.respond)
  const ticket = await env.COMMUNITY_DB.prepare('SELECT * FROM community_tickets WHERE id = ?').bind(id).first()
  if (!ticket || (!isStaff && ticket.owner_id !== user.id)) return json(request, { error: 'Ticket not found' }, 404, deps.respond)
  if (ticket.status === 'closed') return json(request, { error: 'This ticket is closed' }, 409, deps.respond)
  const now = new Date().toISOString()
  const statements = [env.COMMUNITY_DB.prepare(
    'INSERT INTO community_replies (id, ticket_id, author_id, author_name, staff, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).bind(crypto.randomUUID(), id, user.id, user.globalName || user.username, isStaff ? 1 : 0, cleanText(parsed.value.body), now),
  env.COMMUNITY_DB.prepare('UPDATE community_tickets SET status = ?, updated_at = ? WHERE id = ?').bind(
    isStaff ? 'waiting' : 'open', now, id,
  )]
  if (isStaff) {
    statements.push(env.COMMUNITY_DB.prepare(
      `INSERT INTO community_notifications (id, recipient_id, title, body, kind, product_id, audience, link, created_at)
       VALUES (?, ?, ?, ?, 'ticket', ?, 'user', ?, ?)`,
    ).bind(crypto.randomUUID(), ticket.owner_id, `Reply to ${ticket.title}`, cleanText(parsed.value.body).slice(0, 500), ticket.product_id, `/account/tickets?ticket=${id}`, now))
  }
  await env.COMMUNITY_DB.batch(statements)
  return json(request, { ok: true }, 200, deps.respond)
}

async function preferences(request, env, user, deps) {
  if (request.method === 'GET') {
    const row = await env.COMMUNITY_DB.prepare('SELECT * FROM community_preferences WHERE user_id = ?').bind(user.id).first()
    let products = []
    try { products = row ? JSON.parse(row.products) : [] } catch { products = [] }
    return json(request, { preferences: row ? {
      updates: Boolean(row.updates), announcements: Boolean(row.announcements),
      ticketReplies: Boolean(row.ticket_replies), products,
    } : DEFAULT_PREFERENCES }, 200, deps.respond)
  }
  const parsed = await bodyJson(request, 3000)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  const value = parsed.value
  if (!value || typeof value.updates !== 'boolean' || typeof value.announcements !== 'boolean' ||
      typeof value.ticketReplies !== 'boolean' || !Array.isArray(value.products) ||
      value.products.length > 50 || value.products.some(product => typeof product !== 'string' || product.length > 100)) {
    return json(request, { error: 'Invalid notification preferences' }, 400, deps.respond)
  }
  const normalized = {
    updates: value.updates, announcements: value.announcements, ticketReplies: value.ticketReplies,
    products: [...new Set(value.products)],
  }
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO community_preferences (user_id, updates, announcements, ticket_replies, products)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET updates=excluded.updates, announcements=excluded.announcements,
       ticket_replies=excluded.ticket_replies, products=excluded.products`,
  ).bind(user.id, +normalized.updates, +normalized.announcements, +normalized.ticketReplies, JSON.stringify(normalized.products)).run()
  return json(request, { preferences: normalized }, 200, deps.respond)
}

async function notifications(request, env, url, user, deps, staff) {
  const page = parsePage(url)
  let where = ''
  let values = []
  if (!staff) {
    const saved = await env.COMMUNITY_DB.prepare('SELECT * FROM community_preferences WHERE user_id = ?').bind(user.id).first()
    let prefs = DEFAULT_PREFERENCES
    if (saved) {
      let products = []
      try { products = JSON.parse(saved.products) } catch { products = [] }
      prefs = { updates: Boolean(saved.updates), announcements: Boolean(saved.announcements), ticketReplies: Boolean(saved.ticket_replies), products }
    }
    const productSlots = prefs.products.length ? prefs.products.map(() => '?').join(',') : ''
    const productParams = prefs.products
    const allProductFilter = productSlots
      ? `(product_id IS NULL OR product_id IN (${productSlots}))`
      : '1 = 1'
    const targetedProductFilter = productSlots
      ? `product_id IN (${productSlots})`
      : 'product_id IS NOT NULL'
    where = `WHERE
      (audience = 'user' AND recipient_id = ? AND ? = 1) OR
      (audience = 'all' AND ((kind = 'update' AND ? = 1) OR (kind = 'announcement' AND ? = 1)) AND
        ${allProductFilter}) OR
      (audience = 'product' AND ((kind = 'update' AND ? = 1) OR (kind = 'announcement' AND ? = 1)) AND
        ${targetedProductFilter}) OR
      (audience = 'staff' AND ? = 1)`
    const isStaff = Boolean(await deps.getAdminRole(user.id, env))
    values = [
      user.id, +prefs.ticketReplies,
      +prefs.updates, +prefs.announcements, ...productParams,
      +prefs.updates, +prefs.announcements, ...productParams,
      +isStaff,
    ]
  }
  const result = await paginate(
    env.COMMUNITY_DB,
    `SELECT COUNT(*) AS total FROM community_notifications ${where}`,
    `SELECT * FROM community_notifications ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    values,
    page,
  )
  const selected = result.items
  const readRows = selected.length
    ? await env.COMMUNITY_DB.prepare(
      `SELECT notification_id FROM community_notification_reads WHERE user_id = ? AND notification_id IN (${selected.map(() => '?').join(',')})`,
    ).bind(user.id, ...selected.map(row => row.id)).all()
    : { results: [] }
  const readIds = new Set((readRows.results ?? []).map(row => row.notification_id))
  return json(request, {
    items: selected.map(row => notificationView(row, readIds.has(row.id), staff)),
    total: result.total, page: page.page, pageSize: page.pageSize,
  }, 200, deps.respond)
}

async function createNotification(request, env, user, deps) {
  const parsed = await bodyJson(request)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  const body = parsed.value ?? {}
  if (!validText(body.title, 3, 160) || !validText(body.body, 1, 6000) ||
      !['update', 'announcement'].includes(body.kind) || !['all', 'product', 'staff'].includes(body.audience) ||
      (body.audience === 'product' && !validText(body.productId, 1, 100)) ||
      (body.productId != null && !validText(body.productId, 1, 100))) {
    return json(request, { error: 'Invalid notification' }, 400, deps.respond)
  }
  const now = new Date().toISOString()
  const notification = {
    id: crypto.randomUUID(), title: cleanText(body.title), body: cleanText(body.body),
    kind: body.kind, product_id: body.productId ? cleanText(body.productId) : null,
    audience: body.audience, link: '/account/notifications', created_at: now,
  }
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO community_notifications (id, title, body, kind, product_id, audience, link, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(notification.id, notification.title, notification.body, notification.kind, notification.product_id, notification.audience, notification.link, now).run()
  return json(request, { notification: notificationView(notification, false, true) }, 201, deps.respond)
}

async function markRead(request, env, user, deps, id) {
  const row = await env.COMMUNITY_DB.prepare('SELECT * FROM community_notifications WHERE id = ?').bind(id).first()
  if (!row || (row.audience === 'user' && row.recipient_id !== user.id) ||
      (row.audience === 'staff' && !await deps.getAdminRole(user.id, env))) {
    return json(request, { error: 'Notification not found' }, 404, deps.respond)
  }
  await env.COMMUNITY_DB.prepare(
    'INSERT OR IGNORE INTO community_notification_reads (notification_id, user_id, read_at) VALUES (?, ?, ?)',
  ).bind(id, user.id, new Date().toISOString()).run()
  return json(request, { ok: true }, 200, deps.respond)
}

async function staffTickets(request, env, url, deps) {
  const page = parsePage(url)
  const status = url.searchParams.get('status') ?? 'all'
  if (!['all', 'open', 'waiting', 'closed'].includes(status)) return json(request, { error: 'Invalid ticket status' }, 400, deps.respond)
  const conditions = status === 'all' ? [] : ['status = ?']
  const values = status === 'all' ? [] : [status]
  const assigned = url.searchParams.get('assigned') || 'all'
  if (assigned === 'unassigned') conditions.push('assignee_id IS NULL')
  else if (assigned !== 'all') { conditions.push('assignee_id = ?'); values.push(assigned) }
  const label = url.searchParams.get('label')?.trim().toLowerCase()
  if (label) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(community_tickets.labels) WHERE value = ?)')
    values.push(label)
  }
  const filter = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
  const result = await paginate(
    env.COMMUNITY_DB,
    `SELECT COUNT(*) AS total FROM community_tickets${filter}`,
    `SELECT * FROM community_tickets${filter} ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
    values, page,
  )
  return json(request, { ...result, items: result.items.map(row => ticketView(row, true)) }, 200, deps.respond)
}

async function updateStaffTicket(request, env, deps, id, user) {
  const parsed = await bodyJson(request, 2000)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  if (!['open', 'waiting', 'closed'].includes(parsed.value?.status)) return json(request, { error: 'Invalid ticket status' }, 400, deps.respond)
  const row = await env.COMMUNITY_DB.prepare('SELECT * FROM community_tickets WHERE id = ?').bind(id).first()
  if (!row) return json(request, { error: 'Ticket not found' }, 404, deps.respond)
  const body = parsed.value
  const assigneeId = body.assigneeId === undefined ? row.assignee_id : body.assigneeId
  if (assigneeId !== null && (!/^\d{5,22}$/.test(assigneeId) || !(await deps.getStaffMembers(env)).some(member => member.id === assigneeId))) {
    return json(request, { error: 'Assign tickets only to an authorized staff account' }, 400, deps.respond)
  }
  const labels = body.labels === undefined ? JSON.parse(row.labels) : body.labels
  if (!Array.isArray(labels) || labels.length > 8 ||
      labels.some(label => !validText(label, 1, 30) || !/^[a-zA-Z0-9 _-]+$/.test(label))) {
    return json(request, { error: 'Use up to eight labels, each 1–30 letters, numbers, spaces, hyphens or underscores' }, 400, deps.respond)
  }
  const title = body.title === undefined ? row.title : body.title
  if (!validText(title, 3, 160)) return json(request, { error: 'Title must be 3–160 characters' }, 400, deps.respond)
  const assignedName = assigneeId === user.id ? user.globalName || user.username
    : assigneeId === row.assignee_id ? row.assignee_name : assigneeId ? 'Studio staff' : null
  const result = await env.COMMUNITY_DB.prepare(
    'UPDATE community_tickets SET status = ?, assignee_id = ?, assignee_name = ?, labels = ?, title = ?, updated_at = ? WHERE id = ?',
  ).bind(body.status, assigneeId, assignedName, JSON.stringify([...new Set(labels.map(label => label.trim().toLowerCase()))]),
    cleanText(title), new Date().toISOString(), id).run()
  return result.meta?.changes === 0 ? json(request, { error: 'Ticket not found' }, 404, deps.respond) : json(request, { ok: true }, 200, deps.respond)
}

async function editCustomerTicket(request, env, user, deps, id) {
  const row = await env.COMMUNITY_DB.prepare('SELECT * FROM community_tickets WHERE id = ?').bind(id).first()
  if (!row || row.owner_id !== user.id) return json(request, { error: 'Ticket not found' }, 404, deps.respond)
  if (row.status === 'closed') return json(request, { error: 'Ask staff to reopen this ticket before editing it' }, 409, deps.respond)
  const parsed = await bodyJson(request)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  if (parsed.value?.assigneeId !== undefined || parsed.value?.labels !== undefined || parsed.value?.status !== undefined) {
    return json(request, { error: 'Only staff can change ticket routing' }, 403, deps.respond)
  }
  if (!validText(parsed.value?.title, 3, 160) || !validText(parsed.value?.body, 5, 8000)) {
    return json(request, { error: 'Title must be 3–160 characters and details 5–8000 characters' }, 400, deps.respond)
  }
  const title = cleanText(parsed.value.title)
  const body = cleanText(parsed.value.body)
  const now = new Date().toISOString()
  const result = await env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare("UPDATE community_tickets SET title = ?, body = ?, updated_at = ? WHERE id = ? AND status != 'closed'")
      .bind(title, body, now, id),
    env.COMMUNITY_DB.prepare(
      `UPDATE community_issues SET title = ?, body = ?, updated_at = ?
       WHERE id = ? AND owner_id = ? AND published = 0
       AND EXISTS (SELECT 1 FROM community_tickets WHERE id = ? AND status != 'closed')`,
    ).bind(title, body, now, id, user.id, id),
  ])
  return result[0].meta?.changes
    ? json(request, { ok: true }, 200, deps.respond)
    : json(request, { error: 'This ticket was closed before your edit could be saved' }, 409, deps.respond)
}

async function staffIssues(request, env, url, deps) {
  const page = parsePage(url)
  const result = await paginate(
    env.COMMUNITY_DB,
    'SELECT COUNT(*) AS total FROM community_issues',
    'SELECT * FROM community_issues ORDER BY updated_at DESC LIMIT ? OFFSET ?',
    [], page,
  )
  return json(request, { ...result, items: result.items.map(issueView) }, 200, deps.respond)
}

async function saveIssue(request, env, deps, id = crypto.randomUUID()) {
  const parsed = await bodyJson(request)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  const body = parsed.value ?? {}
  if (!validText(body.title, 3, 160) || !validText(body.body, 5, 8000) ||
      !['open', 'investigating', 'resolved'].includes(body.status) || typeof body.published !== 'boolean' ||
      (body.productId != null && !validText(body.productId, 1, 100))) {
    return json(request, { error: 'Invalid issue' }, 400, deps.respond)
  }
  const now = new Date().toISOString()
  const productId = body.productId ? cleanText(body.productId) : null
  if (request.method === 'POST') {
    await env.COMMUNITY_DB.prepare(
      `INSERT INTO community_issues (id, owner_id, title, body, product_id, status, published, created_at, updated_at)
       VALUES (?, '', ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, cleanText(body.title), cleanText(body.body), productId, body.status, +body.published, now, now).run()
  } else {
    const result = await env.COMMUNITY_DB.prepare(
      'UPDATE community_issues SET title = ?, body = ?, product_id = ?, status = ?, published = ?, updated_at = ? WHERE id = ?',
    ).bind(cleanText(body.title), cleanText(body.body), productId, body.status, +body.published, now, id).run()
    if (result.meta?.changes === 0) return json(request, { error: 'Issue not found' }, 404, deps.respond)
  }
  const issue = { id, title: cleanText(body.title), body: cleanText(body.body), product_id: productId, status: body.status, created_at: now, updated_at: now }
  return request.method === 'POST'
    ? json(request, { issue: issueView(issue) }, 201, deps.respond)
    : json(request, { ok: true }, 200, deps.respond)
}

async function statusResponse(request, env, deps) {
  const statuses = await env.COMMUNITY_DB.prepare('SELECT * FROM community_service_status').all()
  const rows = new Map((statuses.results ?? []).map(row => [row.service_id, row]))
  const services = SERVICES.map(service => {
    const row = rows.get(service.id)
    const automaticStatus = row?.automatic_status ?? 'unknown'
    return {
      ...service,
      status: row?.override_status ?? automaticStatus,
      automaticStatus,
      overrideStatus: row?.override_status ?? null,
      message: row?.override_status ? row.override_message : '',
      checkedAt: row?.checked_at ?? null,
    }
  })
  return json(request, { services, intervalMinutes: 5 }, 200, deps.respond)
}

async function updateStatus(request, env, deps, id) {
  if (!SERVICES.some(service => service.id === id)) return json(request, { error: 'Unknown service' }, 404, deps.respond)
  const parsed = await bodyJson(request, 2000)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  const { status, message = '' } = parsed.value ?? {}
  if (status !== 'auto' && !STATUS_VALUES.has(status)) return json(request, { error: 'Invalid service status' }, 400, deps.respond)
  if (!validText(message, 0, 500)) return json(request, { error: 'Status message must be at most 500 characters' }, 400, deps.respond)
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO community_service_status (service_id, automatic_status, override_status, override_message, checked_at)
     VALUES (?, 'unknown', ?, ?, NULL)
     ON CONFLICT(service_id) DO UPDATE SET override_status = excluded.override_status, override_message = excluded.override_message`,
  ).bind(id, status === 'auto' ? null : status, status === 'auto' ? '' : cleanText(message)).run()
  return json(request, { ok: true }, 200, deps.respond)
}

async function checkedStatus(url, options = {}) {
  const response = await fetch(url, { redirect: options.redirect ?? 'follow', signal: AbortSignal.timeout(6000), ...options })
  if (response.status < 200 || response.status >= 400) return 'outage'
  if (options.discord) {
    const location = response.headers.get('location')
    if (response.status !== 302 || !location) return 'degraded'
    try {
      const target = new URL(location)
      return target.origin === 'https://discord.com' && target.pathname === '/oauth2/authorize' ? 'operational' : 'degraded'
    } catch { return 'degraded' }
  }
  const reader = response.body?.getReader()
  if (!reader) return 'degraded'
  let bytes = 0
  const chunks = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    if (bytes > 16000) {
      await reader.cancel()
      return 'degraded'
    }
    chunks.push(value)
  }
  const pathname = new URL(url).pathname
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
  if (pathname === '/v1/admin/products') {
    if (!contentType.includes('json')) return 'degraded'
    try {
      const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
      const body = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length }
      const payload = JSON.parse(new TextDecoder().decode(body))
      if (!payload || typeof payload !== 'object') return 'degraded'
    } catch { return 'degraded' }
  } else if (pathname === '/') {
    const length = chunks.reduce((total, chunk) => total + chunk.length, 0)
    if (!contentType.includes('text/html') || length === 0) return 'degraded'
  }
  return 'operational'
}

export async function runCommunityChecks(env) {
  if (env.COMMUNITY_DB && env.DISCORD_BUG_REPORT_WEBHOOK) {
    await env.COMMUNITY_DB.prepare(
      `UPDATE community_ticket_alerts SET state = 'failed', last_error = 'Previous delivery status is unknown. Check Discord before retrying.'
       WHERE state = 'sending' AND attempts >= 5 AND updated_at < ?`,
    ).bind(new Date(Date.now() - 5 * 60000).toISOString()).run()
    const pending = await env.COMMUNITY_DB.prepare(
      "SELECT ticket_id FROM community_ticket_alerts WHERE state IN ('pending', 'sending') AND attempts < 5 ORDER BY updated_at LIMIT 20",
    ).all()
    for (const alert of pending.results ?? []) await deliverTicketAlert(env, alert.ticket_id)
  }
  if (!env.COMMUNITY_DB) throw new Error('COMMUNITY_DB is not configured')
  const results = {}
  try { results.website = await checkedStatus('https://lumenstudio.fyi/', { headers: { Accept: 'text/html' } }) }
  catch { results.website = 'outage' }
  try {
    results.discord = await checkedStatus('https://lumen-docs-assistant.lumennetwork0.workers.dev/auth/login', {
      redirect: 'manual', discord: true,
    })
  } catch { results.discord = 'outage' }
  if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) {
    results.licensing = 'unknown'
  } else {
    try {
      const base = new URL(env.LICENSE_API_URL)
      if (base.protocol !== 'https:' || base.username || base.password) throw new Error('invalid')
      results.licensing = await checkedStatus(new URL('/v1/admin/products?limit=1', base), {
        headers: { Authorization: `Bearer ${env.LICENSE_ADMIN_API_TOKEN}`, Accept: 'application/json' },
      })
    } catch { results.licensing = 'outage' }
  }
  const checkedAt = new Date().toISOString()
  for (const service of SERVICES) {
    await env.COMMUNITY_DB.prepare(
      `INSERT INTO community_service_status (service_id, automatic_status, checked_at)
       VALUES (?, ?, ?)
       ON CONFLICT(service_id) DO UPDATE SET automatic_status = excluded.automatic_status, checked_at = excluded.checked_at`,
    ).bind(service.id, results[service.id], checkedAt).run()
  }
  return { services: results, checkedAt }
}

const FORUM_CHANNELS = new Set(['announcements', 'general', 'help', 'bugs', 'suggestions', 'showcase'])
const FORUM_STATUSES = new Set(['open', 'answered', 'resolved'])
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

function threadView(row, staff = false, viewerId = null) {
  return {
    id: row.id,
    channel: row.channel,
    title: row.title,
    body: row.body,
    productId: row.product_id,
    status: row.status,
    pinned: Boolean(row.pinned),
    locked: Boolean(row.locked),
    replyCount: Number(row.reply_count ?? 0),
    author: { name: row.author_name, staff: Boolean(row.author_staff) },
    mine: Boolean(viewerId && row.author_id === viewerId),
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
    ...(staff ? { hidden: Boolean(row.hidden) } : {}),
  }
}

function postView(row, staff = false) {
  return {
    id: row.id,
    body: row.body,
    authorName: row.author_name,
    staff: Boolean(row.staff),
    createdAt: row.created_at,
    ...(staff ? { hidden: Boolean(row.hidden) } : {}),
  }
}

async function forumList(request, env, url, deps, staff, viewerId, canAnnounce = false) {
  const page = parsePage(url)
  const filters = staff ? [] : ['hidden = 0']
  const values = []
  const channel = url.searchParams.get('channel')
  if (channel && channel !== 'all') {
    if (!FORUM_CHANNELS.has(channel)) return json(request, { error: 'Unknown channel' }, 400, deps.respond)
    filters.push('channel = ?')
    values.push(channel)
  }
  const status = url.searchParams.get('status')
  if (status && status !== 'all') {
    if (!FORUM_STATUSES.has(status)) return json(request, { error: 'Unknown status' }, 400, deps.respond)
    filters.push('status = ?')
    values.push(status)
  }
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100)
  if (query) {
    const pattern = `%${query.replace(/[\\%_]/g, match => `\\${match}`)}%`
    filters.push("(title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\' OR product_id LIKE ? ESCAPE '\\')")
    values.push(pattern, pattern, pattern)
  }
  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : ''
  const result = await paginate(
    env.COMMUNITY_DB,
    `SELECT COUNT(*) AS total FROM community_threads ${where}`,
    `SELECT * FROM community_threads ${where} ORDER BY pinned DESC, last_activity_at DESC LIMIT ? OFFSET ?`,
    values,
    page,
  )
  return json(request, {
    ...result, items: result.items.map(row => threadView(row, staff, viewerId)), viewer: { signedIn: Boolean(viewerId), staff, canAnnounce },
  }, 200, deps.respond)
}

async function forumThread(request, env, deps, id, staff, viewerId, canAnnounce = false) {
  const row = await env.COMMUNITY_DB.prepare('SELECT * FROM community_threads WHERE id = ?').bind(id).first()
  if (!row || (row.hidden && !staff)) return json(request, { error: 'Thread not found' }, 404, deps.respond)
  const posts = await env.COMMUNITY_DB.prepare(
    `SELECT * FROM community_thread_posts WHERE thread_id = ? ${staff ? '' : 'AND hidden = 0'} ORDER BY created_at ASC LIMIT 500`,
  ).bind(id).all()
  return json(request, {
    thread: threadView(row, staff, viewerId),
    posts: (posts.results ?? []).map(post => postView(post, staff)),
    viewer: { signedIn: Boolean(viewerId), staff, canAnnounce },
  }, 200, deps.respond)
}

async function createThread(request, env, user, access, deps) {
  const canModerate = hasPermission(access, 'dashboard.view') && hasPermission(access, 'forum.moderate')
  const { settings } = await siteSettings(env)
  if (!settings.forumOpen && !canModerate) return json(request, { error: settings.forumClosedMessage }, 503, deps.respond)
  const parsed = await bodyJson(request)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  const input = parsed.value ?? {}
  if (!FORUM_CHANNELS.has(input.channel)) return json(request, { error: 'Choose a valid channel' }, 400, deps.respond)
  if (input.channel === 'announcements' && !(hasPermission(access, 'dashboard.view') && hasPermission(access, 'forum.announce'))) {
    return json(request, { error: 'Only staff can post announcements' }, 403, deps.respond)
  }
  if (!validText(input.title, 3, 160) || !validText(input.body, 2, 8000) ||
      (input.productId != null && input.productId !== '' && !validText(input.productId, 1, 100))) {
    return json(request, { error: 'Title must be 3–160 characters and the message 2–8000 characters' }, 400, deps.respond)
  }
  const now = new Date().toISOString()
  const row = {
    id: crypto.randomUUID(), channel: input.channel, author_id: user.id, author_name: user.globalName || user.username,
    author_staff: hasPermission(access, 'dashboard.view') ? 1 : 0, title: cleanText(input.title), body: cleanText(input.body),
    product_id: input.productId ? cleanText(input.productId) : null, status: 'open', pinned: 0, locked: 0, hidden: 0,
    reply_count: 0, created_at: now, updated_at: now, last_activity_at: now,
  }
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO community_threads
      (id, channel, author_id, author_name, author_staff, title, body, product_id, created_at, updated_at, last_activity_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(row.id, row.channel, row.author_id, row.author_name, row.author_staff, row.title, row.body, row.product_id, now, now, now).run()
  return json(request, { thread: threadView(row, canModerate, user.id) }, 201, deps.respond)
}

async function createPost(request, env, user, access, deps, id) {
  const canModerate = hasPermission(access, 'dashboard.view') && hasPermission(access, 'forum.moderate')
  const { settings } = await siteSettings(env)
  if (!settings.forumOpen && !canModerate) return json(request, { error: settings.forumClosedMessage }, 503, deps.respond)
  const parsed = await bodyJson(request)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  if (!validText(parsed.value?.body, 1, 4000)) {
    return json(request, { error: 'Replies must be 1–4000 characters' }, 400, deps.respond)
  }
  const thread = await env.COMMUNITY_DB.prepare('SELECT * FROM community_threads WHERE id = ?').bind(id).first()
  if (!thread || (thread.hidden && !canModerate)) return json(request, { error: 'Thread not found' }, 404, deps.respond)
  if (thread.locked && !canModerate) return json(request, { error: 'This thread is locked' }, 409, deps.respond)
  const now = new Date().toISOString()
  const post = {
    id: crypto.randomUUID(), author_name: user.globalName || user.username, staff: hasPermission(access, 'dashboard.view') ? 1 : 0,
    body: cleanText(parsed.value.body), hidden: 0, created_at: now,
  }
  await env.COMMUNITY_DB.batch([
    env.COMMUNITY_DB.prepare(
      `INSERT INTO community_thread_posts (id, thread_id, author_id, author_name, staff, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).bind(post.id, id, user.id, post.author_name, post.staff, post.body, now),
    env.COMMUNITY_DB.prepare(
      `UPDATE community_threads SET reply_count = reply_count + 1, last_activity_at = ?, updated_at = ?,
       status = CASE WHEN ? = 1 AND status = 'open' THEN 'answered' ELSE status END WHERE id = ?`,
    ).bind(now, now, post.staff, id),
  ])
  return json(request, { post: postView(post, canModerate) }, 201, deps.respond)
}

async function updateOwnThread(request, env, user, deps, id) {
  const parsed = await bodyJson(request, 2000)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  if (!['open', 'resolved'].includes(parsed.value?.status)) {
    return json(request, { error: 'You can mark your thread open or resolved' }, 400, deps.respond)
  }
  const result = await env.COMMUNITY_DB.prepare(
    'UPDATE community_threads SET status = ?, updated_at = ? WHERE id = ? AND author_id = ? AND hidden = 0',
  ).bind(parsed.value.status, new Date().toISOString(), id, user.id).run()
  if (!result.meta?.changes) return json(request, { error: 'Thread not found' }, 404, deps.respond)
  return json(request, { ok: true }, 200, deps.respond)
}

async function moderateThread(request, env, deps, id, access) {
  const parsed = await bodyJson(request, 2000)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  const input = parsed.value ?? {}
  const sets = []
  const values = []
  for (const key of ['pinned', 'locked', 'hidden']) {
    if (input[key] === undefined) continue
    if (typeof input[key] !== 'boolean') return json(request, { error: `${key} must be true or false` }, 400, deps.respond)
    sets.push(`${key} = ?`)
    values.push(input[key] ? 1 : 0)
  }
  if (input.status !== undefined) {
    if (!FORUM_STATUSES.has(input.status)) return json(request, { error: 'Choose a valid status' }, 400, deps.respond)
    sets.push('status = ?')
    values.push(input.status)
  }
  if (input.channel !== undefined) {
    if (input.channel === 'announcements' && !hasPermission(access, 'forum.announce')) {
      return json(request, { error: 'Permission required: forum.announce' }, 403, deps.respond)
    }
    if (!FORUM_CHANNELS.has(input.channel)) return json(request, { error: 'Choose a valid channel' }, 400, deps.respond)
    sets.push('channel = ?')
    values.push(input.channel)
  }
  if (!sets.length) return json(request, { error: 'Nothing to update' }, 400, deps.respond)
  const result = await env.COMMUNITY_DB.prepare(
    `UPDATE community_threads SET ${sets.join(', ')}, updated_at = ? WHERE id = ?`,
  ).bind(...values, new Date().toISOString(), id).run()
  if (!result.meta?.changes) return json(request, { error: 'Thread not found' }, 404, deps.respond)
  return json(request, { ok: true }, 200, deps.respond)
}

async function moderatePost(request, env, deps, id) {
  const parsed = await bodyJson(request, 2000)
  if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
  if (typeof parsed.value?.hidden !== 'boolean') return json(request, { error: 'hidden must be true or false' }, 400, deps.respond)
  const post = await env.COMMUNITY_DB.prepare('SELECT thread_id, hidden FROM community_thread_posts WHERE id = ?').bind(id).first()
  if (!post) return json(request, { error: 'Post not found' }, 404, deps.respond)
  if (Boolean(post.hidden) !== parsed.value.hidden) {
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare('UPDATE community_thread_posts SET hidden = ? WHERE id = ?').bind(parsed.value.hidden ? 1 : 0, id),
      env.COMMUNITY_DB.prepare('UPDATE community_threads SET reply_count = MAX(0, reply_count + ?) WHERE id = ?')
        .bind(parsed.value.hidden ? -1 : 1, post.thread_id),
    ])
  }
  return json(request, { ok: true }, 200, deps.respond)
}

export async function handleCommunity(request, env, origin, path, deps) {
  const legacyAlias = path === '/bug-report' || path === '/reports'
  if (!path.startsWith('/community') && !legacyAlias) return null
  if (legacyAlias && request.method !== 'POST') {
    return json(request, { error: 'Method not allowed' }, 405, deps.respond)
  }
  const url = new URL(request.url)
  const suffix = legacyAlias ? path : path.slice('/community'.length) || '/'
  const threadMatch = suffix.match(new RegExp(`^/forum/(${UUID})$`, 'i'))
  const isPublic = !legacyAlias && request.method === 'GET' &&
    (suffix === '/status' || suffix === '/issues' || suffix === '/forum' || Boolean(threadMatch))
  if (isPublic) {
    const authorization = request.headers.get('Authorization') || ''
    const viewer = authorization.startsWith('Bearer ') ? await deps.verifyLoginToken(authorization.slice(7), env) : null
    const viewerAccess = viewer ? await resolveAccess(viewer.id, env) : null
    const viewerStaff = Boolean(viewerAccess && hasPermission(viewerAccess, 'dashboard.view') && hasPermission(viewerAccess, 'forum.moderate'))
    const canAnnounce = Boolean(viewerAccess && hasPermission(viewerAccess, 'dashboard.view') && hasPermission(viewerAccess, 'forum.announce'))
    const dbFailure = await requireDb(request, env, deps, viewerStaff)
    if (dbFailure) return dbFailure
    try {
      if (suffix === '/forum') return await forumList(request, env, url, deps, viewerStaff, viewer?.id, canAnnounce)
      if (threadMatch) return await forumThread(request, env, deps, threadMatch[1], viewerStaff, viewer?.id, canAnnounce)
      return suffix === '/status' ? await statusResponse(request, env, deps) : await issueList(request, env, url, deps)
    } catch {
      return json(request, { error: 'The community database is temporarily unavailable' }, 503, deps.respond)
    }
  }

  const staffPath = suffix.startsWith('/staff/')
  const auth = await session(request, env, deps, staffPath)
  if (auth.response) return auth.response
  const { user, role, access } = auth
  const dbFailure = await requireDb(request, env, deps, Boolean(role))
  if (dbFailure) return dbFailure
  const privateResponse = await limit(request, env, user, deps)
  if (privateResponse) return privateResponse
  if (staffPath) {
    const permission = suffix === '/staff/members' || suffix === '/staff/tickets' && request.method === 'GET' ? 'tickets.view'
      : /^\/staff\/tickets\/[^/]+\/alert$/.test(suffix) ? 'tickets.alerts'
        : suffix.startsWith('/staff/tickets/') ? 'tickets.manage'
          : suffix.startsWith('/staff/issues') ? 'issues.manage'
            : suffix.startsWith('/staff/forum/') ? 'forum.moderate'
              : suffix.startsWith('/staff/notifications') ? 'notifications.manage'
                : suffix.startsWith('/staff/status/') ? 'status.manage' : null
    if (!permission) return json(request, { error: 'Staff route not found' }, 404, deps.respond)
    if (!hasPermission(access, permission)) return json(request, { error: `Permission required: ${permission}` }, 403, deps.respond)
  }

  try {
    if (legacyAlias) {
      const parsed = await bodyJson(request, 8000)
      if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
      const legacy = parsed.value ?? {}
      const type = legacyAlias && path === '/bug-report' ? 'bug' : legacy.type ?? 'bug'
      if (!['bug', 'compatibility', 'feature'].includes(type)) {
        return json(request, { error: 'Choose a valid report type' }, 400, deps.respond)
      }
      const plugin = typeof legacy.plugin === 'string' ? legacy.plugin.trim() : ''
      const serverSoftware = typeof legacy.serverSoftware === 'string' ? legacy.serverSoftware.trim() : ''
      const minecraftVersion = typeof legacy.version === 'string'
        ? legacy.version.trim()
        : typeof legacy.minecraftVersion === 'string' ? legacy.minecraftVersion.trim() : ''
      const description = typeof legacy.description === 'string'
        ? legacy.description.trim()
        : typeof legacy.body === 'string' ? legacy.body.trim() : ''
      const title = type === 'feature'
        ? (typeof legacy.title === 'string' ? legacy.title.trim() : '')
        : (typeof legacy.title === 'string' && legacy.title.trim()
          ? legacy.title.trim()
          : `${type === 'compatibility' ? 'Compatibility report' : 'Bug report'}${plugin ? `: ${plugin}` : ''}`)
      const status = typeof legacy.status === 'string' ? legacy.status.trim() : ''
      const suppliedProductId = typeof legacy.productId === 'string' ? legacy.productId.trim() : ''
      if (type !== 'feature' && !plugin) {
        return json(request, { error: 'A plugin is required' }, 400, deps.respond)
      }
      if (type !== 'feature' && (!serverSoftware || !minecraftVersion)) {
        return json(request, { error: 'Server software and Minecraft version are required' }, 400, deps.respond)
      }
      if (type === 'compatibility' && !['untested', 'broken', 'partial', 'working'].includes(status)) {
        return json(request, { error: 'Choose a valid compatibility status' }, 400, deps.respond)
      }
      if (!description || (type === 'feature' && !title)) {
        return json(request, { error: 'A title and description are required' }, 400, deps.respond)
      }
      const details = [
        `Product: ${plugin || suppliedProductId || 'Not specified'}`,
        serverSoftware ? `Server software: ${serverSoftware}` : '',
        minecraftVersion ? `Minecraft version: ${minecraftVersion}` : '',
        status ? `Compatibility result: ${status}` : '',
        typeof legacy.consoleLog === 'string' && legacy.consoleLog.trim()
          ? `Console log:\n${legacy.consoleLog.trim().slice(0, 2000)}` : '',
        `Details:\n${description}`,
      ].filter(Boolean).join('\n\n')
      const ticket = await createTicket(request, env, user, deps, {
        type,
        title,
        body: details.slice(0, 8000),
        productId: suppliedProductId || plugin || undefined,
        serverSoftware: serverSoftware || undefined,
        minecraftVersion: minecraftVersion || undefined,
      })
      return ticket instanceof Response ? ticket : json(request, { ticket }, 201, deps.respond)
    }

    if (suffix === '/tickets' && request.method === 'GET') return await tickets(request, env, url, user, deps)
    if (suffix === '/tickets' && request.method === 'POST') {
      const parsed = await bodyJson(request)
      if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
      const ticket = await createTicket(request, env, user, deps, parsed.value)
      return ticket instanceof Response ? ticket : json(request, { ticket }, 201, deps.respond)
    }
    if (suffix === '/issues' && request.method === 'POST') {
      const { settings } = await siteSettings(env)
      if (!settings.supportOpen && !hasPermission(access, 'tickets.manage')) {
        return json(request, { error: settings.supportClosedMessage, code: 'SUPPORT_PAUSED' }, 503, deps.respond)
      }
      const parsed = await bodyJson(request)
      if (parsed.error) return json(request, { error: parsed.error }, parsed.status, deps.respond)
      const issue = parsed.value ?? {}
      if (!validText(issue.title, 3, 160) || !validText(issue.body, 5, 8000) ||
          (issue.productId != null && !validText(issue.productId, 1, 100))) {
        return json(request, { error: 'Invalid issue submission' }, 400, deps.respond)
      }
      const now = new Date().toISOString()
      const submissionId = crypto.randomUUID()
      const productId = issue.productId ? cleanText(issue.productId) : null
      await env.COMMUNITY_DB.batch([
        env.COMMUNITY_DB.prepare(
          `INSERT INTO community_tickets
            (id, owner_id, owner_name, type, title, body, product_id, status, created_at, updated_at)
           VALUES (?, ?, ?, 'bug', ?, ?, ?, 'open', ?, ?)`,
        ).bind(
          submissionId, user.id, user.globalName || user.username, cleanText(issue.title),
          cleanText(issue.body), productId, now, now,
        ),
        env.COMMUNITY_DB.prepare(
        `INSERT INTO community_issues (id, owner_id, title, body, product_id, status, published, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'open', 0, ?, ?)`,
        ).bind(submissionId, user.id, cleanText(issue.title), cleanText(issue.body), productId, now, now),
        alertStatement(env, submissionId, now),
      ])
      const alertDelivery = await deliverTicketAlert(env, submissionId)
      return json(request, { submissionId, ...(role ? { alertDelivery } : {}), message: 'Your report was submitted for staff review.' }, 201, deps.respond)
    }
    let match = suffix.match(/^\/tickets\/([0-9a-f-]{36})(?:\/(replies))?$/i)
    if (match) {
      if (request.method === 'GET' && !match[2]) return ticketDetail(request, env, user, deps, match[1], hasPermission(access, 'tickets.view'))
      if (request.method === 'PUT' && !match[2]) return editCustomerTicket(request, env, user, deps, match[1])
      if (request.method === 'POST' && match[2]) return addReply(request, env, user, deps, match[1], hasPermission(access, 'tickets.view') && hasPermission(access, 'tickets.reply'))
    }
    if (suffix === '/preferences' && ['GET', 'PUT'].includes(request.method)) return preferences(request, env, user, deps)
    if (suffix === '/notifications' && request.method === 'GET') return notifications(request, env, url, user, deps, false)
    match = suffix.match(/^\/notifications\/([0-9a-f-]{36})\/read$/i)
    if (match && request.method === 'POST') return markRead(request, env, user, deps, match[1])
    if (suffix === '/staff/tickets' && request.method === 'GET') return staffTickets(request, env, url, deps)
    if (suffix === '/staff/members' && request.method === 'GET') return json(request, {
      currentStaffId: user.id,
      members: (await deps.getStaffMembers(env)).map(member => ({
        ...member, name: member.id === user.id ? user.globalName || user.username : member.name,
      })),
    }, 200, deps.respond)
    match = suffix.match(/^\/staff\/tickets\/([0-9a-f-]{36})\/alert$/i)
    if (match && request.method === 'POST') {
      const existing = await env.COMMUNITY_DB.prepare(
        'SELECT state FROM community_ticket_alerts WHERE ticket_id = ?',
      ).bind(match[1]).first()
      if (!existing) return json(request, { error: 'Ticket alert not found' }, 404, deps.respond)
      if (existing.state === 'sent' || existing.state === 'sending') {
        return json(request, { error: 'This alert has already been sent or is being delivered' }, 409, deps.respond)
      }
      await env.COMMUNITY_DB.prepare(
        "UPDATE community_ticket_alerts SET state = 'pending', attempts = 0 WHERE ticket_id = ?",
      ).bind(match[1]).run()
      return json(request, { alertDelivery: await deliverTicketAlert(env, match[1]) }, 200, deps.respond)
    }
    match = suffix.match(/^\/staff\/tickets\/([0-9a-f-]{36})$/i)
    if (match && request.method === 'PUT') return updateStaffTicket(request, env, deps, match[1], user)
    if (suffix === '/staff/issues' && request.method === 'GET') return staffIssues(request, env, url, deps)
    if (suffix === '/staff/issues' && request.method === 'POST') return saveIssue(request, env, deps)
    match = suffix.match(/^\/staff\/issues\/([0-9a-f-]{36})$/i)
    if (match && request.method === 'PUT') return saveIssue(request, env, deps, match[1])
    if (suffix === '/forum' && request.method === 'POST') return createThread(request, env, user, access, deps)
    match = suffix.match(new RegExp(`^/forum/(${UUID})(?:/(posts))?$`, 'i'))
    if (match && request.method === 'POST' && match[2]) return createPost(request, env, user, access, deps, match[1])
    if (match && request.method === 'PUT' && !match[2]) return updateOwnThread(request, env, user, deps, match[1])
    match = suffix.match(new RegExp(`^/staff/forum/(${UUID})$`, 'i'))
    if (match && request.method === 'PUT') return moderateThread(request, env, deps, match[1], access)
    match = suffix.match(new RegExp(`^/staff/forum/posts/(${UUID})$`, 'i'))
    if (match && request.method === 'PUT') return moderatePost(request, env, deps, match[1])
    if (suffix === '/staff/notifications' && request.method === 'GET') return notifications(request, env, url, user, deps, true)
    if (suffix === '/staff/notifications' && request.method === 'POST') return createNotification(request, env, user, deps)
    match = suffix.match(/^\/staff\/status\/([a-z]+)$/)
    if (match && request.method === 'PUT') return updateStatus(request, env, deps, match[1])
    if (suffix === '/staff/status/check' && request.method === 'POST') {
      const result = await runCommunityChecks(env)
      return json(request, { ok: true, checkedAt: result.checkedAt }, 200, deps.respond)
    }
    return json(request, { error: 'Community route or method not found' }, 404, deps.respond)
  } catch (error) {
    console.error('Community request failed:', error)
    return json(request, { error: 'The community service is temporarily unavailable' }, 503, deps.respond)
  }
}
