import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { handleProductTools, runProductChecks } from '../worker/product-tools.js'
import worker from '../worker/chat.js'
import { handlePluginDownloads } from '../worker/plugin-downloads.js'
import { messageProfiles } from '../worker/profiles.js'
import { checkCouponUses, runCouponChecks } from '../worker/coupon-rewards.js'
import { backgrounds, frames, decorations } from '../shared/profile-cosmetics.mjs'

async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:')
  const directory = new URL('../worker/migrations/community/', import.meta.url)
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(await readFile(new URL(name, directory), 'utf8'))
  }
  t.after(() => sqlite.close())
  const state = Symbol('statement')
  const db = {
    prepare(sql) {
      let params = []
      const statement = {
        bind(...values) { params = values; return statement },
        async first() { return sqlite.prepare(sql).get(...params) || null },
        async all() { return { results: sqlite.prepare(sql).all(...params) } },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } } },
        [state]: () => [sql, params],
      }
      return statement
    },
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(statement => {
          const [sql, params] = statement[state]()
          return { meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  const owner = '1400375985211441242'
  const customer = '123456789012345678'
  const env = {
    COMMUNITY_DB: db,
    LICENSE_API_URL: 'https://licenses.example',
    LICENSE_ADMIN_API_TOKEN: 'server-secret',
    ADMIN_READ_LIMITER: { limit: async () => ({ success: true }) },
    ADMIN_WRITE_LIMITER: { limit: async () => ({ success: true }) },
    ASSISTANT_LIMITER: { limit: async () => ({ success: true }) },
  }
  const deps = {
    respond: (body, status) => Response.json(body, { status }),
    verifyLoginToken: async token => /^\d+$/.test(token) ? { id: token } : null,
  }
  const call = (path, method = 'GET', body, token = owner) => handleProductTools(new Request('https://worker.example' + path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, 'https://lumenstudio.fyi', path.split('?')[0], deps)
  return { sqlite, env, call, owner, customer }
}

test('coupon checks issue private single-use review and permanent loyalty rewards only once', async t => {
  const { call, env, customer, sqlite, owner } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'
  env.BUILDBYBIT_RESOURCE_IDS = '1001,1002'
  sqlite.prepare('INSERT INTO website_members(discord_id,registered_at) VALUES (?,?)').run(customer, '2026-01-01')
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  const posts = []
  const issued = new Map()
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.hostname === 'api.builtbybit.com' && url.pathname.endsWith('/reviews')) return Response.json({
      result: 'success', data: { reviews: [
        { review_id: 11, resource_id: 1001, reviewer_id: 55, stars: 1, Reviewer: { user_id: '55', banned: false, discord_id: customer } },
        { review_id: 12, resource_id: 1002, reviewer_id: 56, stars: 5, Reviewer: { user_id: '56', banned: false, discord_id: '223456789012345678' } },
      ], stats: { total: 2, page: 1, per_page: 100, max_page: 1 } },
    })
    if (url.hostname === 'api.builtbybit.com' && url.pathname.endsWith('/coupons') && options.method !== 'POST') {
      return Response.json({ result: 'success', data: { coupons: [...issued].map(([coupon_id]) => ({ coupon_id, uses: 0 })) } })
    }
    if (url.hostname === 'api.builtbybit.com' && url.pathname.endsWith('/coupons')) {
      const body = JSON.parse(options.body); posts.push(body)
      issued.set(posts.length, body)
      return Response.json({ result: 'success', data: { coupon: {
        coupon_id: posts.length, label: `123-${body.label}`, discount: body.discount / 100, percent: true, active: true,
        max_uses: body.max_uses || 0, max_per_user_uses: 0, expires_at: 0, all_content_types: [],
      } } })
    }
    if (url.hostname === 'api.builtbybit.com' && url.pathname.endsWith('/coupons/entries')) {
      const id = Number(url.searchParams.get('coupon_ids'))
      const entries = issued.get(id).resources.split(',').map(content_id => ({ coupon_id: id, content_type: 'resource', content_id: Number(content_id) }))
      return Response.json({ result: 'success', data: { 'coupon-entries': entries,
        stats: { total: entries.length, page: 1, per_page: 100, max_page: 1 } } })
    }
    if (url.pathname.endsWith('/products')) return Response.json({ items: Array.from({ length: 10 }, (_, i) =>
      ({ productId: `p${i}`, name: `Plugin ${i}`, active: true, plugins: [`p${i}`] })), total: 10 })
    return Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false,
      products: Array.from({ length: 3 }, (_, i) => ({ productId: `p${i}`, productActive: true, status: 'active', expiresAt: null })) })
  }
  await Promise.all([runCouponChecks(env), runCouponChecks(env)])
  await runCouponChecks(env)
  assert.equal(posts.length, 2)
  assert.equal(posts.find(post => post.discount === 10).max_uses, 1)
  assert.equal(posts.find(post => post.discount === 5).limited_uses, false)
  assert.ok(posts.every(post => post.do_expiry === false && post.resources === '1001,1002'))
  const result = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.deepEqual(result.coupons.map(item => item.kind).sort(), ['loyalty', 'review'])
  assert.ok(result.coupons.every(item => item.state === 'issued' && /^123-[A-F0-9]{14}$/.test(item.code)))
  assert.deepEqual((await (await call('/studio/coupons', 'GET', undefined, owner)).json()).coupons, [])
  assert.equal((await call('/studio/coupons', 'GET', undefined, '')).status, 401)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE recipient_id=? AND link='/account/coupons'").get(customer).n, 2)
})

test('uncertain coupon writes are never retried and partial reviews never issue rewards', async t => {
  const { env, customer, sqlite, call } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  sqlite.prepare('INSERT INTO website_members(discord_id,registered_at) VALUES (?,?)').run(customer, '2026-01-01')
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let posts = 0, incomplete = true
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.hostname === 'api.builtbybit.com' && url.pathname.endsWith('/reviews')) return Response.json({
      result: 'success', data: { reviews: [{ review_id: 11, resource_id: 1001, reviewer_id: 55, Reviewer: { user_id: '55', banned: false, discord_id: customer } }],
        stats: { total: incomplete ? 2 : 1, page: 1, per_page: 100, max_page: 1 } },
    })
    if (url.hostname === 'api.builtbybit.com' && options.method === 'POST') { posts++; throw new Error('timeout') }
    if (url.pathname.endsWith('/products')) return Response.json({ items: [{ productId: 'p', name: 'Plugin', active: true, plugins: ['p'] }], total: 1 })
    return Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false, products: [] })
  }
  await assert.rejects(runCouponChecks(env), /Incomplete/)
  assert.equal(posts, 0)
  incomplete = false
  await runCouponChecks(env)
  await runCouponChecks(env)
  assert.equal(posts, 1)
  const result = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.equal(result.coupons[0].state, 'uncertain')
  assert.equal(result.coupons[0].code, null)
})

