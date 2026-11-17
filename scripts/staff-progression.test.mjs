import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { handleCommunity } from '../worker/community.js'
import { getAdminRole, getStaffMembers } from '../worker/access-control.js'
import {
  saveTicketRating,
  staffProgress,
  staffProgressionRoute,
  ticketClosureStatements,
  utcWindowStart,
} from '../worker/staff-progression.js'

const staffId = '123456789012345678'
const otherStaffId = '123456789012345679'
const ownerId = '223456789012345678'
const databaseBatch = Symbol('batch statement')

async function setup(fullSchema = false) {
  const sqlite = new DatabaseSync(':memory:')
  if (fullSchema) {
    const directory = new URL('../worker/migrations/community/', import.meta.url)
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      sqlite.exec(await readFile(new URL(name, directory), 'utf8'))
    }
  } else {
    sqlite.exec(`CREATE TABLE community_tickets (
    id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, status TEXT NOT NULL,
    assignee_id TEXT, rating_score INTEGER, rating_comment TEXT
  );
  CREATE TABLE community_replies (
    id TEXT PRIMARY KEY, ticket_id TEXT, staff INTEGER, author_id TEXT
  );
  CREATE TABLE website_members (
    discord_id TEXT PRIMARY KEY, username TEXT, display_name TEXT
  );`)
    sqlite.exec(await readFile(new URL('../worker/migrations/community/0021_staff_progression.sql', import.meta.url), 'utf8'))
  }
  const db = {
    sqlite,
    prepare(query) {
      let params = []
      const statement = {
        bind(...values) { params = values; return statement },
        async first() { return sqlite.prepare(query).get(...params) ?? null },
        async all() { return { results: sqlite.prepare(query).all(...params) } },
        async run() {
          const result = sqlite.prepare(query).run(...params)
          return { meta: { changes: Number(result.changes) } }
        },
      }
      statement[databaseBatch] = () => ({ query, params })
      return statement
    },
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(statement => {
          const { query, params } = statement[databaseBatch]()
          const result = sqlite.prepare(query).run(...params)
          return { meta: { changes: Number(result.changes) } }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
  }
  sqlite.prepare('INSERT INTO website_members(discord_id, username, display_name) VALUES (?, ?, ?)').run(staffId, 'agent', 'Verified Agent')
  sqlite.prepare('INSERT INTO website_members(discord_id, username, display_name) VALUES (?, ?, ?)').run(otherStaffId, 'second', 'Second Staff')
  return db
}

function addTicket(db, id, { owner = ownerId, assignee = staffId, status = 'open' } = {}) {
  db.sqlite.prepare('INSERT INTO community_tickets(id, owner_id, status, assignee_id) VALUES (?, ?, ?, ?)')
    .run(id, owner, status, assignee)
}

function addReplies(db, ticketId, count, { author = staffId, assigned = staffId } = {}) {
  const insert = db.sqlite.prepare('INSERT INTO community_replies(id, ticket_id, staff, author_id, assignee_id) VALUES (?, ?, 1, ?, ?)')
  for (let index = 0; index < count; index++) insert.run(`${ticketId}-reply-${index}`, ticketId, author, assigned)
}

async function close(db, ticketId, { actor = staffId, eligibleAtRequest = true } = {}) {
  db.sqlite.prepare("UPDATE community_tickets SET status = 'closed' WHERE id = ?").run(ticketId)
  await db.batch(ticketClosureStatements(db, { ticketId, staffId: actor, now: '2026-11-16T12:00:00.000Z', eligibleAtRequest }))
}

test('closure awards 100 XP only after six assigned public replies and only once', async t => {
  const db = await setup()
  t.after(() => db.sqlite.close())
  addTicket(db, 'eligible')
  addReplies(db, 'eligible', 6)
  await close(db, 'eligible')
  assert.equal(db.sqlite.prepare("SELECT points FROM staff_xp_ledger WHERE source_type = 'ticket_close'").get().points, 100)

  db.sqlite.prepare("UPDATE community_tickets SET status = 'open', assignee_id = ? WHERE id = 'eligible'").run(otherStaffId)
  await close(db, 'eligible', { actor: otherStaffId })
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM staff_xp_ledger').get().count, 1)
  assert.equal(db.sqlite.prepare('SELECT assigned_staff_id FROM staff_ticket_closures WHERE ticket_id = ?').get('eligible').assigned_staff_id, staffId)
})

test('five replies, replies under another assignment, unassigned closure, and self-tickets earn no XP', async t => {
  const db = await setup()
  t.after(() => db.sqlite.close())
  addTicket(db, 'five')
  addReplies(db, 'five', 5)
  await close(db, 'five')
  addTicket(db, 'assignment')
  addReplies(db, 'assignment', 6, { assigned: otherStaffId })
  await close(db, 'assignment')
  addTicket(db, 'unassigned', { assignee: null })
  addReplies(db, 'unassigned', 6)
  await close(db, 'unassigned')
  addTicket(db, 'self', { owner: staffId })
  addReplies(db, 'self', 6)
  await close(db, 'self')
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM staff_xp_ledger').get().count, 0)
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM staff_ticket_closures').get().count, 4)
})

test('ticket owner may rate once, only eligible closure receives star-based bonus XP', async t => {
  const db = await setup()
  t.after(() => db.sqlite.close())
  addTicket(db, 'eligible', { status: 'closed' })
  addReplies(db, 'eligible', 6)
  await db.batch(ticketClosureStatements(db, {
    ticketId: 'eligible', staffId, now: '2026-11-16T12:00:00.000Z', eligibleAtRequest: true,
  }))
  assert.equal((await saveTicketRating(db, 'eligible', otherStaffId, 5, '', '2026-11-16T12:01:00.000Z')).status, 404)
  const saved = await saveTicketRating(db, 'eligible', ownerId, 4, 'Helpful', '2026-11-16T12:01:00.000Z')
  assert.deepEqual(saved, { status: 200, rating: { score: 4, comment: 'Helpful' } })
  assert.equal((await saveTicketRating(db, 'eligible', ownerId, 5, '', '2026-11-16T12:02:00.000Z')).status, 409)
  assert.equal(db.sqlite.prepare("SELECT points FROM staff_xp_ledger WHERE source_type='rating_bonus'").get().points, 80)

  addTicket(db, 'ineligible', { status: 'closed' })
  await db.batch(ticketClosureStatements(db, {
    ticketId: 'ineligible', staffId, now: '2026-11-16T12:00:00.000Z', eligibleAtRequest: false,
  }))
  assert.equal((await saveTicketRating(db, 'ineligible', ownerId, 5, '', '2026-11-16T12:03:00.000Z')).status, 200)
  assert.equal(db.sqlite.prepare("SELECT COUNT(*) AS count FROM staff_xp_ledger WHERE source_type='rating_bonus'").get().count, 1)
})

test('leaderboard uses Monday UTC, month UTC, all-time totals, and unlimited levels', async t => {
  const db = await setup()
  t.after(() => db.sqlite.close())
  const now = new Date()
  const weeklyStart = utcWindowStart('weekly', now)
  const monthlyStart = utcWindowStart('monthly', now)
  const priorWeek = new Date(Date.parse(weeklyStart) - 7 * 86400000).toISOString()
  const priorMonth = new Date(Date.parse(monthlyStart) - 1).toISOString()
  const insert = db.sqlite.prepare(`INSERT INTO staff_xp_ledger
    (id, staff_id, points, source_type, source_id, created_at) VALUES (?, ?, ?, 'ticket_close', ?, ?)`)
  insert.run('this-week', staffId, 10050, 'week-ticket', weeklyStart)
  insert.run('last-week', staffId, 40, 'old-week-ticket', priorWeek)
  insert.run('old-month', otherStaffId, 300, 'old-month-ticket', priorMonth)
  assert.deepEqual(await staffProgress({ COMMUNITY_DB: db }, staffId), { xp: 10090, level: 101 })
  const deps = { getStaffMembers: async () => [{ id: staffId }, { id: otherStaffId }] }
  const helpers = { json: (_request, payload, status) => ({ payload, status }) }
  const request = window => new Request(`https://worker.example/community/staff/progression?window=${window}`)
  const access = { permissions: ['dashboard.view', 'tickets.view'] }
  const currentUser = { id: staffId }

  const weekly = await staffProgressionRoute(request('weekly'), { COMMUNITY_DB: db }, '/staff/progression',
    currentUser, access, deps, helpers)
  assert.equal(weekly.payload.leaderboard.find(member => member.id === staffId).windowXp, 10050)
  assert.equal(weekly.payload.currentStaff.level, 101)
  const monthly = await staffProgressionRoute(request('monthly'), { COMMUNITY_DB: db }, '/staff/progression',
    currentUser, access, deps, helpers)
  assert.equal(monthly.payload.leaderboard.some(member => member.id === otherStaffId), false)
  const allTime = await staffProgressionRoute(request('all-time'), { COMMUNITY_DB: db }, '/staff/progression',
    currentUser, access, deps, helpers)
  assert.equal(allTime.payload.leaderboard.find(member => member.id === staffId).windowXp, 10090)
})

test('HTTP ticket replies, closure, owner rating, and private leaderboard award XP once', async t => {
  const db = await setup(true)
  t.after(() => db.sqlite.close())
  db.sqlite.prepare("UPDATE website_members SET role_id = 'support_team' WHERE discord_id = ?").run(staffId)
  const limiter = { limit: async () => ({ success: true }) }
  const env = {
    COMMUNITY_DB: db,
    ADMIN_READ_LIMITER: limiter,
    ADMIN_WRITE_LIMITER: limiter,
    ASSISTANT_LIMITER: limiter,
  }
  const users = new Map([
    [staffId, { id: staffId, username: 'agent', globalName: 'Verified Agent' }],
    [ownerId, { id: ownerId, username: 'customer', globalName: 'Ticket Customer' }],
    [otherStaffId, { id: otherStaffId, username: 'outsider', globalName: 'Another Member' }],
  ])
  const deps = {
    respond: (payload, status) => Response.json(payload, { status }),
    verifyLoginToken: async token => users.get(token) || null,
    getAdminRole,
    getStaffMembers,
  }
  const call = (path, method = 'GET', body, actor = staffId) => handleCommunity(
    new Request(`https://worker.example/community${path}`, {
      method,
      headers: { Authorization: `Bearer ${actor}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
    env, 'https://lumenstudio.fyi', `/community${path.split('?')[0]}`, deps,
  )

  const created = await call('/tickets', 'POST', {
    type: 'support', title: 'Private support request', body: 'Please help diagnose this issue.',
  }, ownerId)
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()))
  const ticketId = (await created.json()).ticket.id
  const assign = await call(`/staff/tickets/${ticketId}`, 'PUT', { status: 'open', assigneeId: staffId })
  assert.equal(assign.status, 200)

  for (let index = 0; index < 6; index++) {
    const reply = await call(`/tickets/${ticketId}/replies`, 'POST', { body: `Public support reply ${index + 1}` })
    assert.equal(reply.status, 200, JSON.stringify(await reply.clone().json()))
  }
  const detail = await call(`/tickets/${ticketId}`, 'GET', undefined, ownerId)
  assert.equal(detail.status, 200)
  const conversation = await detail.json()
  assert.equal(conversation.replies.length, 6)
  assert.ok(conversation.replies.every(reply => reply.staff && reply.body.startsWith('Public support reply')))

  assert.equal((await call(`/staff/tickets/${ticketId}`, 'PUT', { status: 'closed' })).status, 200)
  assert.deepEqual(await staffProgress(env, staffId), { xp: 100, level: 2 })
  const snapshot = db.sqlite.prepare('SELECT staff_reply_count, eligible FROM staff_ticket_closures WHERE ticket_id = ?').get(ticketId)
  assert.equal(snapshot.staff_reply_count, 6)
  assert.equal(snapshot.eligible, 1)
  assert.equal((await call(`/staff/tickets/${ticketId}`, 'PUT', { status: 'closed' })).status, 200)
  assert.equal((await call(`/staff/tickets/${ticketId}`, 'PUT', { status: 'open' })).status, 200)
  assert.equal((await call(`/staff/tickets/${ticketId}`, 'PUT', { status: 'closed' })).status, 200)
  assert.deepEqual(await staffProgress(env, staffId), { xp: 100, level: 2 })

  assert.equal((await call(`/tickets/${ticketId}/rating`, 'PUT', { score: 5 }, otherStaffId)).status, 404)
  const rating = await call(`/tickets/${ticketId}/rating`, 'PUT', { score: 4, comment: 'Helpful support' }, ownerId)
  assert.equal(rating.status, 200, JSON.stringify(await rating.clone().json()))
  assert.deepEqual((await rating.json()).rating, { score: 4, comment: 'Helpful support' })
  assert.equal((await call(`/tickets/${ticketId}/rating`, 'PUT', { score: 5 }, ownerId)).status, 409)
  assert.deepEqual(await staffProgress(env, staffId), { xp: 180, level: 2 })
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM staff_xp_ledger WHERE source_id = ?').get(ticketId).count, 2)

  db.sqlite.prepare("UPDATE website_members SET role_id = 'support_team' WHERE discord_id = ?").run(otherStaffId)
  db.sqlite.prepare(`INSERT INTO staff_xp_ledger(id,staff_id,points,source_type,source_id,created_at)
    VALUES (?,?,100,'ticket_close',?,?)`)
    .run(crypto.randomUUID(), otherStaffId, crypto.randomUUID(), new Date().toISOString())
  const leaderboard = await call('/staff/progression?window=all-time')
  assert.equal(leaderboard.status, 200, JSON.stringify(await leaderboard.clone().json()))
  const result = await leaderboard.json()
  assert.deepEqual(result.leaderboard.find(member => member.id === staffId),
    { id: staffId, name: 'agent', level: 2, windowXp: 180, totalXp: 180 })
  assert.deepEqual(result.currentStaff, { level: 2, totalXp: 180 })
  const ownLogs = result.logs.filter(entry => entry.staffId === staffId)
  assert.deepEqual(ownLogs.map(entry => entry.points).sort((a, b) => a - b), [80, 100])
  assert.ok(ownLogs.every(entry => entry.ticketId === ticketId && entry.staffName === 'agent'))
  assert.ok(result.logs.some(entry => entry.staffId === otherStaffId && entry.staffName === 'second' && entry.points === 100))
  assert.ok(!JSON.stringify(result).includes('Private support request'))

  const denied = await call('/staff/progression?window=all-time', 'GET', undefined, ownerId)
  assert.equal(denied.status, 403)
  const denial = await denied.json()
  assert.equal(denial.leaderboard, undefined)
  assert.equal(denial.logs, undefined)
  assert.match(denial.error, /staff/i)
})
