import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { handleProductTools } from '../worker/product-tools.js'
import { handleCommunity } from '../worker/community.js'
import { getAdminRole, getStaffMembers, resolveAccess } from '../worker/access-control.js'
import { staffOperationalSummary } from '../worker/staff-operations.js'

const owner = '1400375985211441242'
const lead = '1012053634911064114'
const developer = '333333333333333333'
const support = '222222222222222222'
const customer = '111111111111111111'
async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:')
  const directory = new URL('../worker/migrations/community/', import.meta.url)
  for (const file of (await readdir(directory)).filter(f => f.endsWith('.sql')).sort()) {
    sqlite.exec(await readFile(new URL(file, directory), 'utf8'))
  }
  t.after(() => sqlite.close())
  for (const [id, role] of [[support, 'support_team'], [developer, 'developer'], [customer, 'client']]) {
    sqlite.prepare('INSERT INTO website_members(discord_id,display_name,role_id) VALUES (?,?,?)').run(id, role, role)
  }
  const data = Symbol('data')
  const db = {
    failAt: null,
    prepare(sql) {
      let args = []
      const stmt = {
        bind(...v) { args = v; return stmt },
        async first() { return sqlite.prepare(sql).get(...args) || null },
        async all() { return { results: sqlite.prepare(sql).all(...args) } },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } } },
        [data]: () => [sql, args],
      }
      return stmt
    },
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map((stmt, i) => {
          if (this.failAt === i) throw Error('Injected failure')
          const [sql, args] = stmt[data]()
          return { meta: { changes: Number(sqlite.prepare(sql).run(...args).changes) } }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  const limiter = { limit: async () => ({ success: true }) }
  const env = { COMMUNITY_DB: db, ADMIN_READ_LIMITER: limiter, ADMIN_WRITE_LIMITER: limiter, ASSISTANT_LIMITER: limiter }
  const deps = {
    respond: (v, status) => Response.json(v, { status }),
    verifyLoginToken: async id => /^\d{5,22}$/.test(id) ? { id, username: `member-${id}`, globalName: `member-${id}` } : null,
    getAdminRole, getStaffMembers,
  }
  const api = (path, method = 'GET', body, id = owner) => {
    const request = new Request('https://worker.example' + path, { method, headers: { Authorization: `Bearer ${id}` },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return path.startsWith('/studio') ? handleProductTools(request, env, '', path, deps) : handleCommunity(request, env, '', path, deps)
  }
  const ticket = (type = 'support', id = crypto.randomUUID(), createdAt = new Date().toISOString()) => {
    sqlite.prepare(`INSERT INTO community_tickets(id,owner_id,owner_name,type,title,body,status,created_at,updated_at)
      VALUES (?,?,'Customer',?,'Private ticket','Sensitive customer details','open',?,?)`).run(id, customer, type, createdAt, createdAt)
    return id
  }
  return { sqlite, db, env, api, ticket }
}

test('staff operations deny clients, honor permissions, expire presence and do not invent activity', async t => {
  const { api, sqlite, env } = await fixture(t)
  assert.equal((await api('/studio/staff/operations', 'GET', undefined, '')).status, 401)
  for (const path of ['/studio/staff/operations', '/studio/staff/presence', '/studio/staff/tasks', '/studio/staff/warnings', '/studio/staff/guide-feedback']) {
    assert.equal((await api(path, path.endsWith('/operations') ? 'GET' : 'POST', path.endsWith('/operations') ? undefined : {}, customer)).status, 403)
  }
  let result = await (await api('/studio/staff/operations')).json()
  assert.equal(result.members.find(m => m.id === support).lastDid, null)
  assert.equal(result.members.find(m => m.id === support).online, false)
  await api('/studio/staff/presence', 'POST', { availability: 'busy', memberId: owner }, support)
  result = await (await api('/studio/staff/operations')).json()
  assert.equal(result.members.find(m => m.id === support).online, true)
  assert.equal(result.members.find(m => m.id === support).availability, 'busy')
  assert.equal(result.members.find(m => m.id === support).lastDid, 'Changed availability')
  assert.equal(result.members.find(m => m.id === owner).lastOnline, null)
  assert.equal((await api('/studio/staff/presence', 'POST', {}, support)).status, 200)
  assert.equal(sqlite.prepare('SELECT availability FROM staff_presence WHERE member_id=?').get(support).availability, 'busy')
  sqlite.prepare('UPDATE staff_presence SET last_online=? WHERE member_id=?').run(new Date(Date.now() - 91000).toISOString(), support)
  assert.equal((await (await api('/studio/staff/operations')).json()).members.find(m => m.id === support).online, false)
  sqlite.prepare("INSERT INTO website_role_permissions(role_id,permissions) VALUES ('support_team','[]')").run()
  assert.equal((await api('/studio/staff/operations', 'GET', undefined, support)).status, 403)
  assert.ok((await resolveAccess(owner, env)).permissions.includes('staff.warnings'))
})

test('task revisions and atomic audits preserve safe generic activity and rollback failures', async t => {
  const { api, sqlite, db } = await fixture(t)
  const fields = { title: '<script>plain text</script>', body: '**Customer-sensitive note**', assigneeId: support, status: 'todo', priority: 'normal', dueAt: null }
  const response = await api('/studio/staff/tasks', 'POST', fields, support)
  assert.equal(response.status, 201)
  const { task } = await response.json()
  assert.equal(task.title, fields.title)
  assert.equal(task.revision, 0)
  assert.equal((await api(`/studio/staff/tasks/${task.id}`, 'PUT', { ...fields, status: 'done', revision: 0 }, support)).status, 200)
  const count = sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n
  assert.equal((await api(`/studio/staff/tasks/${task.id}`, 'PUT', { ...fields, revision: 0 }, support)).status, 409)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n, count)
  assert.equal((await api('/studio/staff/tasks', 'POST', { ...fields, assigneeId: customer }, support)).status, 400)
  const p = sqlite.prepare('SELECT * FROM staff_presence WHERE member_id=?').get(support)
  assert.equal(p.last_did, 'Updated a staff task')
  assert.doesNotMatch(JSON.stringify(p), /Customer-sensitive|script|111111111111111111/)
  assert.doesNotMatch(JSON.stringify(sqlite.prepare('SELECT details FROM website_access_audit').all()), /Customer-sensitive|script/)
  db.failAt = 1
  assert.equal((await api('/studio/staff/tasks', 'POST', fields, support)).status, 503)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM staff_tasks').get().n, 1)
})

test('warnings enforce strictly lower staff ranks, private visibility and target-only acknowledgement', async t => {
  const { api, sqlite } = await fixture(t)
  for (const targetId of [owner, lead, customer]) {
    assert.equal((await api('/studio/staff/warnings', 'POST', { targetId, reason: 'Review procedure' }, lead)).status, 403)
  }
  assert.equal((await api('/studio/staff/warnings', 'POST', { targetId: owner, reason: 'Review procedure' })).status, 403)
  assert.equal((await api('/studio/staff/warnings', 'POST', { targetId: support, reason: 'Review procedure' }, developer)).status, 403)
  const { warning } = await (await api('/studio/staff/warnings', 'POST', { targetId: support, reason: 'Private warning' }, lead)).json()
  assert.equal((await (await api('/studio/staff/operations', 'GET', undefined, support)).json()).warnings.length, 1)
  assert.equal((await (await api('/studio/staff/operations', 'GET', undefined, developer)).json()).warnings.length, 0)
  assert.equal((await (await api('/studio/staff/operations')).json()).warnings.length, 1)
  assert.equal((await api(`/studio/staff/warnings/${warning.id}/acknowledge`, 'POST', {}, lead)).status, 403)
  assert.equal((await api(`/studio/staff/warnings/${warning.id}/acknowledge`, 'POST', {}, support)).status, 200)
  const timestamp = sqlite.prepare('SELECT last_activity_at FROM staff_presence WHERE member_id=?').get(support).last_activity_at
  await api(`/studio/staff/warnings/${warning.id}/acknowledge`, 'POST', {}, support)
  assert.equal(sqlite.prepare('SELECT last_activity_at FROM staff_presence WHERE member_id=?').get(support).last_activity_at, timestamp)
})

test('commission pipeline is linked, revision guarded and feedback remains staff-private', async t => {
  const { api, ticket, env } = await fixture(t)
  const id = ticket('commission')
  const normal = ticket()
  let ops = await (await api('/studio/staff/operations', 'GET', undefined, support)).json()
  assert.equal(ops.commissions[0].stage, 'enquiry')
  const body = { stage: 'scoping', scope: 'Build a plugin', acceptanceCriteria: 'Pass the agreed tests', milestones: ['Prototype', 'Review'], revision: 0 }
  const saved = await api(`/studio/staff/commissions/${id}`, 'PUT', body, support)
  assert.equal(saved.status, 200)
  assert.equal((await saved.json()).commission.revision, 1)
  assert.equal((await api(`/studio/staff/commissions/${id}`, 'PUT', body, support)).status, 409)
  assert.equal((await api(`/studio/staff/commissions/${normal}`, 'PUT', body, support)).status, 404)
  assert.equal((await api('/studio/staff/guide-feedback', 'POST', { guideId: 'not-a-guide', message: 'Please improve this' }, support)).status, 400)
  assert.equal((await api('/studio/staff/guide-feedback', 'POST', { guideId: 'start-here', message: '<img src=x> plain stored text' }, support)).status, 201)
  ops = await (await api('/studio/staff/operations')).json()
  assert.equal(ops.feedback[0].message, '<img src=x> plain stored text')
  assert.equal((await api('/studio/staff/operations', 'GET', undefined, customer)).status, 403)
  const summary = await staffOperationalSummary(env, await resolveAccess(support, env))
  assert.deepEqual(summary.commissions.map(r => ({ ...r })), [{ stage: 'scoping', count: 1 }])
  assert.doesNotMatch(JSON.stringify(summary), /Build a plugin|plain stored|111111111111111111/)
})

test('editor leases prevent staff reply collisions for every type without leaking to customers', async t => {
  const { api, ticket, sqlite } = await fixture(t)
  for (const type of ['support','bug','compatibility','feature','commission','license_support']) {
    const id = ticket(type)
    assert.equal((await api(`/studio/staff/tickets/${id}/presence`, 'POST', { editing: true }, support)).status, 200)
    const presence = await (await api(`/studio/staff/tickets/${id}/presence`, 'GET', undefined, developer)).json()
    assert.equal(presence.currentStaffId, developer)
    assert.equal(presence.editors[0].id, support)
    assert.equal((await api(`/community/tickets/${id}/replies`, 'POST', { body: 'Staff reply blocked' }, developer)).status, 409)
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_replies WHERE ticket_id=?').get(id).n, 0)
    assert.equal((await api(`/community/tickets/${id}/replies`, 'POST', { body: 'Customer reply allowed' }, customer)).status, 200)
    const detail = await (await api(`/community/tickets/${id}`, 'GET', undefined, customer)).json()
    assert.equal(detail.ticket.estimatedWait.minutes, null)
    assert.doesNotMatch(JSON.stringify(detail), /editors|expiresAt|currentStaffId/)
    sqlite.prepare('UPDATE staff_ticket_editors SET expires_at=? WHERE ticket_id=?').run(new Date(Date.now() - 1000).toISOString(), id)
    assert.equal((await api(`/community/tickets/${id}/replies`, 'POST', { body: 'Actual staff response' }, developer)).status, 200)
  }
  const activity = sqlite.prepare('SELECT last_did FROM staff_presence WHERE member_id=?').get(developer)
  assert.equal(activity.last_did, "Replied to Customer's ticket")
  const id = ticket()
  await api(`/studio/staff/tickets/${id}/presence`, 'POST', { editing: true }, support)
  await api(`/studio/staff/tickets/${id}/presence`, 'POST', { editing: false }, support)
  assert.equal((await (await api(`/studio/staff/tickets/${id}/presence`)).json()).editors.length, 0)
})

test('a lease acquired after the reply was read still blocks the atomic write and its notifications', async t => {
  const { api, ticket, sqlite, db } = await fixture(t)
  const id = ticket()
  const batch = db.batch.bind(db)
  db.batch = async statements => {
    sqlite.prepare('INSERT INTO staff_ticket_editors(ticket_id,member_id,expires_at) VALUES (?,?,?)')
      .run(id, support, new Date(Date.now() + 120000).toISOString())
    db.batch = batch
    return batch(statements)
  }
  assert.equal((await api(`/community/tickets/${id}/replies`, 'POST', { body: 'A competing reply' }, developer)).status, 409)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_replies').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM staff_presence').get().n, 0)
})