test('coupon scope mismatch is never exposed or retried', async t => {
  const { env, customer, sqlite, call } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  sqlite.prepare('INSERT INTO website_members(discord_id,registered_at) VALUES (?,?)').run(customer, '2026-01-01')
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let posts = 0
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/reviews')) return Response.json({ result: 'success', data: {
      reviews: [{ review_id: 11, resource_id: 1001, reviewer_id: 55, Reviewer: { user_id: '55', banned: false, discord_id: customer } }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    if (url.pathname.endsWith('/coupons') && options.method !== 'POST') return Response.json({
      result: 'success', data: { coupons: [], stats: { total: 0, page: 1, per_page: 100, max_page: 0 } },
    })
    if (url.pathname.endsWith('/coupons')) {
      posts++
      const body = JSON.parse(options.body)
      return Response.json({ result: 'success', data: { coupon: { coupon_id: 1, label: `123-${body.label}`,
        discount: .1, percent: true, active: true, all_content_types: [], expires_at: 0, max_uses: 1, max_per_user_uses: 0 } } })
    }
    if (url.pathname.endsWith('/coupons/entries')) return Response.json({ result: 'success', data: {
      'coupon-entries': [{ coupon_id: 1, content_type: 'resource', content_id: 9999 }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    if (url.pathname.endsWith('/products')) return Response.json({ items: [], total: 0 })
    return Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false, products: [] })
  }
  await runCouponChecks(env)
  await runCouponChecks(env)
  assert.equal(posts, 1)
  const result = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.equal(result.coupons[0].state, 'uncertain')
  assert.equal(result.coupons[0].code, null)
  delete env.BUILDBYBIT_API_AUTHORIZATION
  const unconfigured = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.equal(unconfigured.configured, false)
  assert.equal(unconfigured.coupons[0].state, 'uncertain')
})

test('coupon checks do not expose a coupon with an unexpected decimal discount', async t => {
  const { env, customer, sqlite, call } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  sqlite.prepare('INSERT INTO website_members(discord_id,registered_at) VALUES (?,?)').run(customer, '2026-01-01')
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let posts = 0
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/reviews')) return Response.json({ result: 'success', data: {
      reviews: [{ review_id: 11, resource_id: 1001, reviewer_id: 55, Reviewer: { user_id: '55', banned: false, discord_id: customer } }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    if (url.pathname.endsWith('/coupons') && options.method !== 'POST') return Response.json({
      result: 'success', data: { coupons: [], stats: { total: 0, page: 1, per_page: 100, max_page: 0 } },
    })
    if (url.pathname.endsWith('/coupons')) {
      posts++
      const body = JSON.parse(options.body)
      return Response.json({ result: 'success', data: { coupon: { coupon_id: 1, label: `123-${body.label}`,
        discount: 10, percent: true, active: true, all_content_types: [], expires_at: 0, max_uses: 1, max_per_user_uses: 0 } } })
    }
    if (url.pathname.endsWith('/coupons/entries')) return Response.json({ result: 'success', data: {
      'coupon-entries': [{ coupon_id: 1, content_type: 'resource', content_id: 1001 }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    if (url.pathname.endsWith('/products')) return Response.json({ items: [], total: 0 })
    return Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false, products: [] })
  }
  await runCouponChecks(env)
  await runCouponChecks(env)
  assert.equal(posts, 1)
  const result = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.equal(result.coupons[0].state, 'uncertain')
  assert.equal(result.coupons[0].code, null)
})

test('coupon checks retry explicit authorization rejection only after cooldown', async t => {
  const { env, customer, sqlite } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  sqlite.prepare('INSERT INTO website_members(discord_id,registered_at) VALUES (?,?)').run(customer, '2026-01-01')
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let posts = 0
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/reviews')) return Response.json({ result: 'success', data: {
      reviews: [{ review_id: 11, resource_id: 1001, reviewer_id: 55, Reviewer: { user_id: '55', banned: false, discord_id: customer } }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    if (url.pathname.endsWith('/coupons')) { posts++; return Response.json({ error: 'Forbidden' }, { status: 403 }) }
    if (url.pathname.endsWith('/products')) return Response.json({ items: [], total: 0 })
    return Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false, products: [] })
  }
  await runCouponChecks(env)
  await runCouponChecks(env)
  assert.equal(posts, 1)
  sqlite.prepare("UPDATE coupon_rewards SET retry_at='2000-01-01' WHERE reward_key='review:11'").run()
  await runCouponChecks(env)
  assert.equal(posts, 2)
})

test('Support can grant audited one-use coupons without granting licensing powers', async t => {
  const { env, customer, sqlite, call } = await fixture(t)
  const support = '223456789012345678', junior = '323456789012345678'
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  for (const [id, role] of [[customer, 'client'], [support, 'support_team'], [junior, 'jr_support']]) {
    sqlite.prepare('INSERT INTO website_members(discord_id,role_id,registered_at) VALUES (?,?,?)').run(id, role, '2026-01-01')
  }
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let posts = 0
  globalThis.fetch = async (input, options = {}) => {
    if (new URL(input).pathname.endsWith('/coupons/entries')) return Response.json({ result: 'success', data: {
      'coupon-entries': [{ coupon_id: 1, content_type: 'resource', content_id: 1001 }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    posts++
    const body = JSON.parse(options.body)
    assert.equal(body.max_uses, 1)
    assert.equal(body.limited_uses, true)
    return Response.json({ result: 'success', data: { coupon: { coupon_id: 1, label: `123-${body.label}`,
      discount: .1, percent: true, active: true, all_content_types: [], expires_at: 0, max_uses: 1, max_per_user_uses: 0 } } })
  }
  const body = { userId: customer, discount: 10, reason: 'Ticket resolution reward', requestId: crypto.randomUUID() }
  assert.equal((await call('/studio/staff/coupons', 'POST', body, customer)).status, 403)
  assert.equal((await call('/studio/staff/coupons', 'POST', body, junior)).status, 403)
  assert.equal((await call('/studio/staff/coupons', 'POST', body, support)).status, 403)
  sqlite.prepare(`INSERT INTO staff_xp_ledger(id,staff_id,points,source_type,source_id,created_at)
    VALUES (?,?,100,'ticket_close',?,?)`).run(crypto.randomUUID(), support, crypto.randomUUID(), new Date().toISOString())
  assert.equal((await call('/studio/staff/coupons', 'POST', { ...body, userId: support }, support)).status, 403)
  assert.equal((await call('/studio/staff/coupons', 'POST', { ...body, discount: 50 }, support)).status, 400)
  assert.equal((await call('/studio/staff/coupons', 'POST', body, support)).status, 200)
  assert.equal((await call('/studio/staff/coupons', 'POST', body, support)).status, 200)
  assert.equal(posts, 1)
  assert.equal((await call('/studio/staff/coupons', 'POST', { ...body, discount: 15 }, support)).status, 409)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM website_access_audit WHERE action LIKE 'coupon.grant%'").get().n, 2)
  const rewards = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.equal(rewards.coupons[0].kind, 'manual')
  assert.equal(rewards.canGrant, false)
  assert.equal((await (await call('/studio/coupons', 'GET', undefined, support)).json()).canGrant, true)
  globalThis.fetch = async () => { posts++; throw new Error('timeout') }
  const pending = { ...body, requestId: crypto.randomUUID() }
  assert.equal((await call('/studio/staff/coupons', 'POST', pending, support)).status, 202)
  assert.equal((await call('/studio/staff/coupons', 'POST', pending, support)).status, 202)
  assert.equal((await call('/studio/staff/coupons', 'POST', { ...body, requestId: crypto.randomUUID() }, support)).status, 409)
  assert.equal(posts, 2, 'An unconfirmed grant must not trigger another creation after refresh')
})

test('Owner can grant customer coupons without farming XP while new Support still needs level 2', async t => {
  const { env, customer, sqlite, call } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  sqlite.prepare('INSERT INTO website_members(discord_id,registered_at) VALUES (?,?)').run(customer, '2026-01-01')
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  globalThis.fetch = async (input, options = {}) => {
    if (new URL(input).pathname.endsWith('/coupons/entries')) return Response.json({ result: 'success', data: {
      entries: [{ coupon_id: 1, content_type: 'resource', content_id: 1001 }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    const body = JSON.parse(options.body)
    return Response.json({ result: 'success', data: { coupon: { coupon_id: 1, label: `123-${body.label}`,
      discount: .1, percent: true, active: true, all_content_types: [], expires_at: 0, max_uses: 1, max_per_user_uses: 0 } } })
  }
  const access = await (await call('/studio/coupons')).json()
  assert.equal(access.staffLevel, 1)
  assert.equal(access.canManageCoupons, true)
  assert.equal(access.canGrant, true)
  assert.equal((await call('/studio/staff/coupons', 'POST', {
    userId: customer, discount: 10, reason: 'Owner ticket reward', requestId: crypto.randomUUID(),
  })).status, 200)
})

test('review rewards tolerate omitted optional ban flags and verify missing authors through purchase identities', async t => {
  const { env, customer, sqlite, call } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  sqlite.prepare('INSERT INTO website_members(discord_id,registered_at) VALUES (?,?)').run(customer, '2026-01-01')
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let posts = 0
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(input)
    const stats = total => ({ total, page: 1, per_page: 100, max_page: 1 })
    if (url.pathname.endsWith('/reviews')) return Response.json({ result: 'success', data: {
      reviews: [
        { review_id: 11, resource_id: 1001, reviewer_id: 55, Reviewer: { user_id: '55', discord_id: customer } },
        { review_id: 12, resource_id: 1001, reviewer_id: 55 },
        { review_id: 13, resource_id: 1001, reviewer_id: 56 },
      ], stats: stats(3),
    } })
    if (url.hostname === 'api.builtbybit.com' && url.pathname.endsWith('/licenses')) return Response.json({ result: 'success', data: {
      licenses: [{ content_type: 'resource', content_id: 1001, buyer_id: 55, Buyer: { user_id: '55', discord_id: customer } }], stats: stats(1),
    } })
    if (url.pathname.endsWith('/coupons/entries')) return Response.json({ result: 'success', data: {
      'coupon-entries': [{ coupon_id: Number(url.searchParams.get('coupon_ids')), content_type: 'resource', content_id: 1001 }], stats: stats(1),
    } })
    if (url.pathname.endsWith('/coupons') && options.method === 'POST') {
      posts++
      const body = JSON.parse(options.body)
      return Response.json({ result: 'success', data: { coupon: { coupon_id: posts, label: `123-${body.label}`,
        discount: .1, percent: true, active: true, all_content_types: [], expires_at: 0, max_uses: 1, max_per_user_uses: 0 } } })
    }
    if (url.pathname.endsWith('/coupons')) return Response.json({ result: 'success', data: { coupons: [{ coupon_id: 1, uses: 0 }, { coupon_id: 2, uses: 0 }] } })
    if (url.pathname.endsWith('/products')) return Response.json({ items: [], total: 0 })
    return Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false, products: [] })
  }
  await runCouponChecks(env)
  await runCouponChecks(env)
  assert.equal(posts, 2)
  const result = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.equal(result.checks.reviews.status, 'ok')
  assert.equal(result.coupons.length, 2)
  assert.ok(result.coupons.every(row => row.state === 'issued'))
})

test('coupon usage notifications log observed increases once without inventing buyer identities', async t => {
  const { env, sqlite, customer } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'
  sqlite.prepare(`INSERT INTO coupon_rewards(reward_key,user_id,kind,discount,state,label_suffix,code,coupon_id,created_at,updated_at)
    VALUES ('review:1',?,'review',10,'issued','abcdef','123-abcdef',1,'2026-01-01','2026-01-01')`).run(customer)
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let uses = 1
  globalThis.fetch = async () => Response.json({ result: 'success', data: { coupons: [{ coupon_id: 1, uses }] } })
  await Promise.all([checkCouponUses(env), checkCouponUses(env)])
  await checkCouponUses(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM coupon_usage_events').get().n, 1)
  const notice = sqlite.prepare("SELECT recipient_id,body FROM community_notifications WHERE title='Your coupon was used'").get()
  assert.equal(notice.recipient_id, customer)
  assert.match(notice.body, /1 new use/)
  assert.match(notice.body, /does not provide the redeemer/)
  uses = 3
  await checkCouponUses(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM coupon_usage_events').get().n, 2)
  assert.equal(sqlite.prepare('SELECT uses FROM coupon_rewards').get().uses, 3)
  uses = 2
  await assert.rejects(checkCouponUses(env), /Invalid coupon usage/)
  assert.equal(sqlite.prepare('SELECT uses FROM coupon_rewards').get().uses, 3)
})

test('uncertain coupons are reconciled read-only after exact scope verification without creating duplicates', async t => {
  const { env, sqlite, customer, call } = await fixture(t)
  env.BUILDBYBIT_API_AUTHORIZATION = 'private-test-token'; env.BUILDBYBIT_RESOURCE_IDS = '1001'
  sqlite.prepare(`INSERT INTO coupon_rewards(reward_key,user_id,kind,discount,state,label_suffix,created_at,updated_at)
    VALUES ('loyalty:old',?,'loyalty',15,'uncertain','ABCDEF12345678','2026-01-01','2026-01-01')`).run(customer)
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  let ambiguous = true
  globalThis.fetch = async (input, options = {}) => {
    assert.notEqual(options.method, 'POST', 'Reconciliation must never create a replacement code')
    const url = new URL(input)
    const stats = { total: 1, page: 1, per_page: 100, max_page: 1 }
    if (url.pathname.endsWith('/reviews')) return Response.json({ result: 'success', data: {
      reviews: [], stats: { ...stats, total: 0, max_page: 0 },
    } })
    if (url.pathname.endsWith('/coupons/entries')) return Response.json({ result: 'success', data: {
      entries: {
        first: { coupon_id: 1, content_type: 'resource', content_id: 1001 },
        other: { coupon_id: 99, content_type: 'resource', content_id: 9999 },
      }, ...(ambiguous ? { unrelated: [] } : {}), stats: { ...stats, total: 2 },
    } })
    return Response.json({ result: 'success', data: { coupons: [{ coupon_id: 1, label: '123-ABCDEF12345678',
      discount: .15, percent: true, active: true, all_content_types: [], expires_at: 0, max_uses: 0, max_per_user_uses: 0, uses: 0 }], stats } })
  }
  await runCouponChecks(env)
  assert.equal(sqlite.prepare("SELECT state FROM coupon_rewards WHERE reward_key='loyalty:old'").get().state, 'uncertain')
  ambiguous = false
  await Promise.all([runCouponChecks(env), runCouponChecks(env)])
  await runCouponChecks(env)
  const result = await (await call('/studio/coupons', 'GET', undefined, customer)).json()
  assert.equal(result.coupons[0].state, 'issued')
  assert.equal(result.coupons[0].code, '123-ABCDEF12345678')
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE title='Your coupon is ready'").get().n, 1)
})

test('release manager keeps drafts private and publishes updates without exposing credentials', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const body = { productId: 'shards', version: '1.0', channel: 'stable', body: '### Update\n**New features**', published: false }
  assert.equal((await call('/studio/staff/releases', 'POST', body, customer)).status, 403)
  assert.equal((await call('/studio/staff/releases', 'POST', body, '')).status, 401)
  const created = await call('/studio/staff/releases', 'POST', body)
  assert.equal(created.status, 201)
  const { release } = await created.json()
  assert.equal((await (await call('/studio/releases')).json()).total, 0)
  assert.equal((await call('/studio/staff/releases/' + release.id, 'PUT', { ...body, published: true })).status, 200)
  assert.equal((await (await call('/studio/releases')).json()).items[0].version, '1.0')
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE kind = 'update'").get().n, 1)
  await call('/studio/staff/releases/' + release.id, 'PUT', { ...body, published: true, body: 'Edited release notes' })
  assert.equal(sqlite.prepare('SELECT body FROM community_notifications').get().body, 'Edited release notes')
  assert.equal((await call('/studio/staff/releases', 'POST', body)).status, 409)
  assert.equal((await call('/studio/staff/releases/' + release.id, 'PUT', { ...body, published: true, productId: 'changed' })).status, 409)
  await call('/studio/staff/releases/' + release.id, 'PUT', body)
  assert.equal((await (await call('/studio/releases')).json()).total, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 0)
})

test('Worker routes product tools and preflights scheduled cancellation', async t => {
  const { env } = await fixture(t)
  const origin = 'https://lumenstudio.fyi'
  env.ALLOWED_ORIGIN = origin
  for (const prefix of ['', '/api']) {
    const response = await worker.fetch(new Request(`https://worker.example${prefix}/studio/releases`, { headers: { Origin: origin } }), env)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).items, [])
    for (const suffix of ['', '/' + crypto.randomUUID()]) {
      const denied = await worker.fetch(new Request(`https://worker.example${prefix}/studio/downloads${suffix}`, { headers: { Origin: origin } }), env)
      assert.equal(denied.status, 401)
      assert.equal(denied.headers.get('Cache-Control'), 'no-store')
    }
  }
  for (const [path, methods] of [
    ['/studio/staff/releases', ['GET', 'POST', 'PUT']],
    ['/studio/downloads/' + crypto.randomUUID(), ['GET', 'HEAD']],
    ['/community/staff/scheduled/' + crypto.randomUUID(), ['DELETE']],
  ]) {
    const response = await worker.fetch(new Request('https://worker.example' + path, { method: 'OPTIONS', headers: { Origin: origin } }), env)
    assert.equal(response.status, 204)
    for (const method of methods) assert.ok(response.headers.get('Access-Control-Allow-Methods').includes(method))
  }
})

test('bulk grants preserve existing access, notify recipients and never repeat a submitted batch', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const other = '223456789012345678'
  let grants = 0
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    assert.equal(options.headers.Authorization, 'Bearer server-secret')
    if (url.pathname.endsWith('/products')) return Response.json({ items: [{ productId: 'shards', active: true, plugins: ['shards'] }], total: 1 })
    if (url.pathname.endsWith('/customers/' + customer)) return Response.json({ customerDiscordId: customer, status: 'active', products: [{ productId: 'shards', status: 'active', expiresAt: null }] })
    if (url.pathname.includes('/customers/')) return Response.json({ detail: 'Not found' }, { status: 404 })
    assert.equal(url.pathname, '/v1/admin/licenses')
    grants++
    return Response.json({ licenseKey: 'must-not-be-returned', licenseId: crypto.randomUUID() })
  }
  const body = { requestId: crypto.randomUUID(), productId: 'shards', customerIds: [customer, other] }
  const response = await call('/studio/bulk-grants', 'POST', body)
  assert.equal(response.status, 200)
  const raw = await response.text()
  assert.equal(raw.includes('must-not-be-returned'), false)
  assert.deepEqual(JSON.parse(raw).results.map(row => row.state), ['skipped', 'granted'])
  assert.equal(grants, 1)
  const notes = sqlite.prepare('SELECT recipient_id FROM community_notifications').all()
  assert.deepEqual(notes.map(row => row.recipient_id), [other])
  await call('/studio/bulk-grants', 'POST', body)
  assert.equal(grants, 1)
  assert.equal((await call('/studio/bulk-grants', 'POST', { ...body, expiresAt: new Date(Date.now() + 86400000).toISOString() })).status, 409)
  assert.equal((await call('/studio/bulk-grants', 'POST', { ...body, requestId: crypto.randomUUID(), customerIds: [customer, customer] })).status, 400)
  assert.equal((await call('/studio/bulk-grants', 'POST', body, customer)).status, 403)
})

test('concurrent bulk submissions reserve the batch before granting and uncertain results are not retried', async t => {
  const { call, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let grants = 0
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname.endsWith('/products')) return Response.json({ items: [{ productId: 'shards', active: true, plugins: ['s'] }], total: 1 })
    if (url.pathname.includes('/customers/')) return Response.json({}, { status: 404 })
    grants++
    throw new Error('Connection closed after submission')
  }
  const body = { requestId: crypto.randomUUID(), productId: 'shards', customerIds: [customer] }
  const results = await Promise.allSettled([call('/studio/bulk-grants', 'POST', body), call('/studio/bulk-grants', 'POST', body)])
  assert.ok(results.some(result => result.status === 'fulfilled'))
  assert.equal(grants, 1)
  const retry = await call('/studio/bulk-grants', 'POST', body)
  assert.equal((await retry.json()).results[0].state, 'uncertain')
  assert.equal(grants, 1)
})

test('expiry reminders use canonical active entitlements, paginate, and deduplicate each expiry window', async t => {
  const { env, sqlite, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  t.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow })
  const started = Date.now()
  const expiry = new Date(started + 3 * 86400000).toISOString()
  const product = { productId: 'shards', productName: 'LumenShards', status: 'active', productActive: true, expiresAt: expiry }
  const pages = []
  globalThis.fetch = async input => {
    const url = new URL(input)
    pages.push(url.searchParams.get('page'))
    return Response.json({ items: [{
      customerDiscordId: customer, status: 'active',
      products: [product, { ...product, productId: 'paid', expiresAt: null }, { ...product, productId: 'revoked', status: 'revoked' }],
    }], total: 26 })
  }
  await runProductChecks(env)
  await runProductChecks(env)
  assert.deepEqual(pages, ['1', '2', '1', '2'])
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 1)
  const row = sqlite.prepare('SELECT * FROM community_notifications').get()
  assert.equal(row.recipient_id, customer)
  assert.equal(row.kind, 'license')
  assert.equal(row.product_id, 'shards')
  Date.now = () => started + 2.5 * 86400000
  await runProductChecks(env)
  await runProductChecks(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 2)
  Date.now = () => started + 4 * 86400000
  await runProductChecks(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 2)
})

async function seedDownload(sqlite, productId = '1', published = 1) {
  const bytes = Buffer.concat([Buffer.from('PK'), Buffer.alloc(65536 * 17 + 25, 42)])
  const id = crypto.randomUUID()
  const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
  const chunks = Math.ceil(bytes.length / 65536)
  sqlite.prepare(`INSERT INTO studio_downloads
    (id,product_id,product_key,name,version,filename,sha256,size,chunk_count,source_commit,created_at,published)
    VALUES (?,?,?,'LumenShards','1.2','LumenShards-1.2.jar',?,?,?,'test-commit',?,?)`)
    .run(id, productId, 'lumenshards', sha256, bytes.length, chunks, new Date().toISOString(), published)
  const insert = sqlite.prepare('INSERT INTO studio_download_chunks (download_id,chunk_index,data) VALUES (?,?,?)')
  for (let index = 0; index < chunks; index++) insert.run(id, index, bytes.subarray(index * 65536, (index + 1) * 65536).toString('base64'))
  return { id, bytes, sha256 }
}

test('loyalty counts distinct active registry entitlements and fails closed on incomplete registry', async t => {
  const { call, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const products = Array.from({ length: 8 }, (_, index) => ({ productId: `p${index}`, name: `Plugin ${index}`, active: true, plugins: ['p'] }))
  let ownedCount = 1, badRegistry = false
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname.endsWith('/products')) return Response.json({ items: products, total: products.length + (badRegistry ? 1 : 0) })
    return Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false,
      products: [...products.slice(0, ownedCount).map(product => ({ productId: product.productId, productActive: true, status: 'active', expiresAt: null })),
        { productId: 'p0', productActive: true, status: 'active', expiresAt: null },
        { productId: 'unknown', productActive: true, status: 'active', expiresAt: null }] })
  }
  for (const [count, tier] of [[1, 'spark'], [3, 'radiance'], [7, 'nova'], [8, 'elite']]) {
    ownedCount = count
    const response = await call('/studio/loyalty', 'GET', undefined, customer)
    assert.equal(response.status, 200)
    const status = await response.json()
    assert.equal(status.tier.id, tier)
    assert.equal(status.count, count)
  }
  badRegistry = true
  assert.equal((await call('/studio/loyalty', 'GET', undefined, customer)).status, 503)
  assert.equal((await call('/studio/loyalty', 'GET', undefined, '')).status, 401)
})

