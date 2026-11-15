import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import worker from '../worker/chat.js'
import { ROLES } from '../shared/permissions.mjs'
import { runCommunityExpansionChecks } from '../worker/community-expansion.js'

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
  const migrations = Promise.all(['0001_community.sql', '0002_ticket_routing.sql', '0003_community_forum.sql', '0004_website_access.sql', '0005_member_registration.sql', '0006_community_expansion.sql', '0007_product_tools.sql', '0010_trial_duration.sql', '0011_staff_docs_permissions.sql', '0012_staff_operations.sql', '0013_staff_license_keys.sql'].map(
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
  ADMIN_READ_LIMITER: { limit: async () => ({ success: true }) },
  ADMIN_WRITE_LIMITER: { limit: async () => ({ success: true }) },
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

test('staff license grants notify only the recipient even when ticket alerts are disabled', async t => {
  const { db, owner, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const other = await tokenFor('987654321098765432', 'Other')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let calls = 0
  globalThis.fetch = async (input, options) => {
    assert.equal(new URL(input).pathname, '/v1/admin/licenses')
    assert.equal(JSON.parse(options.body).customerDiscordId, customerId)
    calls++
    return Response.json({ licenseKey: 'private-test-key' }, { status: 201 })
  }
  await api('/community/preferences', 'PUT', { updates: true, announcements: true, ticketReplies: false, products: [] }, customer)
  const grant = await api('/admin/licenses', 'POST', { customerDiscordId: customerId, productId: 'gladiator' }, owner)
  assert.equal(grant.status, 201)
  assert.equal(calls, 1)
  assert.equal(db.sqlite.prepare('SELECT last_did FROM staff_presence WHERE member_id=?').get(staffId).last_did, 'Gave Customer a license')
  const page = await (await api('/community/notifications', 'GET', undefined, customer)).json()
  assert.equal(page.unreadTotal, 1)
  assert.equal(page.items[0].kind, 'license')
  assert.equal(page.items[0].link, '/account/licenses')
  assert.doesNotMatch(JSON.stringify(page), /private-test-key/)
  const others = await (await api('/community/notifications', 'GET', undefined, other)).json()
  assert.equal(others.total, 0)
  assert.equal((await api(`/community/notifications/${page.items[0].id}/read`, 'POST', {}, customer)).status, 200)
  assert.equal((await (await api('/community/notifications', 'GET', undefined, customer)).json()).unreadTotal, 0)
  assert.equal(db.sqlite.prepare("SELECT count(*) AS total FROM community_notifications WHERE kind = 'license'").get().total, 1)
})

test('staff grant reports notification failure without retrying a committed grant', async t => {
  const { db, owner, api } = await accessFixture(t)
  const originalFetch = globalThis.fetch
  const originalPrepare = db.prepare
  t.after(() => { globalThis.fetch = originalFetch; db.prepare = originalPrepare })
  let calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ licenseKey: 'private-test-key' }, { status: 201 }) }
  db.prepare = function (query) {
    if (query.includes('INSERT INTO community_notifications')) return { bind: () => ({ run: async () => { throw new Error('injected failure') } }) }
    return originalPrepare.call(this, query)
  }
  const response = await api('/admin/licenses', 'POST', { customerDiscordId: customerId, productId: 'gladiator' }, owner)
  const result = await response.json()
  assert.equal(response.status, 201)
  assert.equal(calls, 1)
  assert.equal(result.licenseKey, 'private-test-key')
  assert.match(result.notificationWarning, /do not grant it again/i)
})

test('license activity uses the verified customer name and never records failed grants as successful', async t => {
  const { db, owner, api } = await accessFixture(t)
  await api('/auth/me', 'GET', undefined, await tokenFor(customerId, 'Alex'))
  const originalFetch = globalThis.fetch
  const originalPrepare = db.prepare
  t.after(() => { globalThis.fetch = originalFetch; db.prepare = originalPrepare })
  let status = 403, calls = 0
  globalThis.fetch = async () => { calls++; return Response.json({ message: 'Synthetic result' }, { status }) }
  const body = { customerDiscordId: customerId, productId: 'gladiator' }
  assert.equal((await api('/admin/licenses', 'POST', body, owner)).status, 403)
  assert.equal(db.sqlite.prepare('SELECT last_did FROM staff_presence WHERE member_id=?').get(staffId), undefined)
  status = 201
  assert.equal((await api('/admin/licenses', 'POST', body, owner)).status, 201)
  assert.equal(db.sqlite.prepare('SELECT last_did FROM staff_presence WHERE member_id=?').get(staffId).last_did, 'Gave Alex a license')
  db.prepare = function (sql) {
    if (sql.includes('INSERT INTO staff_presence')) return { bind: () => ({ run: async () => { throw new Error('Injected activity failure') } }) }
    return originalPrepare.call(this, sql)
  }
  const response = await api('/admin/licenses', 'POST', body, owner)
  assert.equal(response.status, 201)
  assert.match((await response.json()).notificationWarning, /Last did could not be updated.*Do not grant it again/)
  assert.equal(calls, 3)
})

test('editing license expiration forwards only valid dates and requires license status permission', async t => {
  const { api, assign } = await accessFixture(t)
  const id = '555555555555555555'
  const support = await tokenFor(id, 'Support')
  await api('/auth/me', 'GET', undefined, support)
  assert.equal((await assign(id, 'support_team')).status, 200)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const calls = []
  globalThis.fetch = async (url, options) => { calls.push({ url: String(url), body: JSON.parse(options.body) }); return Response.json({ expiresAt: JSON.parse(options.body).expiresAt }) }
  const path = '/admin/licenses/12345678-1234-1234-1234-123456789012/renew'
  for (const body of [{ expiresAt: 'invalid' }, { expiresAt: '2000-01-01' }, { expiresAt: null }, { expiresAt: new Date(Date.now() + 86400000).toISOString(), status: 'active' }]) {
    assert.equal((await api(path, 'POST', body, support)).status, 400)
  }
  assert.equal(calls.length, 0)
  const expiresAt = new Date(Date.now() + 86400000).toISOString()
  assert.equal((await api(path, 'POST', { expiresAt }, support)).status, 200)
  assert.ok(calls[0].url.endsWith(path.replace('/admin/', '/v1/admin/')))
  assert.deepEqual(calls[0].body, { expiresAt })
  assert.equal((await assign(id, 'client')).status, 200)
  assert.equal((await api(path, 'POST', { expiresAt }, support)).status, 403)
  assert.equal(calls.length, 1)
})

test('key permission migration excludes customers and preserves restricted staff policies', async t => {
  const { db } = await accessFixture(t)
  for (const [role, permissions] of [
    ['guest', ['dashboard.view', 'customers.view']], ['client', ['dashboard.view', 'customers.view']],
    ['support_team', ['dashboard.view', 'customers.view']], ['developer', ['dashboard.view']],
    ['studio_lead', ['dashboard.view', 'customers.view', 'licenses.keys']],
  ]) {
    db.sqlite.prepare('INSERT OR REPLACE INTO website_role_permissions(role_id,permissions) VALUES (?,?)')
      .run(role, JSON.stringify(permissions))
  }
  const migration = await readFile(new URL('../worker/migrations/community/0013_staff_license_keys.sql', import.meta.url), 'utf8')
  db.sqlite.exec(migration)
  db.sqlite.exec(migration)
  for (const role of ['guest', 'client', 'developer']) {
    assert.ok(!JSON.parse(db.sqlite.prepare('SELECT permissions FROM website_role_permissions WHERE role_id=?').get(role).permissions).includes('licenses.keys'))
  }
  for (const role of ['support_team', 'studio_lead']) {
    const permissions = JSON.parse(db.sqlite.prepare('SELECT permissions FROM website_role_permissions WHERE role_id=?').get(role).permissions)
    assert.equal(permissions.filter(value => value === 'licenses.keys').length, 1)
  }
})