test('ticket activity names the customer and distinguishes replies, updates, and closures', async t => {
  const { api, ticket, sqlite } = await fixture(t)
  const id = ticket()
  sqlite.prepare('UPDATE community_tickets SET owner_name=? WHERE id=?').run('Alex', id)
  const lastDid = () => sqlite.prepare('SELECT last_did FROM staff_presence WHERE member_id=?').get(support).last_did
  assert.equal((await api(`/community/tickets/${id}/replies`, 'POST', { body: 'Private ticket details must not appear in activity' }, support)).status, 200)
  assert.equal(lastDid(), "Replied to Alex's ticket")
  assert.equal((await api(`/community/staff/tickets/${id}`, 'PUT', { status: 'waiting' }, support)).status, 200)
  assert.equal(lastDid(), "Updated Alex's ticket")
  assert.equal((await api(`/community/staff/tickets/${id}`, 'PUT', { status: 'closed' }, support)).status, 200)
  assert.equal(lastDid(), "Closed Alex's ticket")
  assert.equal((await api(`/community/tickets/${id}/replies`, 'POST', { body: 'Rejected reply' }, support)).status, 409)
  assert.equal(lastDid(), "Closed Alex's ticket")
})

test('wait estimates use recent actual first responses by type with sample floor and closed label', async t => {
  const { api, ticket, sqlite } = await fixture(t)
  const base = Date.now() - 86400000
  for (const type of ['support','bug','compatibility','feature','commission','license_support']) {
    for (let i = 0; i < 3; i++) {
      const id = ticket(type, crypto.randomUUID(), new Date(base).toISOString())
      sqlite.prepare('INSERT INTO community_replies(id,ticket_id,author_id,author_name,staff,body,created_at) VALUES (?,?,?, ?,1,?,?)')
        .run(crypto.randomUUID(), id, support, 'Support', 'First reply', new Date(base + 10 * 60000).toISOString())
      sqlite.prepare('INSERT INTO community_replies(id,ticket_id,author_id,author_name,staff,body,created_at) VALUES (?,?,?, ?,1,?,?)')
        .run(crypto.randomUUID(), id, support, 'Support', 'Later reply', new Date(base + 100 * 60000).toISOString())
    }
  }
  const items = (await (await api('/community/tickets', 'GET', undefined, customer)).json()).items
  assert.equal(items.length, 18)
  for (const item of items) {
    assert.equal(item.estimatedWait.minutes, 10)
    assert.match(item.estimatedWait.basis, /3 .*last 30 days.*not a guarantee/)
  }
  const closed = items[0].id
  sqlite.prepare("UPDATE community_tickets SET status='closed' WHERE id=?").run(closed)
  assert.equal((await (await api(`/community/tickets/${closed}`, 'GET', undefined, customer)).json()).ticket.estimatedWait.label, 'Closed')
  const staffItems = (await (await api('/community/staff/tickets')).json()).items
  assert.ok(staffItems.every(item => item.estimatedWait))
  sqlite.prepare('DELETE FROM community_replies WHERE ticket_id IN (SELECT id FROM community_tickets WHERE type=?)').run('bug')
  for (let i = 0; i < 3; i++) {
    const createdAt = new Date(Date.now() - (i === 2 ? 40 : 1) * 86400000).toISOString()
    const id = ticket('bug', crypto.randomUUID(), createdAt)
    sqlite.prepare('INSERT INTO community_replies(id,ticket_id,author_id,author_name,staff,body,created_at) VALUES (?,?,?, ?,1,?,?)')
      .run(crypto.randomUUID(), id, support, 'Support', 'Actual reply', new Date(Date.parse(createdAt) + 60000).toISOString())
  }
  assert.equal((await (await api('/community/tickets', 'GET', undefined, customer)).json()).items.find(item => item.type === 'bug').estimatedWait.label, 'Not enough recent data')
})