test('member profiles are public automatically with owner-only edits, safe fields, revisions and verified message badges', async t => {
  const { call, env, customer, owner, sqlite } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async input => new URL(input).pathname.endsWith('/products')
    ? Response.json({ items: [{ productId: 'p1', name: 'Plugin 1', active: true, plugins: ['p1'] }], total: 1 })
    : Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false,
      products: [{ productId: 'p1', productActive: true, status: 'active', expiresAt: null }] })
  assert.equal((await call('/studio/profiles/me', 'GET', undefined, '')).status, 401)
  const initial = await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()
  assert.equal(initial.profile.public, true)
  assert.equal(initial.profile.tier.id, 'elite')
  assert.equal((await call('/studio/profiles/' + customer, 'GET', undefined, '')).status, 200)
  assert.equal((await (await call('/studio/profiles', 'GET', undefined, '')).json()).total, 1)
  const body = { displayName: 'Alex', bio: '<script>alert(1)</script>', pronouns: 'they/them', status: 'Building a server',
    accent: '#123456', banner: '#654321', website: 'https://example.com', showcase: '', favoritePlugin: 'Shards', public: true, revision: 0 }
  for (const change of [{ accent: 'red;url(x)' }, { website: 'javascript:alert(1)' }, { userId: owner }, { tier: 'elite' }]) {
    assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, ...change }, customer)).status, 400)
  }
  assert.equal((await call('/studio/profiles/me', 'PUT', body, customer)).status, 200)
  assert.equal((await call('/studio/profiles/' + customer, 'PUT', body, owner)).status, 405)
  assert.equal((await call('/studio/profiles/me', 'PUT', body, customer)).status, 409)
  const published = await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()
  assert.equal(published.profile.displayName, 'Alex')
  assert.equal(published.profile.revision, undefined)
  assert.equal(published.profile.public, undefined)
  assert.equal((await (await call('/studio/profiles?q=Alex', 'GET', undefined, '')).json()).total, 1)
  const identities = await messageProfiles(env.COMMUNITY_DB, [customer, owner])
  assert.equal(identities.get(customer).tier.name, 'Lumen Elite')
  assert.equal(identities.get(customer).bio, undefined)
  sqlite.prepare('UPDATE member_profiles SET tier_checked_at=? WHERE user_id=?').run('2000-01-01', customer)
  assert.equal((await messageProfiles(env.COMMUNITY_DB, [customer])).get(customer).tier, null)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, public: false, revision: 1 }, customer)).status, 400)
  assert.equal((await messageProfiles(env.COMMUNITY_DB, [customer])).size, 1)
  assert.equal((await call('/studio/profiles/' + customer, 'GET', undefined, '')).status, 200)
  globalThis.fetch = async () => Response.json({ error: 'Unavailable' }, { status: 503 })
  const outage = await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()
  assert.match(outage.warning, /could not be refreshed/)
  assert.equal(outage.profile.tier, null)
  assert.equal(outage.profile.bio, body.bio)
})