test('staff can inspect recoverable account keys with current permission and a key-free audit', async t => {
  const { api, assign, db } = await accessFixture(t)
  const id = '555555555555555555', licenseId = '12345678-1234-1234-1234-123456789012'
  const support = await tokenFor(id, 'Support')
  await api('/auth/me', 'GET', undefined, support)
  assert.equal((await assign(id, 'support_team')).status, 200)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const calls = [], key = 'SYNTHETIC-STAFF-KEY-NOT-VALID'
  globalThis.fetch = async url => {
    calls.push(new URL(url).pathname)
    return Response.json(calls.length === 1
      ? { licenseId, customerDiscordId: customerId, productId: 'shards' }
      : { licenseKey: key, license: { licenseId, customerDiscordId: customerId, productIds: ['shards'] } })
  }
  const path = `/admin/licenses/${licenseId}/key`
  const response = await api(path, 'GET', undefined, support)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const payload = await response.json()
  assert.equal(payload.licenseKey, key)
  assert.equal(payload.kind, 'account')
  assert.deepEqual(calls, [`/v1/admin/licenses/${licenseId}`, `/v1/admin/users/${customerId}/license-key`])
  const audit = db.sqlite.prepare("SELECT * FROM website_access_audit WHERE action='license.key_viewed'").all()
  assert.equal(audit.length, 1)
  assert.doesNotMatch(JSON.stringify(audit), /SYNTHETIC-STAFF-KEY/)
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', {
    permissions: ROLES.find(role => role.id === 'support_team').permissions.filter(permission => permission !== 'licenses.keys'), revision: 0,
  })).status, 200)
  assert.equal((await api(path, 'GET', undefined, support)).status, 403)
  assert.equal(calls.length, 2)
})

test('staff key inspection rejects mismatched accounts and explains unavailable hashed keys without rotating them', async t => {
  const { api, db } = await accessFixture(t)
  const licenseId = '12345678-1234-1234-1234-123456789012'
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let mode = 'wrong-account'
  globalThis.fetch = async (url, options) => {
    assert.ok(!options.method || options.method === 'GET')
    if (new URL(url).pathname.endsWith(`/licenses/${licenseId}`)) return Response.json({ licenseId, productId: 'shards', customerDiscordId: customerId })
    if (mode === 'missing') return Response.json({ detail: 'Not found' }, { status: 404 })
    if (mode !== 'wrong-account') return Response.json({
      licenseKey: mode === 'invalid-key' ? 'SYNTHETIC-STAFF-KEY\nNOT-VALID' : 'SYNTHETIC-STAFF-KEY-NOT-VALID',
      license: { licenseId: 'another-row', customerDiscordId: customerId, productIds: mode === 'wrong-product' ? ['other-plugin'] : ['shards'] },
    })
    return Response.json({ licenseKey: 'SYNTHETIC-STAFF-KEY-NOT-VALID', license: { licenseId, customerDiscordId: '999999999999999999', productIds: ['shards'] } })
  }
  const path = `/admin/licenses/${licenseId}/key`
  assert.equal((await api(path)).status, 502)
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM website_access_audit WHERE action='license.key_viewed'").get().n, 0)
  mode = 'missing'
  const response = await api(path)
  assert.equal(response.status, 404)
  assert.match((await response.json()).error, /stored only as hashes cannot be displayed/)
  for (const invalid of ['wrong-product', 'invalid-key']) {
    mode = invalid
    assert.equal((await api(path)).status, 502)
  }
  mode = 'other-row'
  assert.equal((await api(path)).status, 200)
  db.sqlite.exec('DROP TABLE website_access_audit')
  const unavailable = await api(path)
  assert.equal(unavailable.status, 503)
  assert.equal((await unavailable.json()).licenseKey, undefined)
})

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