test('migration extends saved staff policies only, preserves custom values and fixes Owner permissions', async t => {
  const { sqlite, env } = await fixture(t)
  // Replay just the policy portion against policies saved before the upgrade.
  sqlite.exec(`INSERT INTO website_role_permissions(role_id,permissions) VALUES
    ('guest','["forum.post"]'), ('client','["support.create"]'),
    ('support_team','["tickets.view"]'), ('developer','["plugins.view"]'),
    ('studio_lead','["staff.warnings"]')`)
  const migration = await readFile(new URL('../worker/migrations/community/0012_staff_operations.sql', import.meta.url), 'utf8')
  sqlite.exec(migration.slice(migration.indexOf('-- Append only missing defaults')))
  for (const id of ['guest','client']) {
    assert.ok(JSON.parse(sqlite.prepare('SELECT permissions FROM website_role_permissions WHERE role_id=?').get(id).permissions).every(p => !p.startsWith('staff.')))
  }
  const supportPolicy = JSON.parse(sqlite.prepare("SELECT permissions FROM website_role_permissions WHERE role_id='support_team'").get().permissions)
  assert.ok(supportPolicy.includes('tickets.view'))
  assert.ok(supportPolicy.includes('staff.tasks'))
  assert.ok(!supportPolicy.includes('staff.warnings'))
  assert.equal(JSON.parse(sqlite.prepare("SELECT permissions FROM website_role_permissions WHERE role_id='studio_lead'").get().permissions).filter(p => p === 'staff.warnings').length, 1)
  assert.ok((await resolveAccess(owner, env)).permissions.includes('staff.warnings'))
})