test('badge selection unlocks lower tiers and staff ranks and filters downgrades immediately', async t => {
  const { call, sqlite, customer, owner, env } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let count = 7
  const products = Array.from({ length: 10 }, (_, i) => ({ productId: `p${i}`, name: `Plugin ${i}`, active: true, plugins: [`p${i}`] }))
  globalThis.fetch = async input => {
    const url = new URL(input)
    return url.pathname.endsWith('/products') ? Response.json({ items: products, total: 10 })
      : Response.json({ customerDiscordId: url.pathname.split('/').at(-1), status: 'active', verificationRequired: false,
        products: products.slice(0, count).map(product => ({ productId: product.productId, productActive: true, status: 'active', expiresAt: null })) })
  }
  const initial = (await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()).profile
  assert.deepEqual(initial.availableBadges.map(b => b.id), ['spark', 'radiance', 'nova'])
  assert.deepEqual(initial.badges.map(b => b.id), ['nova'])
  for (const [owned, unlocked] of [[1, ['spark']], [3, ['spark', 'radiance']], [10, ['spark', 'radiance', 'nova', 'elite']]]) {
    count = owned
    const profile = (await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()).profile
    assert.deepEqual(profile.availableBadges.map(b => b.id), unlocked)
  }
  count = 7
  await call('/studio/profiles/me', 'GET', undefined, customer)
  const body = { displayName: 'Builder', bio: '', pronouns: '', status: '', accent: '#123456', banner: '#654321',
    website: '', showcase: '', favoritePlugin: '', public: true, revision: 0, badgeIds: ['spark', 'radiance', 'nova'] }
  const eliteId = '223456789012345678'
  count = 10
  const eliteProfile = (await (await call('/studio/profiles/me', 'GET', undefined, eliteId)).json()).profile
  const eliteIds = eliteProfile.availableBadges.map(b => b.id)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, badgeIds: eliteIds }, eliteId)).status, 200)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [eliteId], env)).get(eliteId).badges.map(b => b.id),
    ['spark', 'radiance', 'nova', 'elite'])
  count = 7
  for (const id of ['elite', 'staff', 'developer', 'studio_lead', 'owner', 'fake']) {
    assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, badgeIds: [id] }, customer)).status, 403)
  }
  for (const badgeIds of [['spark', 'spark'], ['spark', 7], 'owner', Array(9).fill('spark')]) {
    assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, badgeIds }, customer)).status, 400)
  }
  assert.equal((await call('/studio/profiles/me', 'PUT', body, customer)).status, 200)
  assert.equal((await call('/studio/profiles/me', 'PUT', body, customer)).status, 409)
  let publicProfile = (await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile
  assert.deepEqual(publicProfile.badges.map(b => b.id), body.badgeIds)
  assert.equal(publicProfile.availableBadges, undefined)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [customer], env)).get(customer).badges.map(b => b.id), body.badgeIds)
  count = 1
  await call('/studio/profiles/me', 'GET', undefined, customer)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [customer], env)).get(customer).badges.map(b => b.id), ['spark'])
  sqlite.prepare('UPDATE member_profiles SET tier_checked_at=? WHERE user_id=?').run('2000-01-01', customer)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [customer], env)).get(customer).badges, [])
  count = 0
  sqlite.prepare("INSERT INTO website_members(discord_id,role_id) VALUES (?,'support_team')").run(customer)
  const staff = (await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()).profile
  assert.deepEqual(staff.availableBadges.map(b => b.id), ['jr_staff', 'staff'])
  sqlite.prepare("UPDATE website_members SET role_id='sr_support' WHERE discord_id=?").run(customer)
  const senior = (await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()).profile
  assert.deepEqual(senior.availableBadges.map(b => b.id), ['jr_staff', 'staff', 'sr_staff'])
  assert.equal(senior.badgeRole.name, 'Sr Support')
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, revision: 1, badgeIds: ['jr_staff', 'sr_staff'] }, customer)).status, 200)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [customer], env)).get(customer).badges.map(b => b.id), ['jr_staff', 'sr_staff'])
  sqlite.prepare("UPDATE website_members SET role_id='jr_support' WHERE discord_id=?").run(customer)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, revision: 2, badgeIds: ['sr_staff'] }, customer)).status, 403)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [customer], env)).get(customer).badges.map(b => b.id), ['jr_staff'])
  sqlite.prepare("UPDATE website_members SET role_id='developer' WHERE discord_id=?").run(customer)
  const developer = (await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()).profile
  assert.deepEqual(developer.availableBadges.map(b => b.id), ['jr_staff', 'staff', 'sr_staff', 'developer'])
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, revision: 2, badgeIds: ['staff', 'developer'] }, customer)).status, 200)
  sqlite.prepare("UPDATE website_members SET role_id='client' WHERE discord_id=?").run(customer)
  publicProfile = (await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile
  assert.deepEqual(publicProfile.badges, [])
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [customer], env)).get(customer).badges, [])
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, revision: 3, badgeIds: ['developer'] }, customer)).status, 403)
  sqlite.prepare("UPDATE website_members SET role_id='studio_lead' WHERE discord_id=?").run(customer)
  const lead = (await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()).profile
  assert.deepEqual(lead.availableBadges.map(b => b.id), ['jr_staff', 'staff', 'sr_staff', 'developer', 'studio_lead'])
  const ownerProfile = (await (await call('/studio/profiles/me', 'GET', undefined, owner)).json()).profile
  const all = ownerProfile.availableBadges.map(b => b.id)
  assert.equal(all.length, 10)
  assert.equal(ownerProfile.tier, null)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, badgeIds: all }, owner)).status, 200)
  assert.equal((await messageProfiles(env.COMMUNITY_DB, [owner], env)).get(owner).badges.length, 10)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, revision: 1, badgeIds: [] }, owner)).status, 200)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB, [owner], env)).get(owner).badges, [])
})

test('badge display settings persist across profile reads and older edits', async t => {
  const { call, env, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => Response.json({ error: 'Unavailable' }, { status: 503 })
  const initial = (await (await call('/studio/profiles/me', 'GET', undefined, customer)).json()).profile
  assert.equal(initial.appearance.badgeSize, 'medium')
  assert.equal(initial.appearance.badgeIconOnly, false)
  const body = { displayName: 'Builder', bio: '', pronouns: '', status: '', accent: '#123456', banner: '#654321',
    website: '', showcase: '', favoritePlugin: '', public: true, revision: 0,
    appearance: { background: 'none', frame: 'none', decoration: 'none', badgeSize: 'large', badgeIconOnly: true } }
  for (const change of [{ badgeSize: 'huge' }, { badgeSize: null }, { badgeIconOnly: 'true' }]) {
    assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, appearance: { ...body.appearance, ...change } }, customer)).status, 400)
  }
  assert.equal((await call('/studio/profiles/me', 'PUT', body, customer)).status, 200)
  const publicProfile = (await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile
  assert.equal(publicProfile.appearance.badgeSize, 'large')
  assert.equal(publicProfile.appearance.badgeIconOnly, true)
  assert.equal((await messageProfiles(env.COMMUNITY_DB, [customer], env)).get(customer).badgeIconOnly, true)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, revision: 1,
    appearance: { background: 'none', frame: 'none', decoration: 'none' } }, customer)).status, 200)
  const preserved = (await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile
  assert.equal(preserved.appearance.badgeSize, 'large')
  assert.equal(preserved.appearance.badgeIconOnly, true)
})