test('support center commission and license support requests are accepted as distinct private tickets', async () => {
  const customer = await tokenFor(customerId, 'Customer')
  for (const [type, title, body] of [
    ['commission', 'Custom Minecraft plugin', 'I would like to discuss a custom plugin commission.'],
    ['license_support', 'License validation issue', 'My plugin reports a license validation error.'],
  ]) {
    const response = await call('/community/tickets', 'POST', { type, title, body }, customer)
    assert.equal(response.status, 201)
    const ticket = (await response.json()).ticket
    assert.equal(ticket.type, type)
    assert.equal(ticket.title, title)
    assert.equal(ticket.body, body)
  }
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
  assert.deepEqual(publicStatusPayload.services.map(service => service.id), ['website', 'discord', 'licensing', 'builtbybit'])
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
    if (String(input).startsWith('https://api.builtbybit.com/')) {
      assert.equal(options.headers.Authorization, undefined)
      return Response.json({ result: 'error', error: { code: 'UNAUTHENTICATED' } }, { status: 401 })
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
  const services = (await statusResponse.json()).services
  const website = services.find(service => service.id === 'website')
  assert.equal(services.find(service => service.id === 'builtbybit').automaticStatus, 'operational')
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

test('notification unread totals cover all pages and respect preferences, audience and per-user read state', async t => {
  const { api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const other = await tokenFor('723456789012345680', 'Other customer')
  const preferences = { updates: false, announcements: true, ticketReplies: false, products: ['plugin-x'] }
  for (const token of [customer, other]) assert.equal((await api('/community/preferences', 'PUT', preferences, token)).status, 200)
  for (let index = 0; index < 53; index++) {
    assert.equal((await api('/community/staff/notifications', 'POST', {
      title: `Announcement ${index}`, body: 'Visible to both accounts.', kind: 'announcement', audience: 'all',
    })).status, 201)
  }
  for (const body of [
    { title: 'Private staff note', kind: 'announcement', audience: 'staff' },
    { title: 'Other product', kind: 'announcement', audience: 'product', productId: 'plugin-y' },
    { title: 'Muted release update', kind: 'update', audience: 'all' },
  ]) assert.equal((await api('/community/staff/notifications', 'POST', { ...body, body: 'Not included in this badge.' })).status, 201)
  const firstPage = await (await api('/community/notifications?pageSize=5', 'GET', undefined, customer)).json()
  assert.equal(firstPage.items.length, 5)
  assert.equal(firstPage.total, 53)
  assert.equal(firstPage.unreadTotal, 53)
  const lastPage = await (await api('/community/notifications?page=11&pageSize=5', 'GET', undefined, customer)).json()
  const id = lastPage.items[0].id
  for (let repeat = 0; repeat < 2; repeat++) assert.equal((await api(`/community/notifications/${id}/read`, 'POST', {}, customer)).status, 200)
  const updated = await (await api('/community/notifications?pageSize=5', 'GET', undefined, customer)).json()
  assert.equal(updated.items.every(item => !item.read), true)
  assert.equal(updated.unreadTotal, 52)
  assert.equal((await (await api('/community/notifications?pageSize=5', 'GET', undefined, other)).json()).unreadTotal, 53)
  await api('/community/preferences', 'PUT', { ...preferences, announcements: false }, customer)
  const muted = await (await api('/community/notifications', 'GET', undefined, customer)).json()
  assert.equal(muted.unreadTotal, 0)
  assert.equal(muted.total, 0)
})

test('verified Discord signup persists a staff-visible account and repeated sign-ins preserve its registration and role', async t => {
  const { db, config, api, assign } = await accessFixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const id = '823456789012345680'
  let username = 'new-customer'
  globalThis.fetch = async input => {
    if (String(input).endsWith('/oauth2/token')) return Response.json({ access_token: 'synthetic-only' })
    if (String(input).endsWith('/api/users/@me')) return Response.json({ id, username, global_name: 'New Customer' })
    throw new Error('Unexpected signup request')
  }
  const signup = () => worker.fetch(new Request('https://worker.example/auth/callback?code=synthetic-code&state=synthetic-state', {
    headers: { Cookie: 'lumen_discord_oauth_state=synthetic-state' },
  }), { ...config, DISCORD_CLIENT_ID: 'synthetic-id', DISCORD_CLIENT_SECRET: 'synthetic-secret' })
  const registered = await signup()
  assert.equal(registered.status, 302)
  const first = db.sqlite.prepare('SELECT * FROM website_members WHERE discord_id = ?').get(id)
  assert.equal(first.username, username)
  assert.equal(first.display_name, 'New Customer')
  assert.ok(Date.parse(first.registered_at))
  assert.equal(first.role_id, null)
  const directory = await (await api('/admin/website/members?query=new-customer')).json()
  assert.equal(directory.items[0].registeredAt, first.registered_at)
  assert.equal(directory.items[0].role, 'guest')
  await assign(id, 'client')
  username = 'returning-customer'
  assert.equal((await signup()).status, 302)
  const returning = db.sqlite.prepare('SELECT * FROM website_members WHERE discord_id = ?').get(id)
  assert.equal(returning.username, username)
  assert.equal(returning.registered_at, first.registered_at)
  assert.equal(returning.role_id, 'client')
  assert.equal(returning.revision, 1)
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM website_members WHERE discord_id = ?').get(id).n, 1)
  db.sqlite.exec('DROP TABLE website_members')
  const failed = await signup()
  assert.equal(failed.status, 503)
  assert.equal(failed.headers.has('Location'), false)
  assert.match(await failed.text(), /account could not be saved/)
})

test('BuiltByBit status distinguishes unavailable and invalid API responses and preserves staff overrides', async t => {
  const { api, config } = await accessFixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  assert.equal((await api('/community/staff/status/builtbybit', 'PUT', {
    status: 'maintenance', message: 'Marketplace integration maintenance.',
  })).status, 200)
  for (const [response, expected] of [
    [() => new Response('Unavailable', { status: 503 }), 'outage'],
    [() => Response.json({ error: 'rate_limited' }, { status: 429 }), 'degraded'],
    [() => new Response('<html>Challenge</html>', { status: 401 }), 'degraded'],
    [() => Response.json({}), 'degraded'],
    [() => Response.json({ error: 'unauthenticated' }, { status: 401 }), 'operational'],
    [() => Response.json({ error: { code: 'HeaderMissingError' } }, { status: 400 }), 'operational'],
    [() => Response.json({ error: { code: 'OtherError' } }, { status: 400 }), 'outage'],
    [() => { throw new Error('Connection refused') }, 'outage'],
  ]) {
    globalThis.fetch = async input => String(input).startsWith('https://api.builtbybit.com/')
      ? response() : new Response('<html>ok</html>', { headers: { 'Content-Type': 'text/html' } })
    let pending
    await worker.scheduled({}, config, { waitUntil: promise => { pending = promise } })
    await pending
    const builtbybit = (await (await api('/community/status')).json()).services.find(service => service.id === 'builtbybit')
    assert.equal(builtbybit.automaticStatus, expected)
    assert.equal(builtbybit.status, 'maintenance')
    assert.equal(builtbybit.message, 'Marketplace integration maintenance.')
    assert.ok(Date.parse(builtbybit.checkedAt))
  }
  assert.equal((await api('/community/staff/status/builtbybit', 'PUT', { status: 'auto' })).status, 200)
  const automatic = (await (await api('/community/status')).json()).services.find(service => service.id === 'builtbybit')
  assert.equal(automatic.status, 'outage')
  assert.equal(automatic.overrideStatus, null)
})

test('website status accepts large HTML pages but rejects empty or invalid responses', async t => {
  const { api, config } = await accessFixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  for (const [response, expected] of [
    [() => new Response('<html>' + 'x'.repeat(53000) + '</html>', { headers: { 'Content-Type': 'text/html' } }), 'operational'],
    [() => new Response('', { headers: { 'Content-Type': 'text/html' } }), 'degraded'],
    [() => new Response('not html', { headers: { 'Content-Type': 'application/json' } }), 'degraded'],
    [() => new Response('Unavailable', { status: 503 }), 'outage'],
  ]) {
    globalThis.fetch = async input => String(input) === 'https://lumenstudio.fyi/'
      ? response() : new Response(null, { status: 503 })
    let pending
    await worker.scheduled({}, config, { waitUntil: promise => { pending = promise } })
    await pending
    const website = (await (await api('/community/status')).json()).services.find(service => service.id === 'website')
    assert.equal(website.automaticStatus, expected)
  }
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

test('staff knowledge migration preserves saved policies and enables only the intended additions', async t => {
  const db = new DatabaseSync(':memory:')
  t.after(() => db.close())
  db.exec(await readFile(new URL('../worker/migrations/community/0004_website_access.sql', import.meta.url), 'utf8'))
  const insert = db.prepare('INSERT INTO website_role_permissions (role_id, permissions, revision) VALUES (?, ?, ?)')
  for (const role of ROLES.filter(role => role.id !== 'owner')) {
    insert.run(role.id, JSON.stringify(role.rank >= 2 ? ['tickets.view'] : []), 4)
  }
  db.exec(await readFile(new URL('../worker/migrations/community/0011_staff_docs_permissions.sql', import.meta.url), 'utf8'))
  for (const role of ROLES.filter(role => role.id !== 'owner')) {
    const saved = db.prepare('SELECT permissions, revision FROM website_role_permissions WHERE role_id = ?').get(role.id)
    assert.equal(saved.revision, 5)
    assert.deepEqual(JSON.parse(saved.permissions), [
      ...(role.rank >= 2 ? ['tickets.view'] : []),
      'support.create', 'trials.request', 'forum.post',
      ...(role.rank >= 2 ? ['staff.docs'] : []),
    ])
  }
})

test('private staff guides require staff rank and current permission on every request', async t => {
  const { db, api, assign } = await accessFixture(t)
  const id = '223456789012345698'
  const member = await tokenFor(id, 'Knowledge reader')
  const anonymous = await api('/studio/staff/docs', 'GET', undefined, null)
  assert.equal(anonymous.status, 401)
  assert.doesNotMatch(await anonymous.text(), /Required inputs|Validation request/)
  for (const role of ['guest', 'client']) {
    assert.equal((await assign(id, role)).status, 200)
    assert.equal((await api('/studio/staff/docs', 'GET', undefined, member)).status, 403)
    assert.equal((await api(`/admin/website/roles/${role}`, 'PUT', { permissions: ['staff.docs'], revision: 0 })).status, 403)
  }
  for (const role of ['support_team', 'developer', 'studio_lead']) {
    assert.equal((await assign(id, role)).status, 200)
    const response = await api('/studio/staff/docs', 'GET', undefined, member)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    const payload = await response.json()
    assert.ok(payload.guides.some(guide => guide.id === 'integration' && guide.body.includes('X-Plugin-Token')))
    assert.ok(payload.guides.some(guide => guide.id === 'ticket-playbook'))
    assert.equal(payload.actor.id, id)
    const catalog = await readFile(new URL('../docs/.vitepress/theme/PluginCatalog.vue', import.meta.url), 'utf8')
    for (const [, name] of catalog.matchAll(/\{ name: '([^']+)'/g)) {
      assert.ok(payload.guides.some(guide => guide.category === 'Plugin playbooks' && guide.title === name), `Missing staff playbook for ${name}`)
    }
    assert.equal(new Set(payload.guides.map(guide => guide.id)).size, payload.guides.length)
    assert.equal(payload.actor.roleName, ROLES.find(item => item.id === role).name)
  }
  await assign(id, 'support_team')
  const preset = ROLES.find(role => role.id === 'support_team')
  assert.equal((await api('/admin/website/roles/support_team', 'PUT', {
    permissions: preset.permissions.filter(permission => permission !== 'staff.docs'), revision: 0,
  })).status, 200)
  assert.equal((await api('/studio/staff/docs', 'GET', undefined, member)).status, 403)
  // Legacy or corrupt lower-role policies must not bypass the staff-rank floor.
  db.sqlite.prepare("INSERT INTO website_role_permissions(role_id, permissions, revision) VALUES ('client', ?, 1)")
    .run(JSON.stringify(['staff.docs', 'dashboard.view']))
  await assign(id, 'client')
  assert.equal((await api('/studio/staff/docs', 'GET', undefined, member)).status, 403)
  assert.equal((await api('/admin/users', 'GET', undefined, member)).status, 403)
})

test('guest and client permission toggles enforce new requests without removing existing ticket access', async t => {
  const { api, assign } = await accessFixture(t)
  const member = await tokenFor(customerId, 'Customer')
  const ticket = (await (await api('/community/tickets', 'POST', { type: 'support', title: 'Existing request', body: 'Keep this conversation accessible.' }, member)).json()).ticket
  for (const role of ['guest', 'client']) {
    await assign(customerId, role)
    assert.equal((await api(`/admin/website/roles/${role}`, 'PUT', { permissions: [], revision: 0 })).status, 200)
    for (const [path, body] of [
      ['/community/tickets', { type: 'commission', title: 'New request', body: 'Discuss a new project.' }],
      ['/community/issues', { title: 'New issue', body: 'A new issue report.' }],
      ['/community/trials', { productId: '1', reason: 'Evaluate a plugin.' }],
      ['/community/forum', { channel: 'general', title: 'New topic', body: 'New forum post.' }],
    ]) assert.equal((await api(path, 'POST', body, member)).status, 403)
    assert.equal((await api(`/community/tickets/${ticket.id}`, 'GET', undefined, member)).status, 200)
    assert.equal((await api(`/community/tickets/${ticket.id}/replies`, 'POST', { body: 'Continuing the existing conversation.' }, member)).status, 200)
    assert.equal((await api(`/admin/website/roles/${role}`, 'PUT', { permissions: ['support.create', 'trials.request', 'forum.post'], revision: 1 })).status, 200)
    assert.equal((await api('/community/trials', 'POST', { productId: role === 'guest' ? '1' : 'gladiator', reason: 'Evaluate a plugin.' }, member)).status, 201)
    assert.equal((await api('/community/tickets', 'POST', { type: 'license_support', title: 'License request', body: 'Request allowed again.' }, member)).status, 201)
  }
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

test('registry name edits validate fields, enforce permissions and report incompatible licensing APIs', async t => {
  const { api, assign } = await accessFixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const forwarded = []
  globalThis.fetch = async (url, options) => {
    forwarded.push({ url: String(url), options })
    return Response.json({ name: JSON.parse(options.body).name })
  }
  const developerId = '623456789012345680'
  const supportId = '623456789012345681'
  await assign(developerId, 'developer')
  await assign(supportId, 'support_team')
  const developer = await tokenFor(developerId, 'Developer')
  const support = await tokenFor(supportId, 'Support')
  for (const kind of ['plugins', 'products']) {
    const path = `/admin/${kind}/stable-id`
    assert.equal((await api(path, 'PATCH', { name: '  New display name  ' }, developer)).status, 200)
    assert.deepEqual(JSON.parse(forwarded.at(-1).options.body), { name: 'New display name' })
    assert.equal(forwarded.at(-1).url, `https://licenses.example/v1/admin/${kind}/stable-id`)
    const count = forwarded.length
    assert.equal((await api(path, 'PATCH', { name: 'Not allowed' }, support)).status, 403)
    for (const invalid of [{}, [], null, { name: '' }, { name: '   ' }, { name: 'a'.repeat(121) },
      { name: 7 }, { active: null }, { active: 'false' }, { name: 'Valid', pluginId: 'new-id' }, { productId: 'new-id' }]) {
      assert.equal((await api(path, 'PATCH', invalid)).status, 400)
    }
    assert.equal((await api(path, 'PATCH')).status, 400)
    assert.equal(forwarded.length, count)
  }
  globalThis.fetch = async () => Response.json({ detail: 'Field active required' }, { status: 422 })
  const unsupported = await api('/admin/plugins/stable-id', 'PATCH', { name: 'New name' })
  assert.equal(unsupported.status, 422)
  assert.match((await unsupported.json()).error, /VPS updater/)
  globalThis.fetch = async () => Response.json({ name: 'Old name', active: true })
  const ignored = await api('/admin/plugins/stable-id', 'PATCH', { name: 'New name', active: true })
  assert.equal(ignored.status, 502)
  assert.match((await ignored.json()).error, /did not apply/)
  globalThis.fetch = async () => Response.json({ detail: 'Product still has licenses' }, { status: 409 })
  assert.equal((await api('/admin/products/stable-id', 'DELETE')).status, 409)
})

test('admin reads and changes have independent per-user limits', async t => {
  const { config, api } = await accessFixture(t)
  const quota = limit => {
    const counts = new Map()
    return { limit: async ({ key }) => {
      const count = (counts.get(key) || 0) + 1
      counts.set(key, count)
      return { success: count <= limit }
    } }
  }
  config.ADMIN_READ_LIMITER = quota(120)
  config.ADMIN_WRITE_LIMITER = quota(30)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({ deleted: true })
  t.after(() => { globalThis.fetch = originalFetch })

  for (let i = 0; i < 30; i++) {
    assert.equal((await api('/admin/products/shards', 'DELETE')).status, 200)
    assert.equal((await api('/admin/website/access')).status, 200)
    assert.equal((await api('/admin/website/access')).status, 200)
  }
  const blockedWrite = await api('/admin/products/shards', 'DELETE')
  assert.equal(blockedWrite.status, 429)
  assert.match((await blockedWrite.json()).error, /admin changes/)
  for (let i = 0; i < 60; i++) assert.equal((await api('/admin/website/access')).status, 200)
  const blockedRead = await api('/admin/website/access')
  assert.equal(blockedRead.status, 429)
  assert.match((await blockedRead.json()).error, /admin requests/)
  const lead = await tokenFor('1012053634911064114', 'Lead')
  assert.equal((await api('/admin/website/access', 'GET', undefined, lead)).status, 200)

  delete config.ADMIN_WRITE_LIMITER
  assert.equal((await api('/admin/products/shards', 'DELETE')).status, 503)
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
  assert.equal((await api('/admin/products/shards', 'PATCH', { active: false, productId: 'changed-id' })).status, 400)
  assert.equal((await api('/admin/plugins/shards/token/rotate', 'POST')).status, 404)
  assert.equal((await api('/admin/website/settings', 'PATCH')).status, 404)
  db.sqlite.exec('DROP TABLE website_role_permissions')
  assert.equal((await api('/admin/plugins/shards', 'DELETE')).status, 500)
  assert.equal((await api('/auth/me')).status, 503)
  assert.equal(forwarded.length, before)
})

test('ticket ratings require the closed ticket owner; escalation and follow-up require staff', async t => {
  const { db, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const other = await tokenFor('123456789012345679', 'Other')
  const created = await (await api('/community/tickets', 'POST', { type: 'support', title: 'Rating test', body: 'Please help with setup.' }, customer)).json()
  const id = created.ticket.id
  assert.equal(created.ticket.followUpHours, 24)
  assert.equal(created.ticket.rating, null)
  assert.equal((await api(`/community/tickets/${id}/rating`, 'PUT', { score: 5 }, customer)).status, 409)
  assert.equal((await api(`/community/staff/tickets/${id}/escalation`, 'PUT', { reason: 'Needs developer investigation' }, customer)).status, 403)
  assert.equal((await api(`/community/staff/tickets/${id}/escalation`, 'PUT', { reason: 'Needs investigation', targetId: customerId })).status, 400)
  const escalation = await (await api(`/community/staff/tickets/${id}/escalation`, 'PUT', { reason: 'Needs investigation', targetId: staffId })).json()
  assert.equal(escalation.ticket.escalation.by, staffId)
  assert.equal(escalation.ticket.escalation.targetId, staffId)
  for (const hours of [0, 169, 1.5, '24']) assert.equal((await api(`/community/staff/tickets/${id}/follow-up`, 'PUT', { hours })).status, 400)
  assert.equal((await api(`/community/staff/tickets/${id}/follow-up`, 'PUT', { hours: 2 })).status, 200)
  assert.equal((await api(`/community/staff/tickets/${id}`, 'PUT', { status: 'closed', followUpHours: 3 })).status, 200)
  assert.equal((await api(`/community/tickets/${id}/rating`, 'PUT', { score: 5 }, other)).status, 404)
  assert.equal((await api(`/community/tickets/${id}/rating`, 'PUT', { score: 5 })).status, 404)
  for (const score of [0, 6, 4.5, '5']) assert.equal((await api(`/community/tickets/${id}/rating`, 'PUT', { score }, customer)).status, 400)
  assert.equal((await api(`/community/tickets/${id}/rating`, 'PUT', { score: 5, comment: 'x'.repeat(2001) }, customer)).status, 400)
  const comment = '**Thanks** <script>not executable raw text</script>'
  assert.equal((await api(`/community/tickets/${id}/rating`, 'PUT', { score: 5, comment }, customer)).status, 200)
  const detail = await (await api(`/community/tickets/${id}`, 'GET', undefined, customer)).json()
  assert.deepEqual(detail.ticket.rating, { score: 5, comment })
  assert.equal(detail.ticket.followUpHours, 3)
  assert.equal(db.sqlite.prepare('SELECT rating_score FROM community_tickets WHERE id = ?').get(id).rating_score, 5)
})

test('targeted escalations atomically assign and notify only the authorized target without customer content', async t => {
  const { db, api, assign } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer private name')
  const targetId = '123456789012345679'
  const target = await tokenFor(targetId, 'Target Support')
  await assign(targetId, 'support_team')
  db.sqlite.prepare('UPDATE website_members SET display_name = ? WHERE discord_id = ?').run('Target Support', targetId)
  await api('/community/preferences', 'PUT', { updates: false, announcements: false, ticketReplies: false, products: [] }, target)
  const id = (await (await api('/community/tickets', 'POST', {
    type: 'support', title: 'Private customer title', body: 'Private customer logs and license keys',
  }, customer)).json()).ticket.id
  const path = `/community/staff/tickets/${id}/escalation`
  const body = { reason: 'Private investigation reason', targetId }
  db.failBatchAt = 1
  assert.equal((await api(path, 'PUT', body)).status, 503)
  db.failBatchAt = null
  const unchanged = db.sqlite.prepare('SELECT escalation_reason, assignee_id FROM community_tickets WHERE id = ?').get(id)
  assert.equal(unchanged.escalation_reason, null)
  assert.equal(unchanged.assignee_id, null)
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE kind = 'escalation'").get().n, 0)
  const saved = await (await api(path, 'PUT', body)).json()
  assert.equal(saved.ticket.assignedTo.id, targetId)
  assert.equal(saved.ticket.assignedTo.name, 'Target Support')
  const inbox = await (await api('/community/notifications', 'GET', undefined, target)).json()
  assert.equal(inbox.total, 1)
  assert.equal(inbox.items[0].kind, 'escalation')
  assert.equal(inbox.items[0].body, 'A ticket needs your attention')
  assert.equal(inbox.items[0].link, `/admin/?ticket=${id}`)
  assert.doesNotMatch(JSON.stringify(inbox), /Private|Customer private|license keys|investigation/)
  assert.equal((await (await api('/community/notifications')).json()).total, 0)
  assert.equal((await (await api('/community/notifications', 'GET', undefined, customer)).json()).total, 0)
  assert.equal((await api(`/community/notifications/${inbox.items[0].id}/read`, 'POST', {})).status, 404)
  assert.equal((await api(`/community/notifications/${inbox.items[0].id}/read`, 'POST', {}, target)).status, 200)
  assert.equal((await api(path, 'PUT', { reason: 'Unrouted escalation flag' })).status, 200)
  assert.equal(db.sqlite.prepare('SELECT assignee_id FROM community_tickets WHERE id = ?').get(id).assignee_id, targetId)
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE kind = 'escalation'").get().n, 1)
  assert.equal((await api(path, 'PUT', { reason: 'Reject customer target', targetId: customerId })).status, 400)
})

test('scheduled images publish atomically once with proper audience; cancellation and validation work', async t => {
  const { db, config, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const base = { title: 'Scheduled release', body: '**Raw markdown**', kind: 'update', audience: 'all', imageUrl: 'https://images.example/update.png' }
  for (const imageUrl of ['http://images.example/image.png', 'javascript:alert(1)', 'data:image/png;base64,abc', 'https://user:password@example.com/a', 'https://example.com/' + 'x'.repeat(2000), {}]) {
    assert.equal((await api('/community/staff/notifications', 'POST', { ...base, imageUrl })).status, 400)
  }
  for (const scheduledAt of ['invalid', new Date(Date.now() - 1000).toISOString(), new Date(Date.now() + 366 * 86400000).toISOString(), 1234]) {
    assert.equal((await api('/community/staff/notifications', 'POST', { ...base, scheduledAt })).status, 400)
  }
  const scheduledAt = new Date(Date.now() + 3600000).toISOString()
  const scheduled = await (await api('/community/staff/notifications', 'POST', { ...base, scheduledAt })).json()
  const id = scheduled.notification.id
  assert.equal(scheduled.scheduled, true)
  assert.equal((await (await api('/community/updates', 'GET', undefined, null)).json()).total, 0)
  assert.equal((await (await api('/community/notifications', 'GET', undefined, customer)).json()).total, 0)
  assert.equal((await (await api('/community/staff/scheduled')).json()).items[0].imageUrl, base.imageUrl)
  assert.equal((await api(`/community/staff/scheduled/${id}`, 'DELETE', undefined, customer)).status, 403)
  const cancelled = await (await api('/community/staff/notifications', 'POST', { ...base, scheduledAt })).json()
  assert.equal((await api(`/community/staff/scheduled/${cancelled.notification.id}`, 'DELETE')).status, 200)
  assert.equal((await api(`/community/staff/scheduled/${cancelled.notification.id}`, 'DELETE')).status, 404)
  db.sqlite.prepare("UPDATE community_scheduled_notifications SET scheduled_at = '2020-01-01T00:00:00.000Z'").run()
  db.failBatchAt = 1
  await runCommunityExpansionChecks(config)
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 0)
  db.failBatchAt = null
  await Promise.all([runCommunityExpansionChecks(config), runCommunityExpansionChecks(config)])
  await runCommunityExpansionChecks(config)
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 1)
  assert.equal((await api(`/community/staff/scheduled/${id}`, 'DELETE')).status, 404)
  const updates = await (await api('/community/updates', 'GET', undefined, null)).json()
  assert.equal(updates.items[0].id, id)
  assert.equal(updates.items[0].imageUrl, base.imageUrl)
  assert.equal(updates.items[0].body, base.body)
  await api('/community/staff/notifications', 'POST', { ...base, audience: 'staff' })
  await api('/community/staff/notifications', 'POST', { ...base, kind: 'announcement' })
  await api('/community/staff/notifications', 'POST', { ...base, audience: 'product', productId: 'other-product' })
  assert.equal((await (await api('/community/updates', 'GET', undefined, null)).json()).total, 2)
  await api('/community/preferences', 'PUT', { updates: true, announcements: true, ticketReplies: true, products: ['shards'] }, customer)
  const inbox = await (await api('/community/notifications', 'GET', undefined, customer)).json()
  assert.equal(inbox.total, 2)
  assert.equal(inbox.items.some(item => item.audience === 'staff' || item.productId === 'other-product'), false)
})

test('published issue subscriptions send private generic notifications, never draft changes', async t => {
  const { db, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const other = await tokenFor('123456789012345679', 'Other')
  const issueBody = { title: 'Known issue', body: 'Sanitized public details', status: 'open', published: true }
  const created = await (await api('/community/staff/issues', 'POST', issueBody)).json()
  const id = created.issue.id
  assert.equal((await api(`/community/issues/${id}/subscription`, 'PUT', { subscribed: true }, null)).status, 401)
  assert.equal((await api(`/community/issues/${id}/subscription`, 'PUT', { subscribed: 'yes' }, customer)).status, 400)
  assert.equal((await (await api(`/community/issues/${id}/subscription`, 'PUT', { subscribed: true }, customer)).json()).subscribed, true)
  await api(`/community/issues/${id}/subscription`, 'PUT', { subscribed: true }, customer)
  await api('/community/preferences', 'PUT', { updates: false, announcements: false, ticketReplies: false, products: [] }, customer)
  await api(`/community/staff/issues/${id}`, 'PUT', { ...issueBody, status: 'resolved' })
  await api(`/community/staff/issues/${id}`, 'PUT', { ...issueBody, status: 'resolved' })
  let inbox = await (await api('/community/notifications', 'GET', undefined, customer)).json()
  assert.equal(inbox.total, 1)
  assert.equal(inbox.items[0].kind, 'issue')
  assert.equal(inbox.items[0].link, '/known-issues?channel=known-issues')
  assert.match(inbox.items[0].title, /resolved/)
  assert.equal((await api(`/community/notifications/${inbox.items[0].id}/read`, 'POST', {}, customer)).status, 200)
  assert.equal((await api(`/community/notifications/${inbox.items[0].id}/read`, 'POST', {}, other)).status, 404)
  assert.equal((await (await api('/community/notifications', 'GET', undefined, other)).json()).total, 0)
  await api(`/community/staff/issues/${id}`, 'PUT', { ...issueBody, body: 'SECRET_PRIVATE_DRAFT', published: false })
  assert.equal((await api(`/community/issues/${id}/subscription`, 'GET', undefined, customer)).status, 404)
  await api(`/community/staff/issues/${id}`, 'PUT', { ...issueBody, body: 'SECRET_PRIVATE_EDIT', published: false })
  inbox = await (await api('/community/notifications', 'GET', undefined, customer)).json()
  assert.equal(inbox.total, 1)
  assert.doesNotMatch(JSON.stringify(inbox), /SECRET|Sanitized/)
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_issue_subscriptions').get().n, 1)
})

test('effective service changes produce incident history, hidden automatic changes and unchanged states do not', async t => {
  const { db, api } = await accessFixture(t)
  const update = (status, message = '') => api('/community/staff/status/website', 'PUT', { status, message })
  await update('outage', 'Investigating a public website outage')
  await update('outage', 'Updated message without a transition')
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_incidents').get().n, 1)
  db.sqlite.prepare("UPDATE community_service_status SET automatic_status = 'operational' WHERE service_id = 'website'").run()
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_incidents').get().n, 1)
  await update('maintenance', 'Planned maintenance')
  await update('auto')
  const history = await (await api('/community/incidents?pageSize=2', 'GET', undefined, null)).json()
  assert.equal(history.total, 3)
  assert.equal(history.items.length, 2)
  const rows = db.sqlite.prepare('SELECT * FROM community_incidents ORDER BY rowid').all()
  assert.deepEqual(rows.map(row => [row.previous_status, row.status]), [['unknown', 'outage'], ['outage', 'maintenance'], ['maintenance', 'operational']])
  assert.equal(rows.every(row => row.resolved_at), true)
  assert.equal(rows[2].message, '')
  db.sqlite.prepare("UPDATE community_service_status SET automatic_status = 'outage' WHERE service_id = 'website'").run()
  assert.equal(db.sqlite.prepare('SELECT status, resolved_at FROM community_incidents ORDER BY rowid DESC LIMIT 1').get().resolved_at, null)
})

test('follow-up reminders deduplicate unanswered cycles and exclude closed, waiting and staff-last tickets', async t => {
  const { db, config, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer_PII')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const payloads = []
  globalThis.fetch = async (input, options) => {
    assert.equal(new URL(input).hostname, 'discord.com')
    payloads.push(JSON.parse(options.body))
    return new Response(null, { status: 204 })
  }
  async function create() {
    return (await (await api('/community/tickets', 'POST', {
      type: 'support', title: 'Private title @everyone', body: 'Private log license-key-secret',
    }, customer)).json()).ticket.id
  }
  const ids = await Promise.all([create(), create(), create(), create()])
  await api(`/community/staff/tickets/${ids[1]}`, 'PUT', { status: 'closed' })
  await api(`/community/staff/tickets/${ids[2]}`, 'PUT', { status: 'waiting' })
  await api(`/community/tickets/${ids[3]}/replies`, 'POST', { body: 'Staff response' })
  await api(`/community/staff/tickets/${ids[3]}`, 'PUT', { status: 'open' })
  config.DISCORD_BUG_REPORT_WEBHOOK = 'https://discord.com/api/webhooks/123456/test-secret'
  const past = new Date(Date.now() - 26 * 3600000).toISOString()
  db.sqlite.prepare("UPDATE community_tickets SET unanswered_since = ? WHERE status = 'open'").run(past)
  await Promise.all([runCommunityExpansionChecks(config), runCommunityExpansionChecks(config)])
  await runCommunityExpansionChecks(config)
  assert.equal(payloads.length, 1)
  assert.match(payloads[0].content, /^This ticket has not been answered for 26 hours\. \[Open ticket\]\(https:\/\/lumenstudio\.fyi\/admin\/\?ticket=/)
  assert.deepEqual(payloads[0].allowed_mentions, { parse: [] })
  assert.doesNotMatch(JSON.stringify(payloads), /Private|Customer_PII|everyone|license-key-secret|test-secret/)
  await api(`/community/tickets/${ids[0]}/replies`, 'POST', { body: 'Still waiting, same cycle' }, customer)
  await runCommunityExpansionChecks(config)
  assert.equal(payloads.length, 1)
  await api(`/community/tickets/${ids[0]}/replies`, 'POST', { body: 'Please send more details' })
  await api(`/community/tickets/${ids[0]}/replies`, 'POST', { body: 'New customer response' }, customer)
  await runCommunityExpansionChecks(config)
  assert.equal(payloads.length, 1)
  db.sqlite.prepare('UPDATE community_tickets SET unanswered_since = ? WHERE id = ?').run(past, ids[0])
  await runCommunityExpansionChecks(config)
  assert.equal(payloads.length, 2)
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM community_ticket_followups WHERE state = 'sent'").get().n, 2)
})

test('follow-up retries back off explicit transient failures but never replay ambiguous delivery', async t => {
  const { db, config, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const id = (await (await api('/community/tickets', 'POST', { type: 'support', title: 'Retry test', body: 'A customer question' }, customer)).json()).ticket.id
  const past = new Date(Date.now() - 26 * 3600000).toISOString()
  db.sqlite.prepare('UPDATE community_tickets SET unanswered_since = ? WHERE id = ?').run(past, id)
  config.DISCORD_BUG_REPORT_WEBHOOK = 'https://discord.com/api/webhooks/123456/test-secret'
  let calls = 0
  globalThis.fetch = async () => { calls++; return new Response(null, { status: 429 }) }
  await runCommunityExpansionChecks(config)
  await runCommunityExpansionChecks(config)
  assert.equal(calls, 1)
  assert.equal(db.sqlite.prepare('SELECT state FROM community_ticket_followups').get().state, 'pending')
  db.sqlite.prepare('UPDATE community_ticket_followups SET next_attempt_at = ?').run(past)
  globalThis.fetch = async () => { calls++; throw new Error('Ambiguous delivery with secret URL') }
  await runCommunityExpansionChecks(config)
  await runCommunityExpansionChecks(config)
  assert.equal(calls, 2)
  assert.equal(db.sqlite.prepare('SELECT state FROM community_ticket_followups').get().state, 'failed')
})

test('trial review grants once only after verifying active linked product and no owned entitlement', async t => {
  const { db, config, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const other = await tokenFor('123456789012345679', 'Other')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let grants = 0
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    assert.equal(options.headers.Authorization, `Bearer ${config.LICENSE_ADMIN_API_TOKEN}`)
    if (url.pathname === '/v1/admin/products') return Response.json({ items: [{ productId: '1', active: true, plugins: ['shards-plugin'] }], page: 1, pageSize: 100, total: 1 })
    if (url.pathname === `/v1/admin/customers/${customerId}`) return Response.json({ customerDiscordId: customerId, status: 'active', products: [] })
    assert.equal(url.pathname, '/v1/admin/licenses')
    const body = JSON.parse(options.body)
    assert.equal(body.customerDiscordId, customerId)
    assert.equal(body.productId, '1')
    assert.ok(Math.abs(Date.parse(body.expiresAt) - Date.now() - 9 * 86400000) < 10000)
    grants++
    return Response.json({ licenseId: 'license-1', licenseKey: 'secret-license-key' }, { status: 201 })
  }
  const created = await (await api('/community/trials', 'POST', { productId: '1', reason: 'I want to evaluate this plugin.', requestedDurationDays: 3 }, customer)).json()
  const id = created.item.id
  assert.equal(created.item.status, 'pending')
  assert.equal(created.item.requestedDurationDays, 3)
  assert.equal((await api('/community/trials', 'POST', { productId: '1', reason: 'Duplicate request' }, customer)).status, 409)
  assert.equal((await api('/community/trials', 'POST', { productId: '1', reason: 'x'.repeat(13000) }, customer)).status, 413)
  assert.equal((await (await api('/community/trials', 'GET', undefined, other)).json()).total, 0)
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' }, customer)).status, 403)
  const statuses = await Promise.all([1, 2].map(() => api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved', durationDays: 9, reviewNote: 'Approved after review' }).then(response => response.status)))
  assert.deepEqual(statuses.sort(), [200, 409])
  assert.equal(grants, 1)
  assert.equal(db.sqlite.prepare('SELECT status FROM community_trials WHERE id = ?').get(id).status, 'approved')
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })).status, 409)
  const inbox = await (await api('/community/notifications', 'GET', undefined, customer)).json()
  assert.equal(inbox.total, 1)
  assert.equal(inbox.items[0].kind, 'license')
  assert.doesNotMatch(JSON.stringify(inbox), /secret-license-key/)
})

test('trial requests preserve selected durations and default approval to the requested length', async t => {
  const { db, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let expiresAt
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.pathname === '/v1/admin/products') return Response.json({ items: [{ productId: '1', active: true, plugins: ['shards'] }], page: 1, pageSize: 100, total: 1 })
    if (url.pathname.includes('/customers/')) return Response.json({ customerDiscordId: customerId, status: 'active', products: [] })
    expiresAt = JSON.parse(options.body).expiresAt
    return Response.json({ licenseId: 'trial-license' }, { status: 201 })
  }
  for (const invalid of [null, 0, 2, 31, '7']) {
    assert.equal((await api('/community/trials', 'POST', { productId: '1', reason: 'Evaluate plugin', requestedDurationDays: invalid }, customer)).status, 400)
  }
  const products = ['lumenduels', 'lumenduels-premium', 'lumeneconomy', '1']
  for (const [index, days] of [1, 3, 7, 30].entries()) {
    const response = await api('/community/trials', 'POST', { productId: products[index], reason: 'Evaluate plugin', requestedDurationDays: days }, customer)
    assert.equal(response.status, 201)
    assert.equal((await response.json()).item.requestedDurationDays, days)
  }
  const listed = (await (await api('/community/staff/trials')).json()).items
  assert.deepEqual(listed.map(item => item.requestedDurationDays).sort((a, b) => a - b), [1, 3, 7, 30])
  const month = listed.find(item => item.productId === '1')
  assert.equal((await api(`/community/staff/trials/${month.id}`, 'PUT', { status: 'approved' })).status, 200)
  assert.ok(Math.abs(Date.parse(expiresAt) - Date.now() - 30 * 86400000) < 10000)
  assert.equal(db.sqlite.prepare('SELECT requested_duration_days FROM community_trials WHERE id = ?').get(month.id).requested_duration_days, 30)
  const legacy = await api('/community/trials', 'POST', { productId: 'gladiator', reason: 'Evaluate plugin' }, customer)
  assert.equal((await legacy.json()).item.requestedDurationDays, 7)
})

test('customers can select and submit trial requests during a licensing outage', async t => {
  const { db, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => { throw new Error('Licensing is offline') }
  assert.equal((await api('/community/trial-products', 'GET', undefined, null)).status, 401)
  const catalog = await (await api('/community/trial-products', 'GET', undefined, customer)).json()
  assert.ok(catalog.items.some(product => product.productId === '1' && product.name === 'LumenShards'))
  assert.ok(catalog.items.some(product => product.productId === 'lumenduels'))
  for (const productId of ['lumen-shards', 'bogus', 'unlinked', '../licenses']) {
    assert.equal((await api('/community/trials', 'POST', { productId, reason: 'Evaluate the product' }, customer)).status, 400)
  }
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_trials').get().n, 0)
  const submitted = await api('/community/trials', 'POST', { productId: '1', reason: 'Evaluate the product' }, customer)
  assert.equal(submitted.status, 201)
  const { item } = await submitted.json()
  assert.equal(item.status, 'pending')
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE audience = 'staff' AND title = 'New trial request'").get().n, 1)
  assert.equal((await api('/community/trials', 'POST', { productId: '1', reason: 'Try again' }, customer)).status, 409)
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE audience = 'staff'").get().n, 1)
  assert.equal((await api(`/community/staff/trials/${item.id}`, 'PUT', { status: 'approved' })).status, 503)
  assert.equal(db.sqlite.prepare('SELECT status FROM community_trials WHERE id = ?').get(item.id).status, 'pending')
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_trials').get().n, 1)
  db.failBatchAt = 1
  assert.equal((await api('/community/trials', 'POST', { productId: 'gladiator', reason: 'Evaluate the product' }, customer)).status, 503)
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS n FROM community_trials').get().n, 1)
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE audience = 'staff'").get().n, 1)
  db.failBatchAt = null
  assert.equal((await api('/community/trials', 'POST', { productId: 'gladiator', reason: 'Evaluate the product' }, customer)).status, 201)
})

test('trial approval verifies every registry page before granting', async t => {
  const { db, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const first = Array.from({ length: 100 }, (_, index) => ({ productId: `other-${index}`, active: false, plugins: [] }))
  let incomplete = true, grants = 0
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname === '/v1/admin/products') {
      const page = Number(url.searchParams.get('page'))
      return Response.json({ items: page === 1 ? first : incomplete ? [] : [{ productId: '1', active: true, plugins: ['shards'] }], page, pageSize: 100, total: 101 })
    }
    if (url.pathname.includes('/customers/')) return Response.json({ customerDiscordId: customerId, status: 'active', products: [] })
    grants++
    return Response.json({ licenseId: 'trial-license' }, { status: 201 })
  }
  const created = await (await api('/community/trials', 'POST', { productId: '1', reason: 'Evaluate the product' }, customer)).json()
  assert.equal((await api(`/community/staff/trials/${created.item.id}`, 'PUT', { status: 'approved' })).status, 503)
  assert.equal(grants, 0)
  assert.equal(db.sqlite.prepare('SELECT status FROM community_trials WHERE id = ?').get(created.item.id).status, 'pending')
  incomplete = false
  assert.equal((await api(`/community/staff/trials/${created.item.id}`, 'PUT', { status: 'approved' })).status, 200)
  assert.equal(grants, 1)
})

test('new licensing customers can receive trials only after confirmed customer lookup 404', async t => {
  const { db, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Prospective Customer')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let lookupStatus = 500
  let grants = 0
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.pathname === '/v1/admin/products') {
      return Response.json({ items: [{ productId: '1', active: true, plugins: ['shards'] }], page: 1, pageSize: 100, total: 1 })
    }
    if (url.pathname === `/v1/admin/customers/${customerId}`) return new Response('Customer not found', { status: lookupStatus })
    assert.equal(url.pathname, '/v1/admin/licenses')
    assert.equal(JSON.parse(options.body).customerDiscordId, customerId)
    grants++
    return Response.json({ licenseId: 'new-customer-trial', licenseKey: 'private-trial-key' }, { status: 201 })
  }
  const created = await api('/community/trials', 'POST', { productId: '1', reason: 'Try the product before buying' }, customer)
  assert.equal(created.status, 201)
  const id = (await created.json()).item.id
  for (lookupStatus of [500, 401, 403, 429]) {
    assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })).status, 503)
    assert.equal(grants, 0)
    assert.equal(db.sqlite.prepare('SELECT status FROM community_trials WHERE id = ?').get(id).status, 'pending')
  }
  lookupStatus = 404
  const result = await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })
  assert.equal(result.status, 200)
  assert.equal((await result.json()).item.status, 'approved')
  assert.equal(grants, 1)
  const inbox = await (await api('/community/notifications', 'GET', undefined, customer)).json()
  assert.equal(inbox.items[0].kind, 'license')
  assert.doesNotMatch(JSON.stringify(inbox), /private-trial-key/)
})

test('invalid configured follow-up webhooks log an explicit configuration error without their URL', async t => {
  const { config } = await accessFixture(t)
  const originalError = console.error
  const originalFetch = globalThis.fetch
  t.after(() => { console.error = originalError; globalThis.fetch = originalFetch })
  const errors = []
  console.error = (...args) => errors.push(args.join(' '))
  globalThis.fetch = async () => { assert.fail('Invalid webhook must not receive any request') }
  for (const webhook of ['invalid-secret-value', 'http://discord.com/api/webhooks/123456/private-token', 'https://attacker.example/api/webhooks/123456/private-token']) {
    config.DISCORD_BUG_REPORT_WEBHOOK = webhook
    await runCommunityExpansionChecks(config)
  }
  assert.equal(errors.length, 3)
  assert.equal(errors.every(error => /follow-up webhook configuration is invalid/.test(error)), true)
  assert.doesNotMatch(errors.join(' '), /secret-value|private-token|attacker|https?:/)
})

test('trial approvals protect paid ownership, require grants permission, and lock ambiguous grants against retry', async t => {
  const { db, api, assign } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const supportId = '123456789012345679'
  const support = await tokenFor(supportId, 'Limited Support')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  await assign(supportId, 'support_team')
  const permissions = ROLES.find(role => role.id === 'support_team').permissions.filter(permission => permission !== 'licenses.grant')
  db.sqlite.prepare('INSERT INTO website_role_permissions (role_id,permissions) VALUES (?,?)').run('support_team', JSON.stringify(permissions))
  let owned = true
  let active = true
  let grants = 0
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname === '/v1/admin/products') return Response.json({ items: [{ productId: '1', active, plugins: ['shards'] }], page: 1, pageSize: 100, total: 1 })
    if (url.pathname.includes('/customers/')) return Response.json({ customerDiscordId: customerId, status: 'active', products: owned ? [{ productId: '1', status: 'active', expiresAt: null }] : [] })
    grants++
    throw new Error('Timeout after grant may have committed')
  }
  const id = (await (await api('/community/trials', 'POST', { productId: '1', reason: 'Please evaluate my trial request' }, customer)).json()).item.id
  assert.equal((await api('/community/staff/trials', 'GET', undefined, support)).status, 403)
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'declined' }, support)).status, 403)
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' }, support)).status, 403)
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })).status, 409)
  assert.equal(grants, 0)
  owned = false; active = false
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })).status, 409)
  assert.equal(grants, 0)
  active = true
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved', durationDays: 31 })).status, 400)
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })).status, 502)
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })).status, 409)
  assert.equal(grants, 1)
  assert.equal(db.sqlite.prepare('SELECT status FROM community_trials WHERE id = ?').get(id).status, 'grant_failed')
  assert.equal((await api('/community/trials', 'POST', { productId: '1', reason: 'Retrying is not safe' }, customer)).status, 409)
})