test('independent staff permissions allow snapshots and own warnings without exposing team presence or other warnings', async t => {
  const { api, sqlite } = await fixture(t)
  const { warning } = await (await api('/studio/staff/warnings', 'POST', { targetId: support, reason: 'Own private warning' }, lead)).json()
  await api('/studio/staff/warnings', 'POST', { targetId: developer, reason: 'Other private warning' }, lead)
  await api('/studio/staff/presence', 'POST', { availability: 'busy' }, developer)
  sqlite.prepare("INSERT INTO website_role_permissions(role_id,permissions) VALUES ('support_team',?)").run('["staff.tasks"]')
  const snapshot = await (await api('/studio/staff/operations', 'GET', undefined, support)).json()
  assert.deepEqual(snapshot.warnings.map(w => w.id), [warning.id])
  assert.ok(snapshot.members.some(m => m.id === developer && m.name && m.rank === 5))
  for (const m of snapshot.members) {
    for (const key of ['availability', 'lastOnline', 'lastDid', 'lastActivityAt', 'online']) assert.ok(!(key in m))
  }
  assert.equal((await api('/studio/staff/presence', 'POST', {}, support)).status, 403)
  assert.equal((await api(`/studio/staff/warnings/${warning.id}/acknowledge`, 'POST', {}, support)).status, 200)
  for (const permission of ['staff.commissions', 'staff.warnings', 'staff.feedback', 'staff.docs']) {
    sqlite.prepare("UPDATE website_role_permissions SET permissions=? WHERE role_id='support_team'").run(JSON.stringify([permission]))
    const result = await api('/studio/staff/operations', 'GET', undefined, support)
    assert.equal(result.status, 200)
    assert.equal((await result.json()).warnings.length, 1)
  }
})