test('profile cosmetics enforce Spark and Radiance unlocks, persist presets and suppress them after expiry', async t => {
  const { call, customer, sqlite, env } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let count = 0
  const products = Array.from({ length: 10 }, (_, i) => ({ productId: `p${i}`, name: `Plugin ${i}`, active: true, plugins: [`p${i}`] }))
  globalThis.fetch = async input => new URL(input).pathname.endsWith('/products') ? Response.json({ items: products, total: 10 })
    : Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false,
      products: products.slice(0,count).map(p => ({ productId: p.productId, productActive: true, status: 'active', expiresAt: null })) })
  await call('/studio/profiles/me','GET',undefined,customer)
  let revision = 0
  const base = { displayName: 'Builder', bio: '', pronouns: '', status: '', accent: '#123456', banner: '#654321',
    website: '', showcase: '', favoritePlugin: '', public: true }
  const appearance = { background: 'none', frame: 'none', decoration: 'none' }
  const save = (patch = {}) => call('/studio/profiles/me','PUT',{ ...base, revision, appearance: { ...appearance, ...patch } },customer)
  assert.equal((await save({ background: 'aurora' })).status,403)
  assert.equal((await save({ frame: 'amethyst' })).status,403)
  assert.equal((await save({ decoration: 'stars' })).status,403)
  assert.equal((await save({ background: 'made-up' })).status,400)
  count = 1
  const spark = (await (await call('/studio/profiles/me','GET',undefined,customer)).json()).profile
  assert.deepEqual(spark.cosmeticAccess,{ backgrounds:true,frames:true,decorations:false })
  const animated = backgrounds.filter(p => p.animated)
  const staticPresets = backgrounds.filter(p => !p.animated && p.id !== 'none')
  assert.ok(animated.length >= 10)
  assert.equal(staticPresets.length,5)
  for (const preset of [...animated,...staticPresets]) {
    assert.equal((await save({ background:preset.id })).status,200)
    revision++
    assert.equal((await (await call('/studio/profiles/'+customer,'GET',undefined,'')).json()).profile.appearance.background,preset.id)
  }
  for (const frame of frames) {
    assert.equal((await save({ frame:frame.id })).status,200); revision++
  }
  assert.equal((await save({ decoration:'stars' })).status,403)
  count=3
  await call('/studio/profiles/me','GET',undefined,customer)
  for (const decoration of decorations) {
    assert.equal((await save({ decoration:decoration.id })).status,200); revision++
  }
  Object.assign(appearance,{background:'stars',frame:'diamond',decoration:'orbits'})
  assert.equal((await save()).status,200); revision++
  sqlite.prepare('UPDATE member_profiles SET tier_checked_at=? WHERE user_id=?').run('2000-01-01',customer)
  let publicProfile=(await (await call('/studio/profiles/'+customer,'GET',undefined,'')).json()).profile
  assert.deepEqual(publicProfile.appearance,{background:'none',frame:'none',decoration:'none',badgeSize:'medium',badgeIconOnly:false})
  assert.equal((await save()).status,200); revision++
  count=3
  await call('/studio/profiles/me','GET',undefined,customer)
  publicProfile=(await (await call('/studio/profiles/'+customer,'GET',undefined,'')).json()).profile
  assert.deepEqual(publicProfile.appearance,{...appearance,badgeSize:'medium',badgeIconOnly:false})
  assert.equal((await messageProfiles(env.COMMUNITY_DB,[customer],env)).get(customer).appearance,undefined)
})

test('custom profile colors require Spark, persist across old clients and disappear on expiry without being lost', async t => {
  const { call, customer, owner, sqlite } = await fixture(t)
  const previousFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = previousFetch })
  let owned = false
  globalThis.fetch = async input => new URL(input).pathname.endsWith('/products')
    ? Response.json({ items: [{ productId: 'p1', name: 'Plugin', active: true, plugins: ['p1'] },
      { productId: 'p2', name: 'Plugin 2', active: true, plugins: ['p2'] }], total: 2 })
    : Response.json({ customerDiscordId: customer, status: 'active', verificationRequired: false,
      products: owned ? [{ productId: 'p1', productActive: true, status: 'active', expiresAt: null }] : [] })
  const base = { displayName: 'Builder', bio: '', pronouns: '', status: '', accent: '#123456', banner: '#654321',
    website: '', showcase: '', favoritePlugin: '', public: true, revision: 0 }
  const colors = { surface: '#221133', text: '#ffffff', links: '#ffcc99' }
  const appearance = { background: 'none', frame: 'none', decoration: 'none', colors }
  await call('/studio/profiles/me', 'GET', undefined, customer)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, appearance }, customer)).status, 403)
  owned = true
  await call('/studio/profiles/me', 'GET', undefined, customer)
  for (const invalid of [{ ...colors, text: 'red' }, { ...colors, extra: '#ffffff' }, { ...colors, links: '#fff' }]) {
    assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, appearance: { ...appearance, colors: invalid } }, customer)).status, 400)
  }
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, appearance }, customer)).status, 200)
  assert.deepEqual((await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile.appearance.colors, colors)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, revision: 1,
    appearance: { background: 'none', frame: 'none', decoration: 'none' } }, customer)).status, 200)
  sqlite.prepare('UPDATE member_profiles SET tier_checked_at=? WHERE user_id=?').run('2000-01-01', customer)
  let profile = (await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile
  assert.equal(profile.appearance.colors, null)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, revision: 2,
    appearance: { ...appearance, colors: { ...colors, text: '#112233' } } }, customer)).status, 403)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, revision: 2, appearance }, customer)).status, 200)
  await call('/studio/profiles/me', 'GET', undefined, customer)
  profile = (await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile
  assert.deepEqual(profile.appearance.colors, colors)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, revision: 3,
    appearance: { ...appearance, colors: null } }, customer)).status, 200)
  assert.equal((await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()).profile.appearance.colors, undefined)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...base, appearance }, owner)).status, 200)
})

test('banner uploads validate raster size and dimensions, remain owner-only, and save atomically with profile revisions', async t => {
  const { call, customer, owner, sqlite }=await fixture(t)
  const banner='UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoCAAIAAUAmJaQAA3AA/v02aAA='
  const base={displayName:'Builder',bio:'',pronouns:'',status:'',accent:'#123456',banner:'#654321',
    website:'',showcase:'',favoritePlugin:'',public:true,revision:0,bannerImage:banner}
  assert.equal((await call('/studio/profiles/me','PUT',base,'')).status,401)
  assert.equal((await call('/studio/profiles/'+customer,'PUT',base,owner)).status,405)
  const oversized=Buffer.from(banner,'base64')
  oversized.writeUInt16LE(1201,26)
  for (const image of [Buffer.from('<svg onload="alert(1)"/>').toString('base64'),'bad',oversized.toString('base64'),'A'.repeat(350004)]) {
    assert.equal((await call('/studio/profiles/me','PUT',{...base,bannerImage:image},customer)).status,400)
  }
  const uploaded=await call('/studio/profiles/me','PUT',base,customer)
  assert.equal(uploaded.status,200)
  const profile=(await uploaded.json()).profile
  assert.equal(profile.bannerVersion,1)
  assert.ok(!JSON.stringify(profile).includes(banner))
  let media=await call('/studio/profiles/media/'+customer,'GET',undefined,'')
  assert.equal(media.status,200)
  assert.equal(media.headers.get('Content-Type'),'image/webp')
  assert.equal(media.headers.get('X-Content-Type-Options'),'nosniff')
  assert.equal(Buffer.from(await media.arrayBuffer()).toString('base64'),banner)
  assert.equal((await call('/studio/profiles/me','PUT',{...base,bannerImage:null},customer)).status,409)
  assert.equal(sqlite.prepare('SELECT data FROM member_profile_banners WHERE user_id=?').get(customer).data,banner)
  assert.equal((await call('/studio/profiles/me','PUT',{...base,revision:1,bannerImage:null},customer)).status,200)
  assert.equal((await call('/studio/profiles/media/'+customer,'GET',undefined,'')).status,404)
  assert.equal(sqlite.prepare('SELECT data FROM member_profile_banners WHERE user_id=?').get(customer).data,null)
  sqlite.exec("CREATE TRIGGER reject_banner_update BEFORE UPDATE ON member_profile_banners BEGIN SELECT RAISE(ABORT,'Injected banner failure'); END")
  assert.equal((await call('/studio/profiles/me','PUT',{...base,revision:2,displayName:'Must not persist'},customer)).status,503)
  assert.equal(sqlite.prepare('SELECT revision,display_name FROM member_profiles WHERE user_id=?').get(customer).revision,2)
  assert.equal(sqlite.prepare('SELECT display_name FROM member_profiles WHERE user_id=?').get(customer).display_name,'Builder')
})

