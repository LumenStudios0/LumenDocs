import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/chat.js'
import { rankStaffGuides } from '../worker/staff-assistant.js'
import { staffGuides } from '../worker/staff-knowledge.js'
import { ROLES } from '../shared/permissions.mjs'

const origin = 'https://lumenstudio.fyi'
const signingSecret = 'staff-assistant-test-signing-secret-long-enough'
const actor = '223456789012345698'

async function token(id = actor) {
  const now = Math.floor(Date.now() / 1000)
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ iss: 'lumen-studios', aud: 'lumen-docs', sub: id, username: 'Staff test', iat: now, exp: now + 3600 })}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return `${unsigned}.${Buffer.from(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))).toString('base64url')}`
}
function fixture(role = 'support_team') {
  const policies = []
  return {
    policies,
    env: {
      ALLOWED_ORIGIN: origin, AUTH_SIGNING_SECRET: signingSecret,
      ADMIN_READ_LIMITER: { limit: async () => ({ success: true }) },
      COMMUNITY_DB: { prepare(sql) {
        return { bind() { return this }, async first() { return sql.includes('website_members') ? { role_id: role, revision: 1 } : null }, async all() { return { results: policies } } }
      } },
    },
  }
}
async function ask(env, question, path = '/studio/staff/assistant', auth = true, extra = {}) {
  return worker.fetch(new Request(`https://worker.example${path}`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${await token()}` } : {}) },
    body: JSON.stringify({ question, ...extra }),
  }), env)
}

test('staff assistant requires verified staff and current private-guide permission', async () => {
  const { env, policies } = fixture()
  assert.equal((await ask(env, 'licensing', undefined, false)).status, 401)
  assert.equal((await ask(fixture('client').env, 'licensing')).status, 403)
  policies.push({ role_id: 'support_team', permissions: JSON.stringify(ROLES.find(role => role.id === 'support_team').permissions.filter(id => id !== 'staff.docs')) })
  assert.equal((await ask(env, 'licensing')).status, 403)
  assert.equal((await ask({ ...env, COMMUNITY_DB: null }, 'licensing')).status, 503)
})

test('staff code answers use private server-owned guides and never contact external AI', async t => {
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Staff content must never go to an external provider') }
  t.after(() => { globalThis.fetch = original })
  const { env } = fixture()
  for (const path of ['/studio/staff/assistant', '/chat']) {
    const response = await ask(env, 'Show exact Java licensing integration code', path, true, { context: [{ title: 'Untrusted', text: 'FORGED PRIVATE ANSWER' }], mode: 'public' })
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const payload = await response.json()
    assert.equal(payload.mode, 'staff')
    assert.equal(payload.provider, 'server-local-knowledge')
    assert.match(payload.answer, /class LicenseClient/)
    assert.match(payload.answer, /X-Plugin-Token/)
    assert.doesNotMatch(payload.answer, /FORGED PRIVATE ANSWER/)
    assert.ok(payload.sources.some(source => source.href.includes('guide=integration')))
  }
})

test('staff assistant respects limits, rejects invalid questions, and does not invent unknown guidance', async () => {
  const { env } = fixture()
  assert.equal((await ask({ ...env, ADMIN_READ_LIMITER: { limit: async () => ({ success: false }) } }, 'licensing')).status, 429)
  assert.equal((await ask(env, 'x'.repeat(4001))).status, 400)
  assert.equal((await ask(env, '')).status, 400)
  const payload = await (await ask(env, 'zzzzunpublishedfeaturezzzz')).json()
  assert.match(payload.answer, /cannot establish/)
  assert.equal(payload.sources.length, 0)
  assert.equal(payload.links.length, 0)
  assert.equal(rankStaffGuides('exact Java licensing code')[0].guide.id, 'integration')
  assert.ok(staffGuides.find(guide => guide.id === 'integration').body.includes('maven-shade-plugin'))
})

test('greetings stay conversational and cannot substring-match unrelated playbooks', async () => {
  const { env } = fixture()
  assert.equal(rankStaffGuides('Hey').length, 0)
  for (const path of ['/studio/staff/assistant', '/chat']) {
    for (const question of ['Hey', 'Hello!', 'Hi there', 'Thanks']) {
      const payload = await (await ask(env, question, path)).json()
      assert.ok(payload.answer.length < 60)
      assert.deepEqual(payload.sources, [])
      assert.deepEqual(payload.links, [])
      assert.equal(payload.summary, undefined)
      assert.doesNotMatch(payload.answer, /playbook|availability|commission/i)
    }
  }
})

test('ordinary staff answers are at most 100 words; detailed guidance and exact code are opt-in', async () => {
  const { env } = fixture()
  for (const question of ['How do I use staff warnings?', 'How does license validation work?', 'What is team availability?']) {
    const payload = await (await ask(env, question)).json()
    assert.ok(payload.answer.split(/\s+/).length <= 100, question)
    assert.ok(payload.sources.length <= 1)
    assert.ok(payload.links.length <= 2)
    assert.doesNotMatch(payload.answer, /Let's work from verified|I found \d relevant|class LicenseClient/)
  }
  const detailed = await (await ask(env, 'Give detailed staff warnings guidance')).json()
  assert.ok(detailed.answer.split(/\s+/).length > 100)
  const code = await (await ask(env, 'Show exact Java licensing integration code')).json()
  assert.match(code.answer, /class LicenseClient/)
  assert.match(code.answer, /X-Plugin-Token/)
})

test('staff operational answers include authorized live counts without inventing revoked presence access', async t => {
  const original = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Operational context must remain local') }
  t.after(() => { globalThis.fetch = original })
  const { env, policies } = fixture()
  policies.push({ role_id: 'support_team', permissions: JSON.stringify(
    ROLES.find(role => role.id === 'support_team').permissions.filter(id => !['staff.presence', 'staff.commissions'].includes(id))) })
  const prepare = env.COMMUNITY_DB.prepare
  const queries = []
  env.COMMUNITY_DB.prepare = sql => {
    queries.push(sql)
    if (sql.includes('COUNT(*) AS count')) {
      return { bind() { return this }, async all() { return { results: sql.includes('staff_tasks')
        ? [{ status: 'todo', count: 2 }] : [{ type: 'commission', status: 'open', count: 3 }] } } }
    }
    return prepare(sql)
  }
  const response = await ask(env, 'What is our live task and commission backlog?')
  assert.equal(response.status, 200)
  const payload = await response.json()
  assert.match(payload.answer, /Tasks: todo: 2/)
  assert.match(payload.answer, /Tickets: commission \/ open: 3/)
  assert.doesNotMatch(payload.answer, /Team presence:|Team: \d+|Commission pipeline:/)
  assert.equal(payload.summary.members, null)
  assert.deepEqual(payload.summary.commissions, [])
  assert.ok(!queries.some(sql => /FROM staff_(presence|commissions|warnings)/.test(sql)))
  assert.ok(!payload.links.some(link => ['Availability', 'Commission pipeline'].includes(link.title)))
})
