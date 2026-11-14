import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import worker from '../worker/chat.js'
import { ROLES } from '../shared/permissions.mjs'

const origin = 'https://lumenstudio.fyi'
const staffId = '1400375985211441242'
const customerId = '123456789012345678'
const secret = 'community-test-signing-key-that-is-long-enough'
const batchData = Symbol('d1 batch data')

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function tokenFor(id, name) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: 'lumen-studios', aud: 'lumen-docs', sub: id, username: name, globalName: name,
    iat: now, exp: now + 3600,
  })}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`
}

function createD1() {
  const sqlite = new DatabaseSync(':memory:')
  const migrations = Promise.all(['0001_community.sql', '0002_ticket_routing.sql', '0003_community_forum.sql', '0004_website_access.sql'].map(
    name => readFile(new URL(`../worker/migrations/community/${name}`, import.meta.url), 'utf8'),
  ))
  const database = {
    sqlite,
    ready: migrations.then(sqls => sqls.forEach(sql => sqlite.exec(sql))),
    failBatchAt: null,
    prepare(query) {
      let params = []
      const statement = {
        bind(...values) { params = values; return statement },
        async first() { await thisReady; return sqlite.prepare(query).get(...params) ?? null },
        async all() { await thisReady; return { results: sqlite.prepare(query).all(...params) } },
        async run() {
          await thisReady
          const result = sqlite.prepare(query).run(...params)
          return { meta: { changes: Number(result.changes) } }
        },
      }
      statement[batchData] = () => ({ query, params })
      const thisReady = this.ready
      return statement
    },
    async batch(statements) {
      await this.ready
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const [index, statement] of statements.entries()) {
          if (this.failBatchAt === index) throw new Error('Injected D1 batch failure')
          const { query, params } = statement[batchData]()
          const result = sqlite.prepare(query).run(...params)
          results.push({ meta: { changes: Number(result.changes) } })
        }
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  return database
}

const database = createD1()
const env = {
  ALLOWED_ORIGIN: origin,
  AUTH_SIGNING_SECRET: secret,
  ASSISTANT_LIMITER: { limit: async () => ({ success: true }) },
  COMMUNITY_DB: database,
}

function request(path, method = 'GET', body, token) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: {
      Origin: origin,
      'CF-Connecting-IP': '203.0.113.10',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

async function call(path, method, body, token) {
  return worker.fetch(request(path, method, body, token), env)
}

async function accessFixture(t) {
  const db = createD1()
  await db.ready
  t.after(() => db.sqlite.close())
  const config = { ...env, COMMUNITY_DB: db, LICENSE_API_URL: 'https://licenses.example', LICENSE_ADMIN_API_TOKEN: 'server-only-secret' }
  const owner = await tokenFor(staffId, 'Owner')
  const api = (path, method = 'GET', body, token = owner) => worker.fetch(request(path, method, body, token), config)
  async function assign(id, role, token = owner) {
    const revision = db.sqlite.prepare('SELECT revision FROM website_members WHERE discord_id = ?').get(id)?.revision || 0
    return api(`/admin/website/members/${id}/role`, 'PUT', { role, revision }, token)
  }
  return { db, config, owner, api, assign }
}

test('community routes require configured persistent storage and valid sign-in', async () => {
  await database.ready
  const customer = await tokenFor(customerId, 'Customer')
  const unavailable = await worker.fetch(request('/community/tickets', 'GET', undefined, customer), { ...env, COMMUNITY_DB: undefined })
  assert.equal(unavailable.status, 503)
  const unauthorized = await call('/community/tickets', 'GET')
  assert.equal(unauthorized.status, 401)

  const otherOrigin = await worker.fetch(new Request('https://worker.example/community/status', {
    headers: { Origin: 'https://attacker.example' },
  }), env)
  assert.equal(otherOrigin.status, 403)
})

test('customers can only view their tickets and ticket lifecycle/replies persist', async () => {
  const customer = await tokenFor(customerId, 'Customer')
  const other = await tokenFor('123456789012345679', 'Other')
  const created = await call('/community/tickets', 'POST', {
    type: 'support', title: 'Help with setup', body: 'I need help with the plugin setup.',
  }, customer)
  assert.equal(created.status, 201)
  const createdPayload = await created.json()
  assert.deepEqual(Object.keys(createdPayload), ['ticket'])
  assert.equal(createdPayload.ticket.customerName, 'Customer')
  const id = createdPayload.ticket.id
  const hidden = await call(`/community/tickets/${id}`, 'GET', undefined, other)
  assert.equal(hidden.status, 404)
  const forbiddenReply = await call(`/community/tickets/${id}/replies`, 'POST', { body: 'I am not the owner.' }, other)
  assert.equal(forbiddenReply.status, 404)

  const staff = await tokenFor(staffId, 'Staff')
  const staffList = await call('/community/staff/tickets', 'GET', undefined, staff)
  assert.equal((await staffList.json()).items[0].customerDiscordId, customerId)
  database.failBatchAt = 2
  const rolledBackReply = await call(`/community/tickets/${id}/replies`, 'POST', {
    body: 'This save will fail atomically.',
  }, staff)
  database.failBatchAt = null
  assert.equal(rolledBackReply.status, 503)
  const unchanged = await call(`/community/tickets/${id}`, 'GET', undefined, customer)
  const unchangedPayload = await unchanged.json()
  assert.equal(unchangedPayload.ticket.status, 'open')
  assert.deepEqual(unchangedPayload.replies, [])

  const reply = await call(`/community/tickets/${id}/replies`, 'POST', { body: 'Please share your server log.' }, staff)
  assert.equal(reply.status, 200)
  const detail = await call(`/community/tickets/${id}`, 'GET', undefined, customer)
  const payload = await detail.json()
  assert.equal(payload.ticket.status, 'waiting')
  assert.equal(payload.replies[0].staff, true)
  assert.equal('customerDiscordId' in payload.ticket, false)
  const notification = await call('/community/notifications', 'GET', undefined, customer)
  const ticketNotification = (await notification.json()).items[0]
  assert.equal(ticketNotification.kind, 'ticket')
  assert.equal(ticketNotification.link, `/account/tickets?ticket=${id}`)
  const otherRead = await call(`/community/notifications/${ticketNotification.id}/read`, 'POST', {}, other)
  assert.equal(otherRead.status, 404)

  const closed = await call(`/community/staff/tickets/${id}`, 'PUT', { status: 'closed' }, staff)
  assert.equal(closed.status, 200)
  const rejected = await call(`/community/tickets/${id}/replies`, 'POST', { body: 'More information.' }, customer)
  assert.equal(rejected.status, 409)
})

test('tickets validate types, compatibility fields, payload lengths, and pagination bounds', async () => {
  const customer = await tokenFor(customerId, 'Customer')
  const badType = await call('/community/tickets', 'POST', { type: 'other', title: 'A title', body: 'A body here.' }, customer)
  assert.equal(badType.status, 400)
  const badCompatibility = await call('/community/tickets', 'POST', {
    type: 'compatibility', title: 'Compatibility test', body: 'Test results are here.',
  }, customer)
  assert.equal(badCompatibility.status, 400)
  const tooBig = await call('/community/tickets', 'POST', {
    type: 'bug', title: 'Bug title', body: 'x'.repeat(9000),
  }, customer)
  assert.equal(tooBig.status, 400)
  const page = await call('/community/tickets?page=0&pageSize=500', 'GET', undefined, customer)
  assert.equal((await page.json()).pageSize, 50)

  const previousLimiter = env.ASSISTANT_LIMITER
  env.ASSISTANT_LIMITER = { limit: async () => ({ success: false }) }
  try {
    const limited = await call('/community/tickets', 'POST', {
      type: 'support', title: 'Help request', body: 'Please help me troubleshoot this.',
    }, customer)
    assert.equal(limited.status, 429)
    const publicPoll = await call('/community/status', 'GET')
    assert.equal(publicPoll.status, 200)
  } finally {
    env.ASSISTANT_LIMITER = previousLimiter
  }
})

test('ticket ownership, editing, assignment and labels are enforced server-side', async () => {
  const customer = await tokenFor(customerId, 'Connected Customer')
  const staff = await tokenFor(staffId, 'Verified Staff')
  const stranger = await tokenFor('234567890123456789', 'Stranger')
  const created = await call('/community/tickets', 'POST', {
    type: 'support', title: 'Routing test ticket', body: 'Original request details.',
    discordUsername: 'Forged customer', ownerId: staffId,
  }, customer)
  const { ticket } = await created.json()
  assert.equal(ticket.customerName, 'Connected Customer')
  assert.equal((await call(`/community/tickets/${ticket.id}`, 'PUT', {
    title: 'Edited request', body: 'Edited details from the customer.',
  }, stranger)).status, 404)
  assert.equal((await call(`/community/tickets/${ticket.id}`, 'PUT', {
    title: 'Edited request', body: 'Edited details from the customer.', assigneeId: staffId,
  }, customer)).status, 403)
  assert.equal((await call(`/community/tickets/${ticket.id}`, 'PUT', {
    title: 'Edited request', body: 'Edited details from the customer.',
  }, customer)).status, 200)
  assert.equal((await call(`/community/staff/tickets/${ticket.id}`, 'PUT', {
    status: 'open', assigneeId: customerId, labels: ['bug'],
  }, staff)).status, 400)
  assert.equal((await call(`/community/staff/tickets/${ticket.id}`, 'PUT', {
    status: 'open', assigneeId: staffId, labels: ['Bug', ' needs-logs ', 'bug'],
  }, staff)).status, 200)
  const details = await (await call(`/community/tickets/${ticket.id}`, 'GET', undefined, customer)).json()
  assert.equal(details.ticket.title, 'Edited request')
  assert.equal(details.ticket.assignedTo.name, 'Verified Staff')
  assert.deepEqual(details.ticket.labels, ['bug', 'needs-logs'])
  const filtered = await (await call(`/community/staff/tickets?assigned=${staffId}&label=needs-logs`, 'GET', undefined, staff)).json()
  assert.equal(filtered.items.some(item => item.id === ticket.id), true)
  assert.equal((await call('/community/staff/members', 'GET', undefined, customer)).status, 403)
  const directory = await (await call('/community/staff/members', 'GET', undefined, staff)).json()
  assert.equal(directory.currentStaffId, staffId)
  assert.equal(directory.members.find(member => member.id === staffId).name, 'Verified Staff')
  await call(`/community/staff/tickets/${ticket.id}`, 'PUT', { status: 'closed', assigneeId: null, labels: [] }, staff)
  assert.equal((await call(`/community/tickets/${ticket.id}`, 'PUT', {
    title: 'Late edit', body: 'Cannot edit a closed ticket.',
  }, customer)).status, 409)
})

test('new ticket alerts send only a staff link, with no customer identity or report contents', async t => {
  const originalFetch = globalThis.fetch
  const deliveries = []
  globalThis.fetch = async (url, init) => {
    deliveries.push({ url: String(url), body: JSON.parse(init.body) })
    return new Response(null, { status: 204 })
  }
  t.after(() => { globalThis.fetch = originalFetch })
  const customer = await tokenFor(customerId, 'Private Customer')
  const configured = { ...env, DISCORD_BUG_REPORT_WEBHOOK: 'https://discord.com/api/webhooks/123456/synthetic-test-token' }
  const response = await worker.fetch(request('/community/tickets', 'POST', {
    type: 'bug', title: 'Private title', body: 'Private report contents.',
  }, customer), configured)
  assert.equal(response.status, 201)
  const { ticket } = await response.json()
  assert.equal(database.sqlite.prepare('SELECT state FROM community_ticket_alerts WHERE ticket_id = ?').get(ticket.id).state, 'sent')
  assert.equal(deliveries.length, 1)
  assert.match(deliveries[0].body.content, new RegExp(`/admin/\\?ticket=${ticket.id}`))
  assert.doesNotMatch(JSON.stringify(deliveries), /Private Customer|Private title|Private report contents/)
  assert.deepEqual(deliveries[0].body.allowed_mentions, { parse: [] })
  const staff = await tokenFor(staffId, 'Staff')
  const repeated = await worker.fetch(request(`/community/staff/tickets/${ticket.id}/alert`, 'POST', {}, staff), configured)
  assert.equal(repeated.status, 409)
  assert.equal(deliveries.length, 1)
  const issue = await worker.fetch(request('/community/issues', 'POST', {
    title: 'Private issue title', body: 'Private issue contents.',
  }, customer), configured)
  assert.equal(issue.status, 201)
  const { submissionId } = await issue.json()
  assert.equal(deliveries.length, 2)
  assert.match(deliveries[1].body.content, new RegExp(submissionId))
  assert.equal(database.sqlite.prepare('SELECT published FROM community_issues WHERE id = ?').get(submissionId).published, 0)
})

test('webhook failure preserves the ticket and staff can retry its durable alert', async t => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 503 })
  t.after(() => { globalThis.fetch = originalFetch })
  const customer = await tokenFor(customerId, 'Customer')
  const configured = { ...env, DISCORD_BUG_REPORT_WEBHOOK: 'https://discord.com/api/webhooks/123456/synthetic-test-token' }
  const response = await worker.fetch(request('/community/tickets', 'POST', {
    type: 'support', title: 'Delivery failure test', body: 'Keep this ticket if Discord is down.',
  }, customer), configured)
  assert.equal(response.status, 201)
  const { ticket } = await response.json()
  assert.equal('alertDelivery' in ticket, false)
  assert.equal(database.sqlite.prepare('SELECT state FROM community_ticket_alerts WHERE ticket_id = ?').get(ticket.id).state, 'pending')
  assert.equal((await call(`/community/tickets/${ticket.id}`, 'GET', undefined, customer)).status, 200)
  const staff = await tokenFor(staffId, 'Staff')
  globalThis.fetch = async () => new Response(null, { status: 204 })
  const retry = await worker.fetch(request(`/community/staff/tickets/${ticket.id}/alert`, 'POST', {}, staff), configured)
  assert.equal((await retry.json()).alertDelivery, 'sent')
  database.failBatchAt = 1
  const rolledBack = await worker.fetch(request('/community/tickets', 'POST', {
    type: 'bug', title: 'Atomic creation test', body: 'Ticket and alert must save together.',
  }, customer), configured)
  database.failBatchAt = null
  assert.equal(rolledBack.status, 503)
  assert.equal(database.sqlite.prepare("SELECT COUNT(*) AS total FROM community_tickets WHERE title = 'Atomic creation test'").get().total, 0)
})

test('customer issue submissions stay private until staff moderation publishes them', async () => {
  const customer = await tokenFor(customerId, 'Customer')
  const staff = await tokenFor(staffId, 'Staff')
  const forbidden = await call('/community/staff/issues', 'POST', {
    title: 'Untrusted public issue', body: 'A customer cannot publish this issue.',
    status: 'open', published: true,
  }, customer)
  assert.equal(forbidden.status, 403)
  database.failBatchAt = 1
  const failedSubmission = await call('/community/issues', 'POST', {
    title: 'Atomic issue submission', body: 'This submission must roll back.',
  }, customer)
  database.failBatchAt = null
  assert.equal(failedSubmission.status, 503)
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM community_tickets WHERE title = ?').get('Atomic issue submission').count, 0)
  assert.equal(database.sqlite.prepare('SELECT COUNT(*) AS count FROM community_issues WHERE title = ?').get('Atomic issue submission').count, 0)

  const submitted = await call('/community/issues', 'POST', {
    title: 'An issue report', body: 'A detailed report for staff to review.',
  }, customer)
  assert.equal(submitted.status, 201)
  const submissionPayload = await submitted.json()
  assert.deepEqual(Object.keys(submissionPayload), ['submissionId', 'message'])
  const myTickets = await call('/community/tickets', 'GET', undefined, customer)
  const issueTicket = (await myTickets.json()).items.find(item => item.id === submissionPayload.submissionId)
  assert.equal(issueTicket.type, 'bug')
  assert.equal(issueTicket.title, 'An issue report')
  const issueList = await call('/community/issues', 'GET')
  assert.equal((await issueList.json()).total, 0)
  const staffList = await call('/community/staff/issues', 'GET', undefined, staff)
  const issue = (await staffList.json()).items[0]
  assert.equal(issue.id, submissionPayload.submissionId)
  assert.equal(issue.title, 'An issue report')
  const edited = await call(`/community/tickets/${issue.id}`, 'PUT', {
    title: 'Edited private issue', body: 'Updated private reproduction steps.',
  }, customer)
  assert.equal(edited.status, 200)
  assert.equal(database.sqlite.prepare('SELECT title FROM community_issues WHERE id = ?').get(issue.id).title, 'Edited private issue')
  const published = await call(`/community/staff/issues/${issue.id}`, 'PUT', {
    ...issue, status: 'investigating', published: true,
  }, staff)
  assert.equal(published.status, 200)
  const publicIssues = await call('/community/issues', 'GET')
  const publicPayload = await publicIssues.json()
  assert.equal(publicPayload.items[0].status, 'investigating')
  assert.equal('customerDiscordId' in publicPayload.items[0], false)
  await call(`/community/tickets/${issue.id}`, 'PUT', {
    title: 'Another private edit', body: 'Never copy this private follow-up onto the public board.',
  }, customer)
  assert.equal((await (await call('/community/issues', 'GET')).json()).items[0].body, issue.body)

  const invalidStatus = await call(`/community/staff/issues/${issue.id}`, 'PUT', {
    title: issue.title, body: issue.body, status: 'pending', published: true,
  }, staff)
  assert.equal(invalidStatus.status, 400)
})

test('notification preferences, staff targeting, and read state are enforced', async () => {
  const customer = await tokenFor(customerId, 'Customer')
  const otherCustomer = await tokenFor('123456789012345679', 'Other')
  const staff = await tokenFor(staffId, 'Staff')
  const defaultCustomer = await tokenFor('234567890123456789', 'Default preferences')
  const preferences = { updates: false, announcements: true, ticketReplies: true, products: ['plugin-x'] }
  const saved = await call('/community/preferences', 'PUT', preferences, customer)
  assert.deepEqual((await saved.json()).preferences, preferences)
  const loaded = await call('/community/preferences', 'GET', undefined, customer)
  assert.deepEqual(Object.keys(await loaded.json()), ['preferences'])
  const announcement = await call('/community/staff/notifications', 'POST', {
    title: 'Plugin update', body: 'A new plugin release is available.', kind: 'update',
    productId: 'plugin-x', audience: 'product',
  }, staff)
  const staffCreatedNotification = (await announcement.json()).notification
  const notificationId = staffCreatedNotification.id
  assert.equal(staffCreatedNotification.audience, 'product')
  assert.equal(staffCreatedNotification.link, '/account/notifications')
  const defaultUpdate = await call('/community/staff/notifications', 'POST', {
    title: 'Default product update', body: 'Visible to default update subscribers.',
    kind: 'update', productId: 'plugin-y', audience: 'product',
  }, staff)
  const defaultAnnouncement = await call('/community/staff/notifications', 'POST', {
    title: 'Default product announcement', body: 'Visible to default announcement subscribers.',
    kind: 'announcement', productId: 'plugin-y', audience: 'product',
  }, staff)
  const defaultUpdateId = (await defaultUpdate.json()).notification.id
  const defaultAnnouncementId = (await defaultAnnouncement.json()).notification.id
  const defaultList = await call('/community/notifications', 'GET', undefined, defaultCustomer)
  const defaultIds = (await defaultList.json()).items.map(item => item.id)
  assert.ok(defaultIds.includes(defaultUpdateId))
  assert.ok(defaultIds.includes(defaultAnnouncementId))
  const unseenByPreference = await call('/community/notifications', 'GET', undefined, customer)
  const unseenPayload = await unseenByPreference.json()
  assert.equal(unseenPayload.items.some(item => item.id === notificationId), false)
  await call('/community/preferences', 'PUT', {
    updates: true, announcements: true, ticketReplies: true, products: ['plugin-x'],
  }, customer)
  const productAnnouncement = await call('/community/staff/notifications', 'POST', {
    title: 'Plugin announcement', body: 'An announcement for the selected product.',
    kind: 'announcement', productId: 'plugin-x', audience: 'product',
  }, staff)
  const productAnnouncementId = (await productAnnouncement.json()).notification.id
  const visible = await call('/community/notifications', 'GET', undefined, customer)
  const visiblePayload = await visible.json()
  assert.equal(visiblePayload.items.some(item => item.id === notificationId), true)
  assert.equal(visiblePayload.items.some(item => item.id === productAnnouncementId), true)
  assert.equal(typeof visiblePayload.items.find(item => item.id === notificationId).read, 'boolean')
  const wrongProduct = await call('/community/staff/notifications', 'POST', {
    title: 'Other product announcement', body: 'This is for a different product.',
    kind: 'announcement', productId: 'plugin-y', audience: 'product',
  }, staff)
  const wrongProductId = (await wrongProduct.json()).notification.id
  const filteredAnnouncement = await call('/community/notifications', 'GET', undefined, customer)
  assert.equal((await filteredAnnouncement.json()).items.some(item => item.id === wrongProductId), false)
  await call('/community/preferences', 'PUT', {
    updates: true, announcements: true, ticketReplies: true, products: ['plugin-y'],
  }, otherCustomer)
  const hiddenFromOther = await call('/community/notifications', 'GET', undefined, otherCustomer)
  assert.equal((await hiddenFromOther.json()).items.some(item => item.id === notificationId), false)
  const marked = await call(`/community/notifications/${notificationId}/read`, 'POST', {}, customer)
  assert.equal(marked.status, 200)
  const readList = await call('/community/notifications', 'GET', undefined, customer)
  assert.equal((await readList.json()).items.find(item => item.id === notificationId).read, true)
  const staffOnly = await call('/community/staff/notifications', 'POST', {
    title: 'Staff note', body: 'Internal notification.', kind: 'announcement', audience: 'staff',
  }, staff)
  const staffIdNotification = (await staffOnly.json()).notification.id
  const customerNotifications = await call('/community/notifications', 'GET', undefined, customer)
  assert.equal((await customerNotifications.json()).items.some(item => item.id === staffIdNotification), false)
  const cannotReadStaffOnly = await call(`/community/notifications/${staffIdNotification}/read`, 'POST', {}, customer)
  assert.equal(cannotReadStaffOnly.status, 404)
  const otherRead = await call(`/community/notifications/${notificationId}/read`, 'POST', {}, otherCustomer)
  assert.equal(otherRead.status, 200)
  const staffNotifications = await call('/community/staff/notifications', 'GET', undefined, staff)
  const staffItems = (await staffNotifications.json()).items
  const ids = staffItems.map(item => item.id)
  assert.ok(ids.includes(notificationId) && ids.includes(staffIdNotification))
  assert.equal(staffItems.find(item => item.id === notificationId).audience, 'product')
})

test('manual service overrides persist while automatic checks update independently', async () => {
  const staff = await tokenFor(staffId, 'Staff')
  const publicStatus = await call('/community/status', 'GET')
  assert.equal(publicStatus.status, 200)
  const publicStatusPayload = await publicStatus.json()
  assert.equal(publicStatusPayload.intervalMinutes, 5)
  assert.deepEqual(publicStatusPayload.services.map(service => service.id), ['website', 'discord', 'licensing'])
  assert.ok(publicStatusPayload.services.every(service => (
    'automaticStatus' in service && 'overrideStatus' in service && 'checkedAt' in service &&
    !('lastCheckedAt' in service)
  )))
  assert.deepEqual(Object.keys(publicStatusPayload.services[0]), [
    'id', 'name', 'status', 'automaticStatus', 'overrideStatus', 'message', 'checkedAt',
  ])
  const override = await call('/community/staff/status/website', 'PUT', {
    status: 'maintenance', message: 'Planned maintenance.',
  }, staff)
  assert.equal(override.status, 200)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (input, options = {}) => {
    if (String(input).includes('/auth/login')) {
      return new Response(null, { status: 302, headers: { Location: 'https://discord.com/oauth2/authorize?client_id=test' } })
    }
    if (String(input).includes('/v1/admin/products')) {
      assert.equal(options.headers.Authorization, 'Bearer safe-test-token')
      return new Response('{"items":[]}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    }
    return new Response('<html>ok</html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
  }
  try {
    let pending
    await worker.scheduled({}, { ...env, LICENSE_API_URL: 'https://license.example', LICENSE_ADMIN_API_TOKEN: 'safe-test-token' }, {
      waitUntil: promise => { pending = promise },
    })
    await pending
  } finally {
    globalThis.fetch = originalFetch
  }
  const statusResponse = await call('/community/status', 'GET')
  const website = (await statusResponse.json()).services.find(service => service.id === 'website')
  assert.equal(website.status, 'maintenance')
  assert.equal(website.automaticStatus, 'operational')
  assert.equal(website.overrideStatus, 'maintenance')
  assert.equal(website.message, 'Planned maintenance.')
  const auto = await call('/community/staff/status/website', 'PUT', { status: 'auto' }, staff)
  assert.equal(auto.status, 200)
  const reset = (await (await call('/community/status', 'GET')).json()).services.find(service => service.id === 'website')
  assert.equal(reset.status, 'operational')
  assert.equal(reset.overrideStatus, null)

  const invalidStatus = await call('/community/staff/status/website', 'PUT', {
    status: 'healthy', message: '',
  }, staff)
  assert.equal(invalidStatus.status, 400)
})

test('community support forum is public to read, Discord-only to post, and staff-moderated', async () => {
  const customer = await tokenFor(customerId, 'Customer')
  const other = await tokenFor('123456789012345679', 'Other')
  const staff = await tokenFor(staffId, 'Staff')

  const anonymous = await call('/community/forum', 'POST', { channel: 'help', title: 'Anon post', body: 'Hello' })
  assert.equal(anonymous.status, 401)
  const announcement = await call('/community/forum', 'POST', { channel: 'announcements', title: 'Fake news', body: 'Not staff' }, customer)
  assert.equal(announcement.status, 403)
  const badChannel = await call('/community/forum', 'POST', { channel: 'secret', title: 'Bad channel', body: 'Nope' }, customer)
  assert.equal(badChannel.status, 400)

  const created = await call('/community/forum', 'POST', {
    channel: 'help', title: 'Crates not opening 100%', body: 'Clicking the crate does nothing.', productId: 'lumencrates',
  }, customer)
  assert.equal(created.status, 201)
  const { thread } = await created.json()
  assert.equal(thread.author.name, 'Customer')
  assert.equal(thread.author.staff, false)
  assert.equal(JSON.stringify(thread).includes(customerId), false)

  const list = await (await call('/community/forum?channel=help&q=100%25', 'GET')).json()
  assert.equal(list.total, 1)
  assert.equal(list.items[0].id, thread.id)
  assert.equal((await (await call('/community/forum?q=0%25%25', 'GET')).json()).total, 0)
  assert.equal((await call('/community/forum?channel=nope', 'GET')).status, 400)

  assert.equal((await call(`/community/forum/${thread.id}/posts`, 'POST', { body: 'Same issue here.' }, other)).status, 201)
  const staffReply = await call(`/community/forum/${thread.id}/posts`, 'POST', { body: 'Update to 2.1.' }, staff)
  const { post: staffPost } = await staffReply.json()
  assert.equal(staffPost.staff, true)

  let detail = await (await call(`/community/forum/${thread.id}`, 'GET')).json()
  assert.equal(detail.thread.status, 'answered')
  assert.equal(detail.thread.replyCount, 2)
  assert.deepEqual(detail.posts.map(post => post.staff), [false, true])
  assert.equal(JSON.stringify(detail).includes(customerId), false)
  assert.equal('hidden' in detail.thread, false)

  assert.equal((await call(`/community/forum/${thread.id}`, 'PUT', { status: 'resolved' }, other)).status, 404)
  assert.equal((await call(`/community/forum/${thread.id}`, 'PUT', { status: 'resolved' }, customer)).status, 200)

  assert.equal((await call(`/community/staff/forum/${thread.id}`, 'PUT', { locked: true }, customer)).status, 403)
  assert.equal((await call(`/community/staff/forum/${thread.id}`, 'PUT', { locked: true, pinned: true }, staff)).status, 200)
  assert.equal((await call(`/community/forum/${thread.id}/posts`, 'POST', { body: 'Locked?' }, other)).status, 409)
  assert.equal((await call(`/community/forum/${thread.id}/posts`, 'POST', { body: 'Staff can still reply.' }, staff)).status, 201)

  const hidePost = await call(`/community/staff/forum/posts/${detail.posts[0].id}`, 'PUT', { hidden: true }, staff)
  assert.equal(hidePost.status, 200)
  detail = await (await call(`/community/forum/${thread.id}`, 'GET')).json()
  assert.equal(detail.posts.length, 2)
  assert.equal(detail.thread.replyCount, 2)
  assert.equal(detail.thread.pinned, true)
  const staffDetail = await (await call(`/community/forum/${thread.id}`, 'GET', undefined, staff)).json()
  assert.equal(staffDetail.posts.length, 3)
  assert.equal(staffDetail.posts[0].hidden, true)

  assert.equal((await call(`/community/staff/forum/${thread.id}`, 'PUT', { hidden: true }, staff)).status, 200)
  assert.equal((await call(`/community/forum/${thread.id}`, 'GET')).status, 404)
  assert.equal((await (await call('/community/forum', 'GET')).json()).total, 0)
  assert.equal((await (await call('/community/forum', 'GET', undefined, staff)).json()).items[0].hidden, true)
})

test('preset roles enforce strict assignment hierarchy, protected owner and current-session roles', async t => {
  const { api, assign } = await accessFixture(t)
  const ids = ['223456789012345680', '223456789012345681', '223456789012345682', '223456789012345683']
  const tokens = await Promise.all(ids.map(id => tokenFor(id, 'Member')))
  for (const [index, role] of ['support_team', 'developer', 'studio_lead', 'support_team'].entries()) {
    assert.equal((await assign(ids[index], role)).status, 200)
  }
  const access = await (await api('/admin/website/access')).json()
  assert.deepEqual(access.roles.map(role => role.id), ['guest', 'client', 'support_team', 'developer', 'studio_lead', 'owner'])
  const target = '223456789012345690'
  assert.equal((await assign(target, 'client', tokens[0])).status, 200)
  for (const role of ['support_team', 'developer', 'studio_lead', 'owner']) assert.equal((await assign(target, role, tokens[0])).status, 403)
  assert.equal((await assign(ids[0], 'client', tokens[0])).status, 403)
  assert.equal((await assign(ids[3], 'client', tokens[0])).status, 403)
  assert.equal((await assign(ids[1], 'guest', tokens[0])).status, 403)
  assert.equal((await assign(target, 'support_team', tokens[1])).status, 200)
  assert.equal((await assign(target, 'studio_lead', tokens[1])).status, 403)
  assert.equal((await assign(target, 'developer', tokens[2])).status, 200)
  assert.equal((await assign(target, 'owner', tokens[2])).status, 403)
  assert.equal((await assign(target, 'owner')).status, 200)
  assert.equal((await assign(staffId, 'guest')).status, 403)
  assert.equal((await assign(target, 'made-up-role')).status, 400)
  const sameToken = await (await api('/auth/me', 'GET', undefined, tokens[0])).json()
  assert.equal(sameToken.user.role, 'support_team')
  assert.equal(sameToken.user.permissions.includes('licenses.grant'), true)
  const guest = await tokenFor('223456789012345699', 'Guest')
  assert.equal((await api('/admin/website/members', 'GET', undefined, guest)).status, 403)
  assert.equal((await api('/auth/me', 'GET', undefined, guest)).status, 200)
  const members = await (await api('/admin/website/members?query=Guest')).json()
  assert.equal(members.items[0].role, 'guest')
})

test('support grants and IP controls honor saved permissions immediately without exposing destructive registry operations', async t => {
  const { api, assign } = await accessFixture(t)
  const id = '323456789012345680'
  const support = await tokenFor(id, 'Support')
  assert.equal((await assign(id, 'support_team')).status, 200)
  const actualFetch = globalThis.fetch
  const forwarded = []
  globalThis.fetch = async (url, options) => { forwarded.push({ url: String(url), options }); return Response.json({ saved: true }) }
  t.after(() => { globalThis.fetch = actualFetch })
  const licenseId = '12345678-1234-1234-1234-123456789012'
  for (const [path, method, body] of [
    ['/admin/licenses', 'POST', { productId: 'shards', customerDiscordId: customerId }],
    [`/admin/licenses/${licenseId}/ips`, 'POST', { ipAddress: '203.0.113.8' }],
    [`/admin/licenses/${licenseId}/ips?ipAddress=203.0.113.8`, 'DELETE'],
  ]) assert.equal((await api(path, method, body, support)).status, 200)
  assert.equal(forwarded[0].options.headers['X-Admin-Actor'], `${id}:support_team`)
  assert.equal((await api('/admin/plugins/plugin', 'DELETE', undefined, support)).status, 403)
  assert.equal((await api('/admin/products/product/plugins/plugin', 'DELETE', undefined, support)).status, 403)
  const preset = ROLES.find(role => role.id === 'support_team')
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', {
    permissions: preset.permissions.filter(permission => !['licenses.grant', 'licenses.ips', 'tickets.reply', 'forum.moderate'].includes(permission)), revision: 0,
  })).status, 200)
  const before = forwarded.length
  assert.equal((await api('/admin/licenses', 'POST', {}, support)).status, 403)
  assert.equal((await api(`/admin/licenses/${licenseId}/ips`, 'POST', {}, support)).status, 403)
  assert.equal(forwarded.length, before)
  const current = await (await api('/auth/me', 'GET', undefined, support)).json()
  assert.equal(current.user.permissions.includes('licenses.grant'), false)
  assert.equal((await api('/community/staff/forum/12345678-1234-1234-1234-123456789012', 'PUT', {}, support)).status, 403)
  const ticket = await (await api('/community/tickets', 'POST', { type: 'support', title: 'Private request', body: 'Only authorized support can reply.' }, await tokenFor(customerId, 'Customer'))).json()
  assert.equal((await api(`/community/tickets/${ticket.ticket.id}/replies`, 'POST', { body: 'Unauthorized staff reply' }, support)).status, 404)
  const forum = await (await api('/community/forum', 'GET', undefined, support)).json()
  assert.equal(forum.viewer.staff, false)
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', {
    permissions: ['forum.moderate', 'forum.announce'], revision: 1,
  })).status, 200)
  const withoutDashboard = await (await api('/community/forum', 'GET', undefined, support)).json()
  assert.equal(withoutDashboard.viewer.staff, false)
  assert.equal(withoutDashboard.viewer.canAnnounce, false)
  assert.equal((await api('/community/forum', 'POST', { channel: 'announcements', title: 'Not authorized', body: 'Dashboard access is also required.' }, support)).status, 403)
  assert.equal((await assign(id, 'client')).status, 200)
  assert.equal((await api('/admin/users', 'GET', undefined, support)).status, 403)
})

test('permission editing cannot escalate privileges and stale or failed writes do not corrupt policy or audit', async t => {
  const { db, api, assign } = await accessFixture(t)
  const id = '423456789012345680'
  const developer = await tokenFor(id, 'Developer')
  await assign(id, 'developer')
  const developerPermissions = [...ROLES.find(role => role.id === 'developer').permissions, 'settings.view', 'settings.roles']
  assert.equal((await api('/admin/website/roles/developer', 'PUT', { permissions: developerPermissions, revision: 0 })).status, 200)
  for (const role of ['developer', 'studio_lead', 'owner']) assert.equal((await api(`/admin/website/roles/${role}`, 'PUT', { permissions: [], revision: 0 }, developer)).status, 403)
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', { permissions: ['plugins.delete'], revision: 0 }, developer)).status, 403)
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', { permissions: ['invented.permission'], revision: 0 })).status, 400)
  const permissions = ['dashboard.view', 'customers.view']
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', { permissions, revision: 0 }, developer)).status, 200)
  const auditCount = db.sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', { permissions: [], revision: 0 })).status, 409)
  db.failBatchAt = 1
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', { permissions: [], revision: 1 })).status, 500)
  db.failBatchAt = null
  const policy = await (await api('/admin/website/access')).json()
  assert.deepEqual(policy.roles.find(role => role.id === 'support_team').permissions, [...permissions].sort())
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n, auditCount)
  assert.equal((await api('/admin/website/roles/owner', 'PUT', { permissions: [], revision: 0 })).status, 403)
  assert.equal((await api('/admin/website/members/423456789012345699/role', 'PUT', { role: 'guest' })).status, 400)
  assert.equal((await api('/admin/website/members/423456789012345699/role', 'PUT', { role: 'guest', revision: 5 })).status, 409)
})

test('website settings persist and pause every customer intake path without blocking existing tickets', async t => {
  const { api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const created = await (await api('/community/tickets', 'POST', { type: 'support', title: 'Before pause', body: 'Existing support request' }, customer)).json()
  const settings = { supportOpen: false, supportClosedMessage: 'Support is paused for maintenance.', forumOpen: false, forumClosedMessage: 'Forum is read-only today.' }
  assert.equal((await api('/admin/website/settings', 'PUT', { settings, revision: 0 })).status, 200)
  assert.deepEqual((await (await api('/admin/website/settings')).json()).settings, settings)
  for (const [path, body] of [
    ['/community/tickets', { type: 'support', title: 'New ticket', body: 'Another request' }],
    ['/community/issues', { title: 'New issue', body: 'Another issue' }],
    ['/reports', { type: 'feature', title: 'New request', description: 'Another feature request' }],
  ]) {
    const response = await api(path, 'POST', body, customer)
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error, settings.supportClosedMessage)
  }
  assert.equal((await api('/community/forum', 'POST', { channel: 'help', title: 'New thread', body: 'Please help me' }, customer)).status, 503)
  assert.equal((await api(`/community/tickets/${created.ticket.id}/replies`, 'POST', { body: 'Existing tickets still work.' }, customer)).status, 200)
  assert.equal((await api('/admin/website/settings', 'GET', undefined, customer)).status, 403)
  assert.equal((await api('/admin/website/settings', 'PUT', { settings: { ...settings, forumOpen: 'yes' }, revision: 1 })).status, 400)
})

test('registry removals are narrowly permission controlled and configured access database failures fail closed', async t => {
  const { db, api } = await accessFixture(t)
  const actualFetch = globalThis.fetch
  const forwarded = []
  globalThis.fetch = async (url, options) => { forwarded.push({ url: String(url), options }); return Response.json({ deleted: true }) }
  t.after(() => { globalThis.fetch = actualFetch })
  for (const [path, method, body] of [
    ['/admin/plugins/shards', 'DELETE'],
    ['/admin/products/shards/plugins/shards', 'DELETE'],
    ['/admin/products/shards', 'DELETE'],
    ['/admin/products/shards', 'PATCH', { active: false }],
    ['/admin/plugins/shards', 'PATCH', { active: false }],
  ]) assert.equal((await api(path, method, body)).status, 200)
  assert.equal(forwarded[3].options.body, JSON.stringify({ active: false }))
  const before = forwarded.length
  assert.equal((await api('/admin/products/shards', 'PATCH', { active: false, name: 'Unexpected edit' })).status, 400)
  assert.equal((await api('/admin/plugins/shards/token/rotate', 'POST')).status, 404)
  assert.equal((await api('/admin/website/settings', 'PATCH')).status, 404)
  db.sqlite.exec('DROP TABLE website_role_permissions')
  assert.equal((await api('/admin/plugins/shards', 'DELETE')).status, 500)
  assert.equal((await api('/auth/me')).status, 503)
  assert.equal(forwarded.length, before)
})