test('staff with license-grant permission can list and approve trials without ticket-management permission', async t => {
  const { db, api, assign } = await accessFixture(t)
  const grantId = '123456789012345679'
  const grantStaff = await tokenFor(grantId, 'License staff')
  const customer = await tokenFor(customerId, 'Customer')
  await assign(grantId, 'support_team')
  db.sqlite.prepare('INSERT INTO website_role_permissions (role_id,permissions) VALUES (?,?)')
    .run('support_team', JSON.stringify(['dashboard.view', 'licenses.grant']))
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname === '/v1/admin/products') return Response.json({ items: [{ productId: '1', active: true, plugins: ['shards'] }], page: 1, pageSize: 100, total: 1 })
    if (url.pathname.includes('/customers/')) return new Response(null, { status: 404 })
    assert.equal(url.pathname, '/v1/admin/licenses')
    return Response.json({ licenseId: 'trial-license' }, { status: 201 })
  }
  const created = await (await api('/community/trials', 'POST', { productId: '1', reason: 'Evaluate the product' }, customer)).json()
  assert.equal((await api('/community/staff/trials', 'GET', undefined, grantStaff)).status, 200)
  assert.equal((await api(`/community/staff/trials/${created.item.id}`, 'PUT', { status: 'approved' }, grantStaff)).status, 200)
  assert.equal((await api('/community/staff/tickets', 'GET', undefined, grantStaff)).status, 403)
})