test('server showcases validate links and limits and achievements derive only from actual public activity', async t => {
  const { call, customer, sqlite, env }=await fixture(t)
  const base={displayName:'Builder',bio:'I build Minecraft servers with my friends.',pronouns:'',status:'',accent:'#123456',banner:'#654321',
    website:'',showcase:'',favoritePlugin:'',public:true,revision:0}
  const server={name:'Purple Survival',description:'A friendly server',javaAddress:'play.example.net:25565',bedrockAddress:'bedrock.example.net:19132',
    version:'1.21',gamemodes:'Survival',plugins:'Lumen Crates',website:'https://example.net',discord:'https://discord.gg/example',
    trailer:'https://example.net/trailer',logo:'https://example.net/logo.png',featured:true,screenshots:[{url:'https://example.net/server.png',alt:'Spawn area'}]}
  const badServers=[[...Array(4).fill({...server,featured:false})],[{...server,website:'javascript:alert(1)'}],
    [{...server,javaAddress:'evil\nHost: fake'}],[{...server,javaAddress:'play.example.net:99999'}],[{...server,bedrockAddress:'https://example.net'}],[{...server,screenshots:Array(5).fill(server.screenshots[0])}],
    [server,server],[{...server,screenshots:[{url:'data:image/svg+xml,x',alt:''}]}]]
  for(const servers of badServers) assert.equal((await call('/studio/profiles/me','PUT',{...base,servers},customer)).status,400)
  assert.equal((await call('/studio/profiles/me','PUT',{...base,badgeIds:['server_builder']},customer)).status,403)
  const saved=(await (await call('/studio/profiles/me','PUT',{...base,servers:[server]},customer)).json()).profile
  assert.deepEqual(saved.servers,[server])
  assert.deepEqual(saved.achievements.filter(a=>a.earned).map(a=>a.id),['introduced','server_builder'])
  const now=new Date().toISOString(),threadId=crypto.randomUUID()
  sqlite.prepare(`INSERT INTO community_threads(id,channel,author_id,author_name,title,body,created_at,updated_at,last_activity_at)
    VALUES (?,'general',?,'Builder','New thread','Hello',?,?,?)`).run(threadId,customer,now,now,now)
  sqlite.prepare(`INSERT INTO community_thread_posts(id,thread_id,author_id,author_name,body,created_at)
    VALUES (?,?,?,'Builder','Reply',?)`).run(crypto.randomUUID(),threadId,customer,now)
  const badgeIds=['introduced','server_builder','conversation','contributor']
  assert.equal((await call('/studio/profiles/me','PUT',{...base,revision:1,badgeIds},customer)).status,200)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB,[customer],env)).get(customer).badges.map(b=>b.id),badgeIds)
  sqlite.prepare('UPDATE community_threads SET hidden=1 WHERE id=?').run(threadId)
  assert.deepEqual((await messageProfiles(env.COMMUNITY_DB,[customer],env)).get(customer).badges.map(b=>b.id),['introduced','server_builder'])
  assert.equal((await call('/studio/profiles/me','PUT',{...base,revision:2,servers:[],bio:''},customer)).status,200)
  const publicProfile=(await (await call('/studio/profiles/'+customer,'GET',undefined,'')).json()).profile
  assert.deepEqual(publicProfile.badges,[])
  assert.equal(publicProfile.achievements,undefined)
  assert.equal(publicProfile.has_thread,undefined)
  sqlite.prepare('UPDATE member_profiles SET created_at=? WHERE user_id=?').run('2000-01-01',customer)
  assert.equal((await call('/studio/profiles/me','PUT',{...base,revision:3,badgeIds:['regular']},customer)).status,200)
})

test('public-profile migration publishes existing profiles without losing owner edits and rejects stale drafts', async t => {
  const { call, sqlite, customer } = await fixture(t)
  sqlite.prepare(`INSERT INTO member_profiles(user_id,username,display_name,bio,public,revision,created_at,updated_at)
    VALUES (?,?,?,'Existing biography',0,4,'2026-01-01','2026-01-01')`).run(customer, 'Customer', 'Original name')
  sqlite.exec(await readFile(new URL('../worker/migrations/community/0016_public_member_profiles.sql', import.meta.url), 'utf8'))
  const published = await (await call('/studio/profiles/' + customer, 'GET', undefined, '')).json()
  assert.equal(published.profile.bio, 'Existing biography')
  assert.equal(published.profile.displayName, 'Original name')
  const body = { displayName: 'Changed', bio: '', pronouns: '', status: '', accent: '#123456', banner: '#654321',
    website: '', showcase: '', favoritePlugin: '', public: true, revision: 4 }
  assert.equal((await call('/studio/profiles/me', 'PUT', body, customer)).status, 409)
  assert.equal((await call('/studio/profiles/me', 'PUT', { ...body, revision: 5 }, customer)).status, 200)
})

test('sub-clients receive only explicitly shared downloads while owner eligibility and tier limits remain valid', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const member = '223456789012345678', other = '323456789012345678'
  sqlite.prepare('INSERT INTO website_members(discord_id) VALUES (?)').run(member)
  sqlite.prepare('INSERT INTO website_members(discord_id) VALUES (?)').run(other)
  const artifact = await seedDownload(sqlite, 'p0')
  const another = await seedDownload(sqlite, 'p1')
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let count = 3, ownerStatus = 'active'
  const products = Array.from({ length: 8 }, (_, index) => ({ productId: `p${index}`, name: `Plugin ${index}`, active: true, plugins: ['p'] }))
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname.endsWith('/products')) return Response.json({ items: products, total: products.length })
    if (url.pathname.endsWith('/customers/' + customer)) return Response.json({ customerDiscordId: customer, status: ownerStatus, verificationRequired: false,
      products: products.slice(0, count).map(product => ({ productId: product.productId, productActive: true, status: 'active', expiresAt: null })) })
    return Response.json({}, { status: 404 })
  }
  const share = (action, productId, memberId, actor = customer) => call('/studio/loyalty/subclients', 'POST', { action, productId, memberId }, actor)
  assert.equal((await share('add', 'p0', member)).status, 201)
  assert.equal((await share('add', 'p0', other)).status, 201)
  assert.equal((await share('add', 'p0', '423456789012345678')).status, 404)
  assert.equal((await share('add', 'p7', member)).status, 403)
  assert.equal((await share('add', 'p0', member)).status, 409)
  assert.equal((await share('remove', 'p0', member, other)).status, 404)
  assert.equal((await call('/studio/downloads/' + artifact.id, 'HEAD', undefined, member)).status, 200)
  assert.equal((await call('/studio/downloads/' + another.id, 'HEAD', undefined, member)).status, 404)
  count = 1
  assert.equal((await call('/studio/downloads/' + artifact.id, 'HEAD', undefined, member)).status, 200)
  assert.equal((await call('/studio/downloads/' + artifact.id, 'HEAD', undefined, other)).status, 403)
  ownerStatus = 'banned'
  assert.equal((await call('/studio/downloads/' + artifact.id, 'HEAD', undefined, member)).status, 403)
  assert.equal((await share('remove', 'p0', member)).status, 200)
  assert.equal((await call('/studio/downloads/' + artifact.id, 'HEAD', undefined, member)).status, 403)
})

test('plugin downloads require current canonical entitlements and stream the exact private artifact', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const artifact = await seedDownload(sqlite)
  await seedDownload(sqlite, 'other-product')
  await seedDownload(sqlite, '1', 0)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let state = 'active'
  globalThis.fetch = async input => {
    assert.equal(new URL(input).pathname, '/v1/admin/customers/' + customer)
    return Response.json({
      customerDiscordId: customer, status: state, verificationRequired: false,
      products: [{ productId: '1', productActive: true, status: 'active', expiresAt: null }],
    })
  }
  assert.equal((await call('/studio/downloads', 'GET', undefined, '')).status, 401)
  const list = await call('/studio/downloads', 'GET', undefined, customer)
  assert.equal(list.status, 200)
  assert.deepEqual((await list.json()).items.map(item => item.id), [artifact.id])
  const response = await call('/studio/downloads/' + artifact.id, 'GET', undefined, customer)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'application/java-archive')
  assert.equal(response.headers.get('Content-Length'), String(artifact.bytes.length))
  assert.equal(response.headers.get('X-Checksum-Sha256'), artifact.sha256)
  assert.match(response.headers.get('Content-Disposition'), /attachment; filename="LumenShards-1.2.jar"/)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), artifact.bytes)
  state = 'banned'
  assert.equal((await call('/studio/downloads/' + artifact.id, 'GET', undefined, customer)).status, 403)
})

test('plugin downloads fail closed on expired, revoked, mismatched and unavailable licensing responses', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const { id } = await seedDownload(sqlite)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const profile = {
    customerDiscordId: customer, status: 'active', verificationRequired: false,
    products: [{ productId: '1', productActive: true, status: 'active', expiresAt: null }],
  }
  for (const [data, status, expected] of [
    [{ ...profile, products: [{ ...profile.products[0], expiresAt: new Date(Date.now() - 1000).toISOString() }] }, 200, 404],
    [{ ...profile, products: [{ ...profile.products[0], status: 'revoked' }] }, 200, 404],
    [{ ...profile, products: [{ ...profile.products[0], productActive: false }] }, 200, 404],
    [{ ...profile, products: [{ ...profile.products[0], expiresAt: 'invalid' }] }, 200, 503],
    [{ ...profile, customerDiscordId: '223456789012345678' }, 200, 503],
    [{ ...profile, verificationRequired: undefined }, 200, 503],
    [{ ...profile, verificationRequired: true }, 200, 403],
    [{}, 503, 503],
    [{}, 404, 403],
  ]) {
    globalThis.fetch = async () => Response.json(data, { status })
    const response = await call('/studio/downloads/' + id, 'GET', undefined, customer)
    assert.equal(response.status, expected)
    assert.equal(response.headers.has('Content-Disposition'), false)
  }
})

test('download staff access is permission checked and broken artifacts are never silently truncated', async t => {
  const { call, sqlite, env, customer } = await fixture(t)
  const { id } = await seedDownload(sqlite)
  const catalog = await (await call('/studio/downloads')).json()
  assert.equal(catalog.items[0].id, id)
  assert.deepEqual(catalog.builds, [])
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => Response.json({
    customerDiscordId: customer, status: 'active', verificationRequired: false, products: [],
  })
  const customerCatalog = await (await call('/studio/downloads', 'GET', undefined, customer)).json()
  assert.equal(customerCatalog.total, 0)
  assert.equal('builds' in customerCatalog, false)
  assert.equal((await call('/studio/downloads/' + id, 'GET', undefined, customer)).status, 404)
  const head = await call('/studio/downloads/' + id, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  env.ASSISTANT_LIMITER = { limit: async () => ({ success: false }) }
  assert.equal((await call('/studio/downloads/' + id)).status, 429)
  env.ASSISTANT_LIMITER = { limit: async () => ({ success: true }) }
  sqlite.prepare('DELETE FROM studio_download_chunks WHERE download_id = ? AND chunk_index = 16').run(id)
  const response = await call('/studio/downloads/' + id)
  await assert.rejects(response.arrayBuffer(), /could not be completed/)
  sqlite.prepare("UPDATE studio_downloads SET filename = '../not-a-safe-file.jar' WHERE id = ?").run(id)
  assert.equal((await call('/studio/downloads/' + id)).status, 503)
})

function pluginJar(size = 100) {
  const files = [['plugin.yml', Buffer.from('name: Test\nmain: Test\nversion: 1\n')], ['Test.class', Buffer.alloc(size, 42)]]
  const locals = []
  const directory = []
  let offset = 0
  for (const [name, bytes] of files) {
    const filename = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50)
    local.writeUInt16LE(20, 4)
    local.writeUInt32LE(bytes.length, 18)
    local.writeUInt32LE(bytes.length, 22)
    local.writeUInt16LE(filename.length, 26)
    locals.push(local, filename, bytes)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(bytes.length, 20)
    central.writeUInt32LE(bytes.length, 24)
    central.writeUInt16LE(filename.length, 28)
    central.writeUInt32LE(offset, 42)
    directory.push(central, filename)
    offset += local.length + filename.length + bytes.length
  }
  const central = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50)
  end.writeUInt16LE(files.length, 8)
  end.writeUInt16LE(files.length, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, central, end])
}