test('heartbeats and unchanged availability do not audit or overwrite real activity; status changes are atomic', async t => {
  const { api, sqlite, db } = await fixture(t)
  await api('/studio/staff/presence', 'POST', {}, support)
  await api('/studio/staff/presence', 'POST', { availability: 'off_shift' }, support)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n, 0)
  assert.equal(sqlite.prepare('SELECT last_did FROM staff_presence WHERE member_id=?').get(support).last_did, null)
  await api('/studio/staff/presence', 'POST', { availability: 'available' }, support)
  const before = sqlite.prepare('SELECT * FROM staff_presence WHERE member_id=?').get(support)
  assert.equal(before.last_did, 'Changed availability')
  for (let i = 0; i < 5; i++) await api('/studio/staff/presence', 'POST', {}, support)
  await api('/studio/staff/presence', 'POST', { availability: 'available' }, support)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n, 1)
  assert.equal(sqlite.prepare('SELECT last_activity_at FROM staff_presence WHERE member_id=?').get(support).last_activity_at, before.last_activity_at)
  db.failAt = 1
  assert.equal((await api('/studio/staff/presence', 'POST', { availability: 'away' }, support)).status, 503)
  assert.equal(sqlite.prepare('SELECT availability FROM staff_presence WHERE member_id=?').get(support).availability, 'available')
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n, 1)
})

test('demoted or permission-revoked editor leases stop blocking replies immediately', async t => {
  const { api, sqlite, ticket } = await fixture(t)
  for (const permissions of [null, ['tickets.reply'], ['tickets.view']]) {
    const id = ticket()
    sqlite.prepare("UPDATE website_members SET role_id='support_team' WHERE discord_id=?").run(support)
    sqlite.prepare("DELETE FROM website_role_permissions WHERE role_id='support_team'").run()
    await api(`/studio/staff/tickets/${id}/presence`, 'POST', { editing: true }, support)
    if (permissions === null) sqlite.prepare("UPDATE website_members SET role_id='client' WHERE discord_id=?").run(support)
    else sqlite.prepare("INSERT INTO website_role_permissions(role_id,permissions) VALUES ('support_team',?)").run(JSON.stringify(permissions))
    assert.equal((await (await api(`/studio/staff/tickets/${id}/presence`)).json()).editors.length, 0)
    assert.equal((await api(`/community/tickets/${id}/replies`, 'POST', { body: 'Authorized actual response' }, developer)).status, 200)
  }
})