test('confirmed trial grants are never replayed when local finalization fails', async t => {
  const { db, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let grants = 0
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname === '/v1/admin/products') return Response.json({ items: [{ productId: '1', active: true, plugins: ['shards'] }], page: 1, pageSize: 100, total: 1 })
    if (url.pathname.includes('/customers/')) return Response.json({ customerDiscordId: customerId, status: 'active', products: [] })
    grants++
    return Response.json({ licenseKey: 'key-must-stay-private' }, { status: 201 })
  }
  const id = (await (await api('/community/trials', 'POST', { productId: '1', reason: 'Evaluate the product' }, customer)).json()).item.id
  db.failBatchAt = 1
  const result = await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })
  assert.equal(result.status, 502)
  const payload = await result.json()
  assert.match(payload.error, /grant was confirmed.*do not grant it again/)
  assert.doesNotMatch(JSON.stringify(payload), /key-must-stay-private/)
  db.failBatchAt = null
  assert.equal((await api(`/community/staff/trials/${id}`, 'PUT', { status: 'approved' })).status, 409)
  assert.equal(grants, 1)
  assert.equal(db.sqlite.prepare('SELECT status FROM community_trials WHERE id = ?').get(id).status, 'processing')
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE kind = 'license'").get().n, 0)
})

test('follow-up cron bounds each batch and honors per-ticket configured delay', async t => {
  const { db, config } = await accessFixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  config.DISCORD_BUG_REPORT_WEBHOOK = 'https://discord.com/api/webhooks/123456/test-secret'
  let sent = 0
  globalThis.fetch = async () => { sent++; return new Response(null, { status: 204 }) }
  const past = new Date(Date.now() - 3 * 3600000).toISOString()
  const insert = db.sqlite.prepare(`INSERT INTO community_tickets
    (id,owner_id,owner_name,type,title,body,status,created_at,updated_at,follow_up_hours) VALUES (?,?,?,'support','Help','Question','open',?,?,?)`)
  for (let index = 0; index < 21; index++) insert.run(crypto.randomUUID(), customerId, 'Private name', past, past, 2)
  insert.run(crypto.randomUUID(), customerId, 'Private name', past, past, 24)
  await runCommunityExpansionChecks(config)
  assert.equal(sent, 20)
  await runCommunityExpansionChecks(config)
  assert.equal(sent, 21)
  await runCommunityExpansionChecks(config)
  assert.equal(sent, 21)
})