async function manualFixture(t) {
  const base = await fixture(t)
  const requests = []
  const deps = {
    respond: (body, status) => Response.json(body, { status }),
    verifyLoginToken: async token => /^\d+$/.test(token) ? { id: token } : null,
    licensingRequest: async (_env, path) => {
      requests.push(path)
      throw new Error('Licensing is unavailable')
    },
  }
  const call = (path, method = 'POST', body, token = base.owner) => handlePluginDownloads(new Request('https://worker.example' + path, {
    method, headers: { Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), base.env, 'https://lumenstudio.fyi', path, deps)
  const bytes = pluginJar(65536 * 21 + 7)
  const body = {
    productId: '1', version: '1.2.3', filename: 'LumenShards-1.2.3.jar',
    size: bytes.length, sha256: Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex'),
  }
  const chunks = []
  for (let start = 0; start < bytes.length; start += 65536) chunks.push(bytes.subarray(start, start + 65536).toString('base64'))
  const begin = async (metadata = body) => {
    const response = await call('/studio/downloads/uploads', 'POST', metadata)
    assert.equal(response.status, 201, await response.clone().text())
    const result = await response.json()
    return { ...result, path: '/studio/downloads/uploads/' + result.uploadId }
  }
  return { ...base, call, deps, requests, bytes, body, chunks, begin }
}

test('manual uploads publish without licensing, use canonical names and still require customer entitlements', async t => {
  const { call, begin, sqlite, bytes, chunks, env, deps, customer, requests } = await manualFixture(t)
  const existing = await seedDownload(sqlite)
  const { path, uploadId, batchSize } = await begin()
  assert.equal(batchSize, 20)
  assert.equal((await (await call('/studio/downloads', 'GET')).json()).total, 1)
  assert.equal((await call('/studio/downloads/' + uploadId, 'GET')).status, 404)
  for (let start = 0; start < chunks.length; start += batchSize) {
    const body = { start, chunks: chunks.slice(start, start + batchSize) }
    assert.equal((await call(path + '/chunks', 'PUT', body)).status, 200)
    assert.equal((await call(path + '/chunks', 'PUT', body)).status, 200)
  }
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(uploadId).published, 0)
  const published = await call(path + '/publish')
  assert.equal(published.status, 201, await published.clone().text())
  const artifact = (await published.json()).download
  assert.equal(artifact.productId, '1')
  assert.equal(artifact.name, 'LumenShards')
  assert.equal((await call(path + '/publish')).status, 200)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM website_access_audit WHERE action = 'download.publish'").get().n, 1)
  assert.equal((await call(path + '/chunks', 'PUT', { start: 0, chunks: [chunks[0]] })).status, 409)
  assert.equal((await call(path + '/cancel')).status, 409)
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(existing.id).published, 1)
  assert.deepEqual(requests, [])
  assert.equal((await call('/studio/downloads/' + uploadId, 'GET', undefined, customer)).status, 503)
  deps.licensingRequest = async () => ({ ok: true, status: 200, data: {
    customerDiscordId: customer, status: 'active', verificationRequired: false,
    products: [{ productId: '1', productActive: true, status: 'active', expiresAt: null }],
  } })
  const downloaded = await call('/studio/downloads/' + uploadId, 'GET', undefined, customer)
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes)
  deps.licensingRequest = async () => ({ ok: true, status: 200, data: {
    customerDiscordId: customer, status: 'active', verificationRequired: false, products: [],
  } })
  assert.equal((await call('/studio/downloads/' + uploadId, 'GET', undefined, customer)).status, 404)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM studio_bulk_grants').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 0)
  env.ADMIN_WRITE_LIMITER = undefined
  assert.equal((await call('/studio/downloads/uploads', 'POST', {})).status, 503)
})

test('every upload step checks both staff permissions, ownership, expiration and write limits', async t => {
  const { call, begin, sqlite, customer, owner, chunks, body, env } = await manualFixture(t)
  const upload = await begin()
  const other = '1012053634911064114'
  for (const [suffix, method, payload] of [
    ['/chunks', 'PUT', { start: 0, chunks: [chunks[0]] }], ['/publish', 'POST'], ['/cancel', 'POST'],
  ]) {
    assert.equal((await call(upload.path + suffix, method, payload, '')).status, 401)
    assert.equal((await call(upload.path + suffix, method, payload, customer)).status, 403)
    assert.equal((await call(upload.path + suffix, method, payload, other)).status, 404)
  }
  assert.equal((await call('/studio/downloads/uploads', 'POST', body, customer)).status, 403)
  for (const permissions of [['dashboard.view'], ['products.manage']]) {
    sqlite.prepare(`INSERT INTO website_role_permissions (role_id, permissions) VALUES ('studio_lead', ?)
      ON CONFLICT(role_id) DO UPDATE SET permissions = excluded.permissions`).run(JSON.stringify(permissions))
    assert.equal((await call('/studio/downloads/uploads', 'POST', body, other)).status, 403)
  }
  sqlite.prepare("DELETE FROM website_role_permissions WHERE role_id = 'studio_lead'").run()
  env.ADMIN_WRITE_LIMITER = { limit: async ({ key }) => {
    assert.equal(key, 'plugin-upload:' + owner)
    return { success: false }
  } }
  assert.equal((await call(upload.path + '/chunks', 'PUT', { start: 0, chunks: [chunks[0]] })).status, 429)
  env.ADMIN_WRITE_LIMITER = { limit: async () => ({ success: true }) }
  sqlite.prepare('UPDATE studio_manual_uploads SET expires_at = ? WHERE download_id = ?').run('2000-01-01', upload.uploadId)
  assert.equal((await call(upload.path + '/publish')).status, 404)
  await begin()
  assert.equal(sqlite.prepare('SELECT id FROM studio_downloads WHERE id = ?').get(upload.uploadId), undefined)
})

test('unlisted IDs, noncanonical names, invalid metadata and conflicting chunks cannot publish or overwrite data', async t => {
  const { call, begin, sqlite, body, chunks, requests } = await manualFixture(t)
  for (const patch of [
    { productId: 'LumenShards' }, { productId: 'lumenshards' }, { productId: 'lumenorders' },
    { productId: 'unlisted' }, { productId: '../1' }, { name: '' }, { name: 'Bad\nname' }, { name: 'Spoofed display name' },
    { version: '../1' }, { filename: '../evil.jar' }, { filename: 'plugin.zip' },
    { size: 0 }, { size: 32 * 1048576 + 1 }, { size: 1.5 }, { sha256: 'bad' },
  ]) assert.equal((await call('/studio/downloads/uploads', 'POST', { ...body, ...patch })).status, 400)
  const order = await begin({ ...body, productId: 'lumenorder' })
  assert.equal(sqlite.prepare('SELECT name FROM studio_downloads WHERE id = ?').get(order.uploadId).name, 'LumenOrder')
  assert.equal((await call(order.path + '/cancel')).status, 200)
  assert.deepEqual(requests, [])
  const { path, uploadId } = await begin()
  for (const payload of [
    { start: -1, chunks: [chunks[0]] }, { start: 0, chunks: Array(21).fill(chunks[0]) },
    { start: 0, chunks: ['!bad'] }, { start: 0, chunks: ['UEs='] },
    { start: chunks.length, chunks: [chunks[0]] },
  ]) assert.ok([400, 413].includes((await call(path + '/chunks', 'PUT', payload)).status))
  assert.equal((await call(path + '/chunks', 'PUT', { start: 0, chunks: [chunks[0]] })).status, 200)
  const different = Buffer.alloc(65536, 1).toString('base64')
  assert.equal((await call(path + '/chunks', 'PUT', { start: 0, chunks: [different] })).status, 409)
  assert.equal(sqlite.prepare('SELECT data FROM studio_download_chunks WHERE download_id = ?').get(uploadId).data, chunks[0])
  assert.equal((await call(path + '/publish')).status, 409)
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(uploadId).published, 0)
  assert.equal((await call(path + '/cancel')).status, 200)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM studio_download_chunks WHERE download_id = ?').get(uploadId).n, 0)
})

test('server verification detects tampering and invalid JARs; simultaneous publishers cannot partially publish', async t => {
  const { call, begin, sqlite, body, bytes, chunks } = await manualFixture(t)
  for (const invalidJar of [false, true]) {
    const bad = invalidJar ? Buffer.alloc(bytes.length, 42) : bytes
    const hash = invalidJar ? Buffer.from(await crypto.subtle.digest('SHA-256', bad)).toString('hex') : '0'.repeat(64)
    const { path, uploadId, batchSize } = await begin({ ...body, sha256: hash })
    const data = []
    for (let start = 0; start < bad.length; start += 65536) data.push(bad.subarray(start, start + 65536).toString('base64'))
    for (let start = 0; start < data.length; start += batchSize) assert.equal((await call(path + '/chunks', 'PUT', {
      start, chunks: data.slice(start, start + batchSize),
    })).status, 200)
    const failure = await call(path + '/publish')
    assert.equal(failure.status, 409)
    assert.match((await failure.json()).error, invalidJar ? /valid plugin JAR/ : /SHA-256/)
    assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(uploadId).published, 0)
    assert.equal((await call(path + '/cancel')).status, 200)
  }
  const { path, uploadId, batchSize } = await begin()
  for (let start = 0; start < chunks.length; start += batchSize) await call(path + '/chunks', 'PUT', { start, chunks: chunks.slice(start, start + batchSize) })
  const outcomes = await Promise.all([call(path + '/publish'), call(path + '/publish')])
  assert.deepEqual(outcomes.map(result => result.status).sort(), [201, 409])
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(uploadId).published, 1)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM website_access_audit WHERE action = 'download.publish'").get().n, 1)
})

