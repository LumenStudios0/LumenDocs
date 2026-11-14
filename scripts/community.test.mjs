import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import worker from '../worker/chat.js'

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
  const migration = readFile(new URL('../worker/migrations/community/0001_community.sql', import.meta.url), 'utf8')
  const database = {
    sqlite,
    ready: migration.then(sql => sqlite.exec(sql)),
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
  assert.deepEqual(Object.keys(createdPayload.ticket), [
    'id', 'type', 'title', 'body', 'productId', 'status', 'createdAt', 'updatedAt',
  ])
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
  const published = await call(`/community/staff/issues/${issue.id}`, 'PUT', {
    ...issue, status: 'investigating', published: true,
  }, staff)
  assert.equal(published.status, 200)
  const publicIssues = await call('/community/issues', 'GET')
  const publicPayload = await publicIssues.json()
  assert.equal(publicPayload.items[0].status, 'investigating')
  assert.equal('customerDiscordId' in publicPayload.items[0], false)

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