test('assistant presence aggregates use actual expiry and availability and are permission filtered', async t => {
  const { api, sqlite, env } = await fixture(t)
  await api('/studio/staff/presence', 'POST', { availability: 'available' }, support)
  await api('/studio/staff/presence', 'POST', { availability: 'busy' }, developer)
  sqlite.prepare('UPDATE staff_presence SET last_online=? WHERE member_id=?').run(new Date(Date.now() - 91000).toISOString(), developer)
  const summary = await staffOperationalSummary(env, await resolveAccess(owner, env))
  assert.deepEqual(summary.members, { total: 4, online: 1, offline: 3, unreported: 2, availability: { available: 1, busy: 1, away: 0, off_shift: 0 } })
  assert.deepEqual(summary.presence, [
    { availability: 'available', count: 1 }, { availability: 'busy', count: 1 },
    { availability: 'away', count: 0 }, { availability: 'off_shift', count: 0 },
  ])
  assert.doesNotMatch(JSON.stringify(summary.members), /222222|333333|member|Support|Developer/)
  sqlite.prepare("INSERT INTO website_role_permissions(role_id,permissions) VALUES ('support_team','[\"staff.tasks\"]')").run()
  assert.equal((await staffOperationalSummary(env, await resolveAccess(support, env))).members, null)
  assert.deepEqual((await staffOperationalSummary(env, await resolveAccess(support, env))).presence, [])
})

test('every ticket type needs three recent actual initial staff responses, not customer or later replies', async t => {
  const { api, sqlite, ticket } = await fixture(t)
  const types = ['support', 'bug', 'compatibility', 'feature', 'commission', 'license_support']
  const opened = new Date(Date.now() - 86400000).toISOString()
  const reply = (id, minutes, staff = 1) => sqlite.prepare(`INSERT INTO community_replies
    (id,ticket_id,author_id,author_name,staff,body,created_at) VALUES (?,?,?,'Member',?,'Actual response',?)`)
    .run(crypto.randomUUID(), id, staff ? support : customer, staff, new Date(Date.parse(opened) + minutes * 60000).toISOString())
  const thirds = []
  for (const type of types) {
    for (let i = 0; i < 3; i++) {
      const id = ticket(type, crypto.randomUUID(), opened)
      reply(id, 1, 0)
      if (i < 2) { reply(id, 10); reply(id, 100) } else thirds.push(id)
    }
  }
  const initial = (await (await api('/community/tickets', 'GET', undefined, customer)).json()).items
  assert.ok(initial.every(item => item.estimatedWait.minutes === null && item.estimatedWait.label === 'Not enough recent data'))
  for (const id of thirds) reply(id, 10)
  const updated = (await (await api('/community/tickets', 'GET', undefined, customer)).json()).items
  assert.ok(updated.every(item => item.estimatedWait.minutes === 10))
})

test('warning insertion rejects a target promoted after preflight without recording a warning or activity', async t => {
  const { api, sqlite, db } = await fixture(t)
  const batch = db.batch.bind(db)
  db.batch = async statements => {
    sqlite.prepare("UPDATE website_members SET role_id='studio_lead' WHERE discord_id=?").run(support)
    db.batch = batch
    return batch(statements)
  }
  assert.equal((await api('/studio/staff/warnings', 'POST', { targetId: support, reason: 'A stale rank check' }, lead)).status, 409)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM staff_warnings').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM website_access_audit').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM staff_presence').get().n, 0)
})

test('estimate query failure happens before ticket creation, never reporting failure for an already-saved ticket', async t => {
  const { api, sqlite, db } = await fixture(t)
  const prepare = db.prepare.bind(db)
  db.prepare = sql => {
    if (sql.includes('first_reply_at')) throw Error('Injected estimate failure')
    return prepare(sql)
  }
  assert.equal((await api('/community/tickets', 'POST', { type: 'support', title: 'New ticket', body: 'A valid request body' }, customer)).status, 503)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_tickets').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_ticket_alerts').get().n, 0)
})