test('draft quota and recovery are actor-private and publication rolls back on audit failure', async t => {
  const { call, begin, sqlite, chunks } = await manualFixture(t)
  const existing = await seedDownload(sqlite)
  const first = await begin()
  const second = await begin()
  const listed = await (await call('/studio/downloads/uploads', 'GET')).json()
  assert.deepEqual(listed.uploads.map(row => row.id).sort(), [first.uploadId, second.uploadId].sort())
  const other = await (await call('/studio/downloads/uploads', 'GET', undefined, '1012053634911064114')).json()
  assert.deepEqual(other.uploads, [])
  assert.equal((await call('/studio/downloads/uploads', 'POST', {
    productId: '1', name: 'LumenShards', version: '1', filename: 'test.jar',
    size: 100, sha256: '0'.repeat(64),
  })).status, 409)
  await call(second.path + '/cancel')
  for (let start = 0; start < chunks.length; start += first.batchSize) {
    await call(first.path + '/chunks', 'PUT', { start, chunks: chunks.slice(start, start + first.batchSize) })
  }
  sqlite.exec(`CREATE TRIGGER reject_upload_audit BEFORE INSERT ON website_access_audit
    WHEN NEW.action = 'download.publish' BEGIN SELECT RAISE(ABORT, 'internal audit error'); END`)
  const response = await call(first.path + '/publish')
  assert.equal(response.status, 503)
  assert.equal((await response.text()).includes('internal audit error'), false)
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(first.uploadId).published, 0)
  assert.equal(sqlite.prepare('SELECT state FROM studio_manual_uploads WHERE download_id = ?').get(first.uploadId).state, 'failed')
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(existing.id).published, 1)
  assert.equal((await call(first.path + '/cancel')).status, 200)
})

test('writes begun before the verification lock cannot insert chunks after locking', async t => {
  const { call, begin, env, chunks, sqlite } = await manualFixture(t)
  const { path, uploadId } = await begin()
  const batch = env.COMMUNITY_DB.batch
  env.COMMUNITY_DB.batch = async statements => {
    sqlite.prepare("UPDATE studio_manual_uploads SET state = 'verifying' WHERE download_id = ?").run(uploadId)
    return batch(statements)
  }
  assert.equal((await call(path + '/chunks', 'PUT', { start: 0, chunks: [chunks[0]] })).status, 409)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM studio_download_chunks WHERE download_id = ?').get(uploadId).n, 0)
  assert.equal((await call(path + '/cancel')).status, 409)
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(uploadId).published, 0)
})

async function browserUploadApi(owner) {
  const { transformWithEsbuild } = await import('vite')
  const source = (await readFile(new URL('../docs/.vitepress/theme/studio-api.ts', import.meta.url), 'utf8'))
    .replace("import { getDiscordSession } from './discord-session'", `const getDiscordSession = () => '${owner}'`)
    .replaceAll('import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT', "'https://worker.example/chat'")
  const { code } = await transformWithEsbuild(source, 'studio-api.ts', { loader: 'ts' })
  return import('data:text/javascript;base64,' + Buffer.from(code + '\n//' + crypto.randomUUID()).toString('base64'))
}

test('draft listing and cancellation database failures return actionable errors', async t => {
  const { call, begin, env, sqlite } = await manualFixture(t)
  const { path, uploadId } = await begin()
  const prepare = env.COMMUNITY_DB.prepare
  env.COMMUNITY_DB.prepare = sql => {
    if (sql.includes('SELECT d.id,d.name,d.filename') || sql.includes('DELETE FROM studio_downloads WHERE id = ?')) {
      throw new Error('Private database failure')
    }
    return prepare(sql)
  }
  const list = await call('/studio/downloads/uploads', 'GET')
  assert.equal(list.status, 503)
  assert.match((await list.json()).error, /could not be listed.*Refresh builds.*0009_manual_uploads/)
  const cancel = await call(path + '/cancel')
  assert.equal(cancel.status, 503)
  assert.match((await cancel.json()).error, /cancellation could not be confirmed.*Refresh builds/)
  assert.equal(sqlite.prepare('SELECT published FROM studio_downloads WHERE id = ?').get(uploadId).published, 0)
})

test('browser reports both transfer and automatic draft cancellation failures', async t => {
  const api = await browserUploadApi('1400375985211441242')
  const original = { fetch: globalThis.fetch, window: globalThis.window, now: Date.now }
  t.after(() => { globalThis.fetch = original.fetch; globalThis.window = original.window; Date.now = original.now })
  let clock = Date.now()
  Date.now = () => clock += 2100
  globalThis.window = { location: { origin: 'https://lumenstudio.fyi' } }
  const paths = []
  globalThis.fetch = async input => {
    const path = new URL(input).pathname
    paths.push(path)
    if (path.endsWith('/uploads')) return Response.json({ uploadId: crypto.randomUUID(), chunkSize: 65536, batchSize: 20 })
    if (path.endsWith('/chunks')) return Response.json({ error: 'Transfer unavailable' }, { status: 503 })
    return Response.json({ error: 'Cancellation unavailable' }, { status: 503 })
  }
  await assert.rejects(api.uploadPluginDownload({ productId: '1', version: '1' },
    new File([pluginJar()], 'plugin.jar'), new AbortController().signal, () => {}),
  /Transfer unavailable.*Draft cancellation could not be confirmed: Cancellation unavailable.*Refresh builds.*24 hours/)
  assert.equal(paths.length, 3)
  assert.ok(paths.at(-1).endsWith('/cancel'))
})

test('staff UI preserves downloads and exposes draft listing and discard failures', async t => {
  const { parse, compileScript } = await import('@vue/compiler-sfc')
  const { transformWithEsbuild } = await import('vite')
  const original = { request: globalThis.manualUiRequest, cancel: globalThis.manualUiCancel }
  t.after(() => {
    if (original.request === undefined) delete globalThis.manualUiRequest
    else globalThis.manualUiRequest = original.request
    if (original.cancel === undefined) delete globalThis.manualUiCancel
    else globalThis.manualUiCancel = original.cancel
  })
  globalThis.manualUiRequest = async path => {
    if (path === '/downloads/uploads') throw new Error('Draft service unavailable')
    return { items: [{ id: 'existing-download' }], total: 1, builds: [] }
  }
  globalThis.manualUiCancel = async () => { throw new Error('Discard service unavailable') }
  const source = (await readFile(new URL('../docs/.vitepress/theme/PluginDownloads.vue', import.meta.url), 'utf8'))
    .replace("import { onMounted, onUnmounted, ref } from 'vue'", "import { ref } from 'vue'\nconst onMounted = () => {}; const onUnmounted = () => {}")
    .replace("import { getDiscordSession } from './discord-session'", "const getDiscordSession = () => '1400375985211441242'")
    .replace(/^import .* from '\.\/studio-api'$/m, `const studioRequest = globalThis.manualUiRequest
      const cancelPluginUpload = globalThis.manualUiCancel
      const savePluginDownload = async () => {}; const uploadPluginDownload = async () => {}`)
    .replace("'../../../shared/trial-products.mjs'", JSON.stringify(new URL('../shared/trial-products.mjs', import.meta.url).href))
  const compiled = compileScript(parse(source).descriptor, { id: 'manual-upload-ui' }).content
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  const { code } = await transformWithEsbuild(compiled, 'PluginDownloads.ts', { loader: 'ts' })
  const component = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default
  const ui = component.setup({ staff: true }, { expose() {} })
  ui.drafts.value = [{ id: 'unfinished' }]
  await ui.load()
  assert.equal(ui.items.value[0].id, 'existing-download')
  assert.equal(ui.drafts.value[0].id, 'unfinished')
  assert.match(ui.draftError.value, /Draft service unavailable.*Refresh builds.*out of date/)
  await ui.cancelDraft('unfinished')
  assert.match(ui.error.value, /Cancellation could not be confirmed.*Discard service unavailable.*Refresh builds/)
  assert.match(ui.draftError.value, /Draft service unavailable/)
})

test('browser uploads a full 32 MiB JAR using bounded, paced writes and server-side verification', async t => {
  const { env, deps, owner, sqlite } = await manualFixture(t)
  const api = await browserUploadApi(owner)
  const original = { fetch: globalThis.fetch, window: globalThis.window, now: Date.now, timeout: globalThis.setTimeout }
  t.after(() => {
    globalThis.fetch = original.fetch; globalThis.window = original.window
    Date.now = original.now; globalThis.setTimeout = original.timeout
  })
  let clock = Date.now()
  Date.now = () => clock
  globalThis.window = { location: { origin: 'https://lumenstudio.fyi' } }
  globalThis.setTimeout = (callback, delay) => {
    queueMicrotask(() => { clock += delay; callback() })
    return 1
  }
  const writes = []
  env.ADMIN_WRITE_LIMITER = { limit: async () => {
    assert.ok(writes.filter(time => time > clock - 60000).length <= 30)
    return { success: true }
  } }
  globalThis.fetch = async (input, options) => {
    const request = new Request(input, options)
    writes.push(clock)
    if (options.body) assert.ok(Buffer.byteLength(options.body) < 1800000)
    return handlePluginDownloads(request, env, 'https://lumenstudio.fyi', new URL(input).pathname, deps)
  }
  const bytes = pluginJar(32 * 1048576 - pluginJar(0).length)
  assert.equal(bytes.length, 32 * 1048576)
  const file = new File([bytes], 'LumenShards-1.2.3.jar', { type: 'application/java-archive' })
  const progress = []
  const artifact = await api.uploadPluginDownload({ productId: '1', version: '1.2.3' },
    file, new AbortController().signal, message => progress.push(message))
  assert.equal(writes.length, 28)
  assert.ok(writes.slice(1).every((time, n) => time - writes[n] >= 2100))
  assert.match(progress.at(-1), /verifying/)
  assert.equal(sqlite.prepare('SELECT published,size,chunk_count FROM studio_downloads WHERE id = ?').get(artifact.id).published, 1)
  const response = await handlePluginDownloads(new Request('https://worker.example/studio/downloads/' + artifact.id, {
    headers: { Authorization: 'Bearer ' + owner },
  }), env, 'https://lumenstudio.fyi', '/studio/downloads/' + artifact.id, deps)
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
})