test('community staff quotas separate reads and writes while customer reads do not spend support write quota', async t => {
  const { config, api } = await accessFixture(t)
  const customer = await tokenFor(customerId, 'Customer')
  const keys = { read: [], write: [], user: [] }
  config.ADMIN_READ_LIMITER = { limit: async ({ key }) => { keys.read.push(key); return { success: true } } }
  config.ADMIN_WRITE_LIMITER = { limit: async ({ key }) => { keys.write.push(key); return { success: true } } }
  config.ASSISTANT_LIMITER = { limit: async ({ key }) => { keys.user.push(key); return { success: false } } }
  for (let n = 0; n < 15; n++) assert.equal((await api('/community/tickets', 'GET', undefined, customer)).status, 200)
  assert.equal(keys.user.length, 0)
  assert.equal((await api('/community/trials', 'POST', { productId: 'shards', reason: 'A trial request' }, customer)).status, 429)
  assert.equal((await api('/community/staff/trials')).status, 200)
  assert.equal((await api('/community/staff/notifications', 'POST', { title: 'Staff publication', body: 'A new announcement', kind: 'announcement', audience: 'all' })).status, 201)
  assert.equal(keys.write.at(-1), `admin:${staffId}`)
  assert.equal(keys.read.at(-1), `admin:${staffId}`)
  assert.equal(keys.read[0], `community-read:${customerId}`)
})
