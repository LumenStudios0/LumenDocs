import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { handleProductTools } from '../worker/product-tools.js'
import { backfillMemberPoints, redeemPointReferral, syncPointEarnings, usdCents } from '../worker/lumen-points.js'
import { rememberMember } from '../worker/access-control.js'
import { reconcileShopCoupons } from '../worker/points-shop.js'
import { productMarketplace } from '../shared/product-marketplace.mjs'
import { saveLicensePointsChoice } from '../worker/license-points.js'

const member = '123456789012345678'
const referrer = '223456789012345678'
const stranger = '323456789012345678'
const staffRegistry = () => productMarketplace.map(product => ({ productId: product.productId, name: product.name, active: true, plugins: [product.productId] }))
async function setup(t) {
  const sqlite = new DatabaseSync(':memory:')
  const directory = new URL('../worker/migrations/community/', import.meta.url)
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(await readFile(new URL(file, directory), 'utf8'))
  }
  t.after(() => sqlite.close())
  const state = Symbol('statement')
  const db = {
    failBatch: false,
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
        const results = statements.map((statement, index) => {
          if (db.failBatch && index === 1) throw Error('Injected write failure')
          const [sql, params] = statement[state]()
          return { meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  const env = {
    COMMUNITY_DB: db, BUILDBYBIT_API_AUTHORIZATION: 'server-only-bbb-token', BUILDBYBIT_RESOURCE_IDS: '1001,1002',
    LICENSE_API_URL: 'https://licenses.example', LICENSE_ADMIN_API_TOKEN: 'server-only-license-token',
    ADMIN_READ_LIMITER: { limit: async () => ({ success: true }) }, ADMIN_WRITE_LIMITER: { limit: async () => ({ success: true }) },
  }
  const deps = { respond: (body, status) => Response.json(body, { status }), verifyLoginToken: async token => /^\d{5,22}$/.test(token) ? { id: token } : null }
  const call = (path = '/studio/points', method = 'GET', body, user = member) => handleProductTools(new Request('https://worker.example' + path, {
    method, headers: { Authorization: `Bearer ${user}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, 'https://lumenstudio.fyi', path.split('?')[0], deps)
  const purchase = (overrides = {}) => ({
    purchase_id: 501, content_type: 'resource', content_id: 1001, buyer_id: 55,
    Buyer: { user_id: 55, discord_id: member, banned: false },
    created_at: Math.floor(Date.now() / 1000) - 60, validated_at: Math.floor(Date.now() / 1000) - 30,
    FinalPrice: { value: 12.35, currency: 'USD' }, ...overrides,
  })
  const stateData = {
    purchases: [purchase()],
    licenses: [{ content_type: 'resource', content_id: 1001, buyer_id: 55,
      Buyer: { user_id: 55, discord_id: member, banned: false }, permanent: true, active: true }],
    registry: Array.from({ length: 12 }, (_, i) => ({ productId: `p${i}`, name: `Plugin ${i}`, active: true, plugins: [`plugin${i}`] })),
    ownership: [], failed: '', malformed: false,
    resourceCatalog: [...productMarketplace.filter(product => product.resourceId).map(product => ({ resource_id: Number(product.resourceId), title: product.name })),
      { resource_id: 199999, title: 'LumenCosmetics - Player cosmetics' }],
  }
  const previous = globalThis.fetch
  t.after(() => { globalThis.fetch = previous })
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.hostname === 'api.builtbybit.com') {
      assert.equal(options.headers.Authorization, 'server-only-bbb-token')
      if (url.pathname.endsWith('/creator/resources')) {
        if (stateData.failed === 'resources') return Response.json({ error: 'Access denied' }, { status: 403 })
        assert.equal(url.searchParams.get('with'), null)
        const rows = stateData.resourceCatalog
        return Response.json({ result: 'success', data: { resources: rows, stats: { total: rows.length, page: 1, per_page: 100, max_page: 1 } } })
      }
      assert.equal(url.searchParams.get('with'), 'Buyer')
      const discovered = sqlite.prepare('SELECT resource_id FROM lumen_points_resource_catalog').all().map(row => row.resource_id)
      assert.equal(url.searchParams.get('resource_ids'), ['1001', '1002', ...productMarketplace.map(product => product.resourceId).filter(Boolean), ...discovered].join(','))
      const name = url.pathname.endsWith('/purchases') ? 'purchases' : 'licenses'
      if (stateData.failed === name) return Response.json({ error: 'Access denied' }, { status: 403 })
      const items = stateData[name]
      const page = Number(url.searchParams.get('page'))
      const rows = items.slice((page - 1) * 100, page * 100)
      return Response.json({ result: 'success', data: { [name]: rows, stats: {
        total: items.length + (stateData.malformed ? 1 : 0), page, per_page: 100, max_page: Math.max(1, Math.ceil(items.length / 100)),
      } } })
    }
    if (url.pathname.endsWith('/products')) return Response.json({ items: stateData.registry, total: stateData.registry.length })
    return Response.json({ customerDiscordId: url.pathname.split('/').pop(), status: 'active', verificationRequired: false,
      products: stateData.ownership.map(productId => ({ productId, productActive: true, status: 'active', expiresAt: null })) })
  }
  const clearCache = () => sqlite.exec('UPDATE lumen_points_accounts SET purchase_checked_at=NULL,tier_checked_at=NULL,staff_checked_at=NULL')
  return { db, env, sqlite, call, purchase, data: stateData, clearCache }
}

test('welcome migration credits every existing account once, preserving earnings and private notices', async t => {
  const sqlite = new DatabaseSync(':memory:')
  t.after(() => sqlite.close())
  const directory = new URL('../worker/migrations/community/', import.meta.url)
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.sql') && name < '0033').sort()) {
    sqlite.exec(await readFile(new URL(file, directory), 'utf8'))
  }
  for (const id of [member, referrer]) sqlite.prepare('INSERT INTO website_members(discord_id) VALUES (?)').run(id)
  const now = new Date().toISOString()
  sqlite.prepare('INSERT INTO lumen_points_accounts(user_id,referral_code,created_at) VALUES (?,?,?)')
    .run(member, 'LP-AAAAAAAAAAAA', now)
  sqlite.prepare("INSERT INTO lumen_points_rewards VALUES (?,?,'purchase',12350,'Previous purchase',?,?)")
    .run('previous', member, now, now)
  const migration = await readFile(new URL('0033_member_welcome_points.sql', directory), 'utf8')
  sqlite.exec(migration)
  assert.equal(sqlite.prepare('SELECT units FROM lumen_points_balances WHERE user_id=?').get(member).units, 22350)
  assert.equal(sqlite.prepare('SELECT units FROM lumen_points_balances WHERE user_id=?').get(referrer).units, 10000)
  assert.equal(sqlite.prepare('SELECT referral_code FROM lumen_points_accounts WHERE user_id=?').get(member).referral_code, 'LP-AAAAAAAAAAAA')
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:welcome:%' AND audience='user' AND link='/account/points'").get().n, 2)
  sqlite.exec(`INSERT OR IGNORE INTO lumen_points_welcome_rewards(user_id,created_at)
    SELECT user_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM lumen_points_accounts;`)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_welcome_rewards').get().n, 2)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lumen_points_transactions WHERE label='Welcome gift' AND delta_units=10000").get().n, 2)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:welcome:%'").get().n, 2)
})

test('new signups receive spendable welcome points once without purchase or referral earnings', async t => {
  const { call, env, sqlite, data, clearCache } = await setup(t)
  data.purchases = []
  for (let i = 0; i < 3; i++) await rememberMember({ id: member, username: 'member' }, env)
  let wallet = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(wallet.balance, 100)
  assert.equal(wallet.purchasePoints, 0)
  assert.equal(wallet.referralPoints, 0)
  assert.equal(wallet.eligibleReferralPoints, 0)
  assert.ok(wallet.history.some(row => row.label === 'Welcome gift' && row.points === 100))
  const now = new Date().toISOString()
  sqlite.prepare("INSERT INTO lumen_points_rewards VALUES (?,?,'tier',15000,'Other earnings',?,?)").run('other', member, now, now)
  const bought = await call('/studio/points/shop/redeem', 'POST', { requestId: crypto.randomUUID(), productId: 'badge_starlit' })
  assert.equal(bought.status, 200)
  assert.equal((await bought.json()).balance, 0)
  clearCache()
  wallet = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(wallet.balance, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_welcome_rewards WHERE user_id=?').get(member).n, 1)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id=? AND recipient_id=?").get(`points:welcome:${member}`, member).n, 1)
})

test('welcome credit and private notification fail atomically and retry without a duplicate', async t => {
  const { env, sqlite } = await setup(t)
  sqlite.exec(`CREATE TRIGGER reject_welcome_notice BEFORE INSERT ON community_notifications
    WHEN NEW.id LIKE 'points:welcome:%' BEGIN SELECT RAISE(ABORT,'Injected notification failure'); END;`)
  await assert.rejects(rememberMember({ id: member, username: 'member' }, env), /Injected notification failure/)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_accounts WHERE user_id=?').get(member).n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_welcome_rewards').get().n, 0)
  sqlite.exec('DROP TRIGGER reject_welcome_notice')
  await rememberMember({ id: member, username: 'member' }, env)
  await rememberMember({ id: member, username: 'member' }, env)
  assert.equal(sqlite.prepare('SELECT units FROM lumen_points_balances WHERE user_id=?').get(member).units, 10000)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_welcome_rewards').get().n, 1)
})

test('points accounts get unique stable automatic referral codes and cannot expose another wallet', async t => {
  const { call, env, sqlite } = await setup(t)
  await rememberMember({ id: member, username: 'member' }, env)
  const automatic = sqlite.prepare('SELECT referral_code FROM lumen_points_accounts WHERE user_id=?').get(member).referral_code
  const first = await (await call()).json()
  await rememberMember({ id: member, username: 'new name' }, env)
  assert.match(first.referralCode, /^LP-[A-F0-9]{12}$/)
  assert.equal(first.referralCode, automatic)
  assert.equal((await (await call()).json()).referralCode, first.referralCode)
  const second = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  assert.notEqual(first.referralCode, second.referralCode)
  assert.equal(first.balance, 100 + 0)
  assert.equal((await call('/studio/points', 'GET', undefined, '')).status, 401)
  assert.equal((await call('/studio/points', 'DELETE')).status, 405)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_accounts').get().n, 2)
})

test('USD conversion preserves fractional points without trusting formatted or list prices', () => {
  assert.equal(usdCents({ value: 12.35, currency: 'USD' }), 1235)
  assert.equal(usdCents({ value: '0.01', currency: 'USD' }), 1)
  assert.equal(usdCents({ value: 0.1, currency: 'USD' }), 10)
  for (const value of [-1, NaN, Infinity, '1.999', '1e3', null]) assert.throws(() => usdCents({ value, currency: 'USD' }))
  assert.throws(() => usdCents({ value: 12, currency: 'EUR' }), /non-USD/)
})

async function shopFixture(t, points = 5000) {
  const fixture = await setup(t)
  await fixture.call()
  fixture.sqlite.prepare(`INSERT INTO lumen_points_rewards VALUES (?,?,'tier',?,'Test earnings',?,?)`)
    .run('test:shop', member, points * 100, new Date().toISOString(), new Date().toISOString())
  return fixture
}

test('shop prices are server controlled, cosmetics are permanent and purchase/history balances include spending', async t => {
  const { call, sqlite } = await shopFixture(t, 600)
  const requestId = crypto.randomUUID()
  const body = { requestId, productId: 'badge_starlit', price: 1, userId: stranger }
  const first = await (await call('/studio/points/shop/redeem', 'POST', body)).json()
  assert.equal(first.balance, 100 + 350)
  assert.deepEqual(first.owned, ['badge_starlit'])
  assert.equal(first.orders[0].price, 250)
  const duplicate = await (await call('/studio/points/shop/redeem', 'POST', body)).json()
  assert.equal(duplicate.balance, 100 + 350)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_orders').get().n, 1)
  assert.equal((await call('/studio/points/shop/redeem', 'POST', { ...body, requestId: crypto.randomUUID() })).status, 409)
  const wallet = await (await call()).json()
  assert.equal(wallet.balance, 100 + 350)
  assert.ok(wallet.history.some(entry => entry.points === -250 && entry.label === 'Shop: Starlit badge'))
})

test('atomic spending prevents concurrent overspending and rolls back if fulfillment cannot be recorded', async t => {
  const { call, db, sqlite } = await shopFixture(t, 300)
  const results = await Promise.all(['badge_starlit', 'effect_aurora'].map(productId =>
    call('/studio/points/shop/redeem', 'POST', { requestId: crypto.randomUUID(), productId })))
  assert.equal(results.filter(result => result.status === 200).length, 1)
  assert.equal(results.filter(result => result.status === 409).length, 1)
  assert.ok((await (await call()).json()).balance >= 0)
  sqlite.prepare("UPDATE lumen_points_rewards SET points_units=500000 WHERE reward_key='test:shop'").run()
  db.failBatch = true
  assert.equal((await call('/studio/points/shop/redeem', 'POST', { requestId: crypto.randomUUID(), productId: 'effect_orbit' })).status, 503)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_orders').get().n, 1)
})

test('free products notify all staff atomically, never earn purchase points or advance point milestones, and can be refunded once', async t => {
  const { call, env, sqlite, data, clearCache } = await shopFixture(t)
  await rememberMember({ id: stranger, username: 'helper' }, env)
  sqlite.prepare("UPDATE website_members SET role_id='support_team' WHERE discord_id=?").run(stranger)
  const requestId = crypto.randomUUID()
  const order = await (await call('/studio/points/shop/redeem', 'POST', { requestId, productId: 'free_product', pluginId: 'p2' })).json()
  assert.equal(order.balance, 100 + 3500)
  assert.equal(order.orders[0].state, 'pending')
  const recipients = sqlite.prepare("SELECT recipient_id FROM community_notifications WHERE id LIKE 'shop:%'").all().map(row => row.recipient_id)
  for (const id of ['1400375985211441242', '1012053634911064114', stranger]) assert.ok(recipients.includes(id))
  data.ownership = ['p0', 'p1', 'p2']
  data.purchases = []
  clearCache()
  const checked = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(checked.purchasePoints, 0)
  assert.equal(checked.milestones.find(tier => tier.id === 'spark').awarded, false)
  const refund = { orderId: requestId, state: 'refunded', note: 'Canceled before any license was granted.' }
  assert.equal((await call('/studio/points/shop/fulfill', 'POST', refund)).status, 403)
  assert.equal((await call('/studio/points/shop/fulfill', 'POST', refund, '1400375985211441242')).status, 200)
  assert.equal((await (await call()).json()).balance, 100 + 5000)
  assert.equal((await call('/studio/points/shop/fulfill', 'POST', refund, '1400375985211441242')).status, 409)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lumen_points_shop_events WHERE delta_units>0").get().n, 1)
})

test('shop rejects unauthenticated, forged, already-owned and incomplete requests without spending points', async t => {
  const { call, data, sqlite } = await shopFixture(t)
  assert.equal((await call('/studio/points/shop', 'GET', undefined, '')).status, 401)
  for (const body of [
    { requestId: crypto.randomUUID(), productId: 'not_real' },
    { requestId: 'bad', productId: 'coupon_5' },
    { requestId: crypto.randomUUID(), productId: 'commission', description: 'short' },
    { requestId: crypto.randomUUID(), productId: 'free_product', pluginId: 'unknown' },
  ]) assert.ok((await call('/studio/points/shop/redeem', 'POST', body)).status >= 400)
  data.ownership = ['p0']
  assert.equal((await call('/studio/points/shop/redeem', 'POST', { requestId: crypto.randomUUID(), productId: 'free_product', pluginId: 'p0' })).status, 400)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_orders').get().n, 0)
})

test('shop coupons issue once, uncertain creation stays charged and known rejections refund points', async t => {
  const { call, env, sqlite } = await shopFixture(t)
  const previous = globalThis.fetch
  let mode = 'issued', creates = 0
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    if (url.pathname.endsWith('/coupons') && options?.method === 'POST') {
      creates++
      if (mode === 'failed') return Response.json({ result: 'error' }, { status: 403 })
      if (mode === 'uncertain') throw Error('Connection interrupted after submit')
      const body = JSON.parse(options.body)
      return Response.json({ result: 'success', data: { coupon: {
        coupon_id: 88, label: `88-${body.label}`, percent: true, discount: body.discount / 100, active: true,
        all_content_types: [], expires_at: null, max_per_user_uses: null, max_uses: 1,
      } } })
    }
    if (url.pathname.endsWith('/coupons/entries')) return Response.json({ result: 'success', data: {
      entries: [{ coupon_id: 88, content_type: 'resource', content_id: 1001 }],
      stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
    } })
    return previous(input, options)
  }
  const body = { requestId: crypto.randomUUID(), productId: 'coupon_5' }
  const issued = await (await call('/studio/points/shop/redeem', 'POST', body)).json()
  assert.equal(issued.balance, 100 + 4900)
  assert.equal(issued.orders[0].state, 'fulfilled')
  await call('/studio/points/shop/redeem', 'POST', body)
  assert.equal(creates, 1)
  mode = 'failed'
  const failed = await (await call('/studio/points/shop/redeem', 'POST', { requestId: crypto.randomUUID(), productId: 'coupon_10' })).json()
  assert.equal(failed.balance, 100 + 4900)
  assert.ok(failed.orders.some(order => order.state === 'refunded'))
  mode = 'uncertain'
  const pendingId = crypto.randomUUID()
  const pending = await (await call('/studio/points/shop/redeem', 'POST', { requestId: pendingId, productId: 'coupon_10' })).json()
  assert.equal(pending.balance, 100 + 4740)
  assert.equal(sqlite.prepare('SELECT state FROM lumen_points_orders WHERE id=?').get(pendingId).state, 'review')
  sqlite.prepare("UPDATE coupon_rewards SET state='issued' WHERE reward_key=?").run(`shop:${pendingId}`)
  await reconcileShopCoupons(env)
  assert.equal(sqlite.prepare('SELECT state FROM lumen_points_orders WHERE id=?').get(pendingId).state, 'fulfilled')
})

test('purchased badges and effects can be equipped without a loyalty tier and unowned cosmetics are rejected', async t => {
  const { call } = await shopFixture(t)
  let profile = (await (await call('/studio/profiles/me')).json()).profile
  const body = () => ({
    displayName: profile.displayName, bio: '', pronouns: '', status: '', accent: profile.accent, banner: profile.banner,
    website: '', showcase: '', favoritePlugin: '', public: true, revision: profile.revision,
    badgeIds: ['badge_starlit'], appearance: { background: 'none', frame: 'none', decoration: 'none', effect: 'effect_aurora' },
  })
  assert.equal((await call('/studio/profiles/me', 'PUT', body())).status, 403)
  for (const productId of ['badge_starlit', 'effect_aurora']) {
    assert.equal((await call('/studio/points/shop/redeem', 'POST', { requestId: crypto.randomUUID(), productId })).status, 200)
  }
  profile = (await (await call('/studio/profiles/me')).json()).profile
  assert.equal(profile.tier, null)
  assert.ok(profile.availableBadges.some(badge => badge.id === 'badge_starlit'))
  assert.equal((await call('/studio/profiles/me', 'PUT', body())).status, 200)
  const published = (await (await call(`/studio/profiles/${member}`)).json()).profile
  assert.equal(published.appearance.effect, 'effect_aurora')
  assert.deepEqual(published.badges, [{ id: 'badge_starlit', name: 'Starlit' }])
})

test('coupon crashes before reservation refund safely, but potentially created coupons remain under review', async t => {
  const { call, env, sqlite } = await shopFixture(t, 500)
  const now = new Date(Date.now() - 20 * 60000).toISOString()
  const unissued = crypto.randomUUID(), uncertain = crypto.randomUUID()
  for (const [id, productId, units] of [[unissued, 'coupon_5', 10000], [uncertain, 'coupon_10', 16000]]) {
    sqlite.prepare(`INSERT INTO lumen_points_orders VALUES (?,?,?,'Coupon',?,'processing','{}','',NULL,?,?)`).run(id, member, productId, units, now, now)
  }
  sqlite.prepare(`INSERT INTO coupon_rewards(reward_key,user_id,kind,discount,state,label_suffix,created_at,updated_at)
    VALUES (?,?,'manual',10,'issuing','KNOWNRESERVATION',?,?)`).run(`shop:${uncertain}`, member, now, now)
  await reconcileShopCoupons(env)
  assert.equal(sqlite.prepare('SELECT state FROM lumen_points_orders WHERE id=?').get(unissued).state, 'refunded')
  assert.equal(sqlite.prepare('SELECT state FROM lumen_points_orders WHERE id=?').get(uncertain).state, 'review')
  assert.equal(sqlite.prepare('SELECT state FROM coupon_rewards WHERE reward_key=?').get(`shop:${uncertain}`).state, 'uncertain')
  assert.equal((await (await call()).json()).balance, 100 + 340)
})

test('background backfill credits every registered buyer without a page visit and never duplicates rewards', async t => {
  const { env, sqlite, data, purchase } = await setup(t)
  for (const id of [member, referrer, stranger]) await rememberMember({ id, username: 'member' }, env)
  data.purchases.push(purchase({ purchase_id: 502, buyer_id: 56,
    Buyer: { user_id: 56, discord_id: referrer }, FinalPrice: { value: 20, currency: 'USD' } }))
  data.purchases.push(purchase({ purchase_id: 503, buyer_id: 57,
    Buyer: { user_id: 57, discord_id: '423456789012345678' } }))
  data.ownership = ['p0', 'p1', 'p2']
  for (const id of [member, referrer, stranger]) for (const productId of data.ownership) {
    await saveLicensePointsChoice(env.COMMUNITY_DB, id, productId, false, '1400375985211441242')
  }
  await backfillMemberPoints(env)
  const balance = id => sqlite.prepare('SELECT SUM(points_units)/100.0 AS n FROM lumen_points_rewards WHERE user_id=?').get(id).n
  assert.equal(balance(member), 173.5)
  assert.equal(balance(referrer), 250)
  assert.equal(balance(stranger), 50)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_accounts').get().n, 3)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_accounts WHERE purchase_checked_at IS NOT NULL AND tier_checked_at IS NOT NULL AND backfill_error IS NULL').get().n, 3)
  const historyCount = sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_history').get().n
  await backfillMemberPoints(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_history').get().n, historyCount)
})

test('backfill records failed checks, preserves balances and retries without blocking other members', async t => {
  const { env, sqlite, data, purchase } = await setup(t)
  for (const id of [member, referrer]) await rememberMember({ id, username: 'member' }, env)
  data.purchases.push(purchase({ purchase_id: 502, buyer_id: 56,
    Buyer: { user_id: 56, discord_id: referrer }, FinalPrice: { value: 10, currency: 'EUR' } }))
  await backfillMemberPoints(env)
  assert.equal(sqlite.prepare('SELECT SUM(points_units) AS n FROM lumen_points_rewards WHERE user_id=?').get(member).n, 12350)
  assert.match(sqlite.prepare('SELECT backfill_error FROM lumen_points_accounts WHERE user_id=?').get(referrer).backfill_error, /non-USD/)
  data.purchases[1].FinalPrice.currency = 'USD'
  await backfillMemberPoints(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_rewards WHERE user_id=?').get(referrer).n, 0)
  sqlite.prepare('UPDATE lumen_points_accounts SET backfill_attempted_at=NULL').run()
  await backfillMemberPoints(env)
  assert.equal(sqlite.prepare('SELECT SUM(points_units) AS n FROM lumen_points_rewards WHERE user_id=?').get(referrer).n, 10000)
  assert.equal(sqlite.prepare('SELECT backfill_error FROM lumen_points_accounts WHERE user_id=?').get(referrer).backfill_error, null)
})

test('backfill bounds each batch and rejects incomplete purchase feeds without crediting anyone', async t => {
  const { env, sqlite, data } = await setup(t)
  for (let i = 0; i < 12; i++) await rememberMember({ id: String(BigInt(member) + BigInt(i)), username: 'member' }, env)
  data.failed = 'purchases'
  await backfillMemberPoints(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_accounts WHERE backfill_attempted_at IS NOT NULL').get().n, 10)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_rewards').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_accounts WHERE backfill_error LIKE ?').get('%HTTP 403%').n, 10)
  data.failed = ''
  await backfillMemberPoints(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_accounts WHERE purchase_checked_at IS NOT NULL').get().n, 2)
})

test('purchase sync is idempotent and only counts verified paid amounts for the authenticated buyer', async t => {
  const { call, data, purchase, clearCache, sqlite } = await setup(t)
  data.purchases.push(purchase({ purchase_id: 502, buyer_id: 56, Buyer: { user_id: 56, discord_id: referrer, banned: false } }))
  const first = await (await call('/studio/points/sync', 'POST', { amount: 9999, userId: referrer })).json()
  assert.equal(first.balance, 100 + 123.5)
  assert.equal(first.checks.purchases.ok, true)
  assert.equal(first.purchasePoints, 123.5)
  assert.equal(first.periods.daily.purchasePoints, 123.5)
  assert.equal(first.history.length, 2)
  clearCache()
  const again = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(again.balance, 100 + 123.5)
  assert.equal(again.history.length, 2)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_purchases').get().n, 1)
  data.purchases[0].FinalPrice.value = 0
  clearCache()
  const free = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(free.balance, 100 + 0)
  assert.ok(free.history.some(row => row.points === -123.5))
})

test('referral awards half of eligible last-24-hour purchase points once while buyer keeps everything', async t => {
  const { call, data, purchase, clearCache, sqlite } = await setup(t)
  const owner = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  data.purchases.push(purchase({ purchase_id: 502, FinalPrice: { value: 0.01, currency: 'USD' } }))
  data.purchases.push(purchase({ purchase_id: 503, created_at: Math.floor(Date.now() / 1000) - 90000 }))
  const result = await call('/studio/points/referral', 'POST', { code: owner.referralCode.toLowerCase() })
  assert.equal(result.status, 200, JSON.stringify(await result.clone().json()))
  const buyer = await result.json()
  assert.equal(buyer.balance, 100 + 247.1)
  assert.ok(buyer.redeemedAt)
  const awarded = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  assert.equal(awarded.balance, 100 + 61.8)
  assert.equal(awarded.successfulReferrals, 1)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_referral_purchases').get().n, 2)
  const duplicate = await call('/studio/points/referral', 'POST', { code: owner.referralCode })
  assert.equal(duplicate.status, 409)
  clearCache()
  data.purchases.push(purchase({ purchase_id: 504 }))
  await call('/studio/points/sync', 'POST', {})
  assert.equal((await (await call('/studio/points', 'GET', undefined, referrer)).json()).balance, 100 + 61.8)
})

test('self referrals, malformed codes, unknown codes and buyers without a recent paid purchase are rejected', async t => {
  const { call, data } = await setup(t)
  const own = await (await call()).json()
  assert.equal((await call('/studio/points/referral', 'POST', { code: own.referralCode })).status, 400)
  assert.equal((await call('/studio/points/referral', 'POST', { code: 'bad' })).status, 400)
  assert.equal((await call('/studio/points/referral', 'POST', { code: 'LP-AAAAAAAAAAAA' })).status, 404)
  const other = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  data.purchases = []
  assert.equal((await call('/studio/points/referral', 'POST', { code: other.referralCode }, stranger)).status, 409)
})

test('exactly 24 hours qualifies but one millisecond beyond the cutoff does not', async t => {
  const { call, db, sqlite } = await setup(t)
  const owner = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  await call()
  const now = new Date('2026-11-17T06:00:00Z').getTime()
  t.mock.timers.enable({ apis: ['Date'], now })
  sqlite.prepare('UPDATE lumen_points_accounts SET buyer_id=? WHERE user_id=?').run('55', member)
  sqlite.prepare(`INSERT INTO lumen_points_purchases VALUES ('old',?,'55','1001',100,1000,?,'scan')`)
    .run(member, new Date(now - 86400000 - 1).toISOString())
  await assert.rejects(redeemPointReferral(db, member, owner.referralCode), /previous 24 hours/)
  sqlite.prepare("UPDATE lumen_points_purchases SET purchased_at=? WHERE purchase_id='old'").run(new Date(now - 86400000).toISOString())
  await redeemPointReferral(db, member, owner.referralCode)
  assert.equal(sqlite.prepare("SELECT points_units FROM lumen_points_rewards WHERE kind='referral'").get().points_units, 500)
})

test('refund reconciliation adjusts buyer and referrer balances, never double-awards on restoration', async t => {
  const { call, data, clearCache } = await setup(t)
  const owner = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  await call('/studio/points/referral', 'POST', { code: owner.referralCode })
  data.purchases[0].validated_at = 0
  clearCache()
  let buyer = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(buyer.balance, 100 + 0)
  let inviter = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  assert.equal(inviter.balance, 100 + 0)
  assert.equal(inviter.successfulReferrals, 0)
  assert.ok(inviter.history.some(row => row.points === -61.75))
  data.purchases[0].validated_at = Math.floor(Date.now() / 1000) - 30
  clearCache()
  buyer = await (await call('/studio/points/sync', 'POST', {})).json()
  inviter = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  assert.equal(buyer.balance, 100 + 123.5)
  assert.equal(inviter.balance, 100 + 61.75)
  assert.equal(inviter.successfulReferrals, 1)
})

test('incomplete or unauthorized scans never credit or revoke purchases and explicitly report failure', async t => {
  const { call, data, clearCache } = await setup(t)
  await call('/studio/points/sync', 'POST', {})
  data.failed = 'purchases'
  clearCache()
  const result = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(result.balance, 100 + 123.5)
  assert.equal(result.checks.purchases.ok, false)
  assert.match(result.checks.purchases.error, /HTTP 403/)
  data.failed = ''
  data.malformed = true
  clearCache()
  const incomplete = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(incomplete.balance, 100 + 123.5)
  assert.equal(incomplete.checks.purchases.ok, false)
})

test('non-USD, mismatched identities and duplicate marketplace purchases cannot mint points', async t => {
  const { call, data, purchase, clearCache } = await setup(t)
  for (const purchases of [
    [purchase({ FinalPrice: { value: 10, currency: 'EUR' } })],
    [purchase({ Buyer: { user_id: 999, discord_id: member, banned: false } })],
    [purchase(), purchase()],
    [purchase(), purchase({ purchase_id: 502, buyer_id: 56, Buyer: { user_id: 56, discord_id: member, banned: false } })],
    [purchase({ created_at: Math.floor(Date.now() / 1000) + 3600 })],
  ]) {
    data.purchases = purchases
    clearCache()
    const result = await (await call('/studio/points/sync', 'POST', {})).json()
    assert.equal(result.balance, 100 + 0)
    assert.equal(result.checks.purchases.ok, false)
  }
})

test('a BuiltByBit account cannot earn again after linking to a different Discord account', async t => {
  const { call, data, clearCache } = await setup(t)
  await call('/studio/points/sync', 'POST', {})
  data.purchases[0].Buyer.discord_id = stranger
  clearCache()
  const result = await (await call('/studio/points/sync', 'POST', {}, stranger)).json()
  assert.equal(result.balance, 100 + 0)
  assert.equal(result.checks.purchases.ok, false)
  assert.match(result.checks.purchases.error, /another points account/)
  clearCache()
  const original = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(original.balance, 100 + 123.5)
  assert.equal(original.checks.purchases.ok, false)
  assert.match(original.checks.purchases.error, /Discord link has changed or is missing/)
})

test('milestones award every reached threshold once and Elite independently of catalog size', async t => {
  const { call, data, clearCache } = await setup(t)
  for (const count of [3, 6, 9, 12]) {
    data.ownership = Array.from({ length: count }, (_, index) => `p${index}`)
    clearCache()
    const summary = await (await call('/studio/points/sync', 'POST', {})).json()
    assert.equal(summary.milestones.filter(item => item.awarded).length, count / 3)
  }
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 123.5 + 550)
  data.ownership = []
  clearCache()
  await call('/studio/points/sync', 'POST', {})
  data.ownership = ['p0']
  data.registry = [data.registry[0]]
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {}, stranger)).json()
  assert.equal(summary.balance, 100 + 250)
  assert.deepEqual(summary.milestones.filter(item => item.awarded).map(item => item.id), ['elite'])
})

test('referral writes roll back atomically and concurrent redemptions cannot double award', async t => {
  const { call, db, sqlite } = await setup(t)
  const owner = await (await call('/studio/points', 'GET', undefined, referrer)).json()
  await call('/studio/points/sync', 'POST', {})
  db.failBatch = true
  await assert.rejects(redeemPointReferral(db, member, owner.referralCode), /Injected/)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_referrals').get().n, 0)
  db.failBatch = false
  const results = await Promise.allSettled([redeemPointReferral(db, member, owner.referralCode), redeemPointReferral(db, member, owner.referralCode)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lumen_points_rewards WHERE kind='referral'").get().n, 1)
})

test('sync locking and rate limiting prevent concurrent verification or unrestricted writes', async t => {
  const { call, env, sqlite } = await setup(t)
  await call()
  const first = syncPointEarnings(env, member)
  await assert.rejects(syncPointEarnings(env, member), /already running/)
  await first
  assert.equal(sqlite.prepare('SELECT sync_token FROM lumen_points_accounts WHERE user_id=?').get(member).sync_token, null)
  env.ADMIN_WRITE_LIMITER = { limit: async () => ({ success: false }) }
  assert.equal((await call('/studio/points/sync', 'POST', {})).status, 429)
})

test('all marketplace pages are required before awarding later purchases', async t => {
  const { call, data, purchase } = await setup(t)
  data.purchases = Array.from({ length: 101 }, (_, index) => purchase({ purchase_id: 1000 + index }))
  const result = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(result.balance, 100 + 123.5 * 101)
  assert.equal(result.history.length, 50)
})

test('unvalidated purchases earn no spending points and complete empty purchase feeds reverse prior earnings', async t => {
  const { call, data, clearCache } = await setup(t)
  data.purchases[0].validated_at = 0
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 0)
  data.purchases[0].validated_at = Math.floor(Date.now() / 1000) - 30
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 123.5)
  data.purchases = []
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 0)
  assert.ok(summary.history.some(row => row.points === -123.5))
})

test('genuine paid purchases keep their points when a license expires, but ownership without a priced eligible product earns nothing', async t => {
  const { call, data, clearCache } = await setup(t)
  data.licenses = []
  const summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 123.5)
  data.purchases = []
  clearCache()
  const free = await (await call('/studio/points/sync', 'POST', {}, stranger)).json()
  assert.equal(free.balance, 100 + 0)
})

test('existing staff licenses earn published-price points once and retain them after expiry or a later opt-out', async t => {
  const { call, data, clearCache, sqlite, env } = await setup(t)
  data.registry = staffRegistry(); data.ownership = ['gladiator']; data.purchases = []
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.checks.staffLicenses.ok, true)
  assert.equal(summary.staffLicensePoints, 139.7)
  assert.equal(summary.balance, 100 + 139.7)
  assert.equal(summary.purchasePoints, 0)
  assert.equal(summary.eligibleReferralPoints, 0)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:adjust:%'").get().n, 1)
  const oldPrice = productMarketplace[0].priceCents
  t.after(() => { productMarketplace[0].priceCents = oldPrice })
  productMarketplace[0].priceCents = 9999
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 139.7)
  data.ownership = []
  clearCache()
  assert.equal((await (await call('/studio/points/sync', 'POST', {})).json()).balance, 100 + 139.7)
  data.ownership = ['gladiator']
  await saveLicensePointsChoice(env.COMMUNITY_DB, member, 'gladiator', false, stranger)
  clearCache()
  assert.equal((await (await call('/studio/points/sync', 'POST', {})).json()).balance, 100 + 139.7)
})

test('grant opt-outs, approved trials and shop free products cannot mint staff-license points', async t => {
  const { call, data, env, sqlite, clearCache } = await setup(t)
  data.registry = staffRegistry(); data.ownership = ['gladiator', 'lumenauction', 'lumenduels']; data.purchases = []
  await call()
  await saveLicensePointsChoice(env.COMMUNITY_DB, member, 'gladiator', false, stranger)
  const now = new Date().toISOString()
  sqlite.prepare(`INSERT INTO community_trials(id,user_id,product_id,reason,status,created_at) VALUES (?,?,?,'Trial','approved',?)`)
    .run(crypto.randomUUID(), member, 'lumenauction', now)
  sqlite.prepare(`INSERT INTO lumen_points_orders(id,user_id,product_id,product_name,cost_units,state,details,created_at,updated_at)
    VALUES (?,?,'free_product','Free plugin',150000,'fulfilled',?,?,?)`)
    .run(crypto.randomUUID(), member, JSON.stringify({ productId: 'lumenduels' }), now, now)
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.staffLicensePoints, 0)
  assert.equal(summary.checks.staffLicenses.ok, true)
  await saveLicensePointsChoice(env.COMMUNITY_DB, member, 'gladiator', true, stranger)
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.staffLicensePoints, 139.7)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_staff_rewards').get().n, 1)
})

test('paid plugins are never topped up as gifts and later purchases reconcile existing gifts without double credit', async t => {
  const { call, data, purchase, clearCache, sqlite } = await setup(t)
  data.registry = staffRegistry(); data.ownership = ['gladiator']
  data.purchases = [purchase({ content_id: 132519 })]
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 123.5)
  assert.equal(summary.staffLicensePoints, 0)
  data.purchases = []; data.ownership = ['lumenauction']
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 89.9)
  data.purchases = [purchase({ purchase_id: 502, content_id: 132967, FinalPrice: { value: '5.00', currency: 'USD' } })]
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.purchasePoints, 50)
  assert.equal(summary.staffLicensePoints, 39.9)
  assert.equal(summary.balance, 100 + 89.9)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_purchases').get().n, 2)
  assert.ok(summary.history.some(row => row.points === -50 && row.label.includes('reconciliation')))
  data.purchases[0].FinalPrice.value = '20.00'
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 200)
  assert.equal(summary.staffLicensePoints, 0)
})

test('failed purchase verification cannot award gifts, while unpriced products defer without blocking priced licenses', async t => {
  const { call, data, clearCache, sqlite } = await setup(t)
  data.registry = staffRegistry(); data.ownership = ['gladiator']; data.purchases = []
  data.failed = 'purchases'; clearCache()
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 0)
  assert.equal(summary.checks.staffLicenses.ok, false)
  assert.match(summary.checks.staffLicenses.error, /purchase verification/)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_staff_rewards').get().n, 0)
  data.failed = ''; data.registry.push({ productId: 'unpriced', name: 'Unpriced plugin', active: true, plugins: ['unpriced'] })
  data.ownership.push('unpriced'); clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 139.7)
  assert.equal(summary.checks.staffLicenses.ok, true)
  assert.deepEqual(summary.deferredLicenseProducts, ['Unpriced plugin'])
})

test('newly identified priced products verify purchase identities before awarding staff-license points', async t => {
  const { call, data, purchase, sqlite, clearCache } = await setup(t)
  data.registry = staffRegistry(); data.ownership = ['lumenbounty', 'lumencosmetics']
  data.purchases = [purchase({ content_id: 132973, FinalPrice: { value: '8.97', currency: 'USD' } })]
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.purchasePoints, 89.7)
  assert.equal(summary.staffLicensePoints, 59.9)
  assert.equal(summary.balance, 100 + 149.6)
  assert.equal(sqlite.prepare("SELECT resource_id FROM lumen_points_resource_catalog WHERE product_id='lumencosmetics'").get().resource_id, '199999')
  data.purchases.push(purchase({ purchase_id: 502, content_id: 199999, FinalPrice: { value: '4.00', currency: 'USD' } }))
  clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.purchasePoints, 129.7)
  assert.equal(summary.staffLicensePoints, 19.9)
  assert.equal(summary.balance, 100 + 149.6)
})

test('unavailable or ambiguous marketplace resource identities cannot mint gift points', async t => {
  const { call, data, clearCache, sqlite } = await setup(t)
  data.registry = staffRegistry(); data.ownership = ['lumencosmetics']; data.purchases = []
  data.failed = 'resources'
  let summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 0)
  assert.equal(summary.checks.purchases.ok, false)
  data.failed = ''; data.resourceCatalog.push({ resource_id: 199998, title: 'LumenCosmetics - Another listing' }); clearCache()
  summary = await (await call('/studio/points/sync', 'POST', {})).json()
  assert.equal(summary.balance, 100 + 0)
  assert.match(summary.checks.purchases.error, /could not be uniquely verified/)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_resource_catalog').get().n, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_staff_rewards').get().n, 0)
})

test('Support level 2 can manage wallets without license-grant power; lower levels, juniors, self-edits and revoked permissions cannot', async t => {
  const { call, env, sqlite } = await setup(t)
  await call()
  await rememberMember({ id: stranger, username: 'helper' }, env)
  sqlite.prepare("UPDATE website_members SET role_id='support_team' WHERE discord_id=?").run(stranger)
  const path = `/studio/staff/points/${member}`
  assert.equal((await call(path, 'GET', undefined, stranger)).status, 403)
  sqlite.prepare(`INSERT INTO staff_xp_ledger VALUES (?,?,100,'ticket_close','test-level',?)`).run(crypto.randomUUID(), stranger, new Date().toISOString())
  assert.equal((await call(path, 'GET', undefined, stranger)).status, 200)
  const adjustment = { requestId: crypto.randomUUID(), action: 'give', points: '10.25', reason: 'Helpful community contribution' }
  assert.equal((await call(path, 'POST', adjustment, stranger)).status, 200)
  assert.equal((await call(`/studio/staff/points/${stranger}`, 'POST', { ...adjustment, requestId: crypto.randomUUID() }, stranger)).status, 403)
  sqlite.prepare("UPDATE website_members SET role_id='jr_support' WHERE discord_id=?").run(stranger)
  assert.equal((await call(path, 'GET', undefined, stranger)).status, 403)
  sqlite.prepare("UPDATE website_members SET role_id='support_team' WHERE discord_id=?").run(stranger)
  sqlite.prepare("INSERT INTO website_role_permissions(role_id,permissions,policy_version) VALUES ('support_team',?,2)")
    .run(JSON.stringify(['dashboard.view', 'customers.view']))
  assert.equal((await call(path, 'GET', undefined, stranger)).status, 403)
  assert.equal((await call(path, 'GET', undefined, member)).status, 403)
  assert.equal((await call(path, 'GET', undefined, '')).status, 401)
})

test('manual adjustments are idempotent, audited, privately notified, atomically funded and fully paginated', async t => {
  const { call, sqlite } = await setup(t)
  const owner = '1400375985211441242', path = `/studio/staff/points/${member}`
  await call()
  const give = { requestId: crypto.randomUUID(), action: 'give', points: '10.25', reason: 'Community contribution' }
  const initial = await Promise.all([call(path, 'POST', give, owner), call(path, 'POST', give, owner)])
  assert.ok(initial.every(result => result.status === 200))
  assert.equal((await (await call(path, 'POST', give, owner)).json()).balance, 100 + 10.25)
  assert.equal((await call(path, 'POST', { ...give, points: '99' }, owner)).status, 409)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM website_access_audit WHERE action='points.adjust'").get().n, 1)
  const takes = await Promise.all([1, 2].map(() => call(path, 'POST', { ...give, requestId: crypto.randomUUID(), action: 'take', points: '107' }, owner)))
  assert.equal(takes.filter(result => result.status === 200).length, 1)
  assert.equal(takes.filter(result => result.status === 409).length, 1)
  assert.equal((await (await call()).json()).balance, 3.25)
  for (let index = 0; index < 26; index++) assert.equal((await call(path, 'POST', { ...give, requestId: crypto.randomUUID(), points: '0.01' }, owner)).status, 200)
  const first = await (await call(path, 'GET', undefined, owner)).json()
  const second = await (await call(path + '?page=2', 'GET', undefined, owner)).json()
  assert.equal(first.total, 29); assert.equal(first.items.length, 25); assert.equal(second.items.length, 4)
  assert.equal(new Set([...first.items, ...second.items].map(row => row.id)).size, 29)
  assert.equal(first.balance, 3.51)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:adjust:%' AND recipient_id=?").get(member).n, 28)
  for (const points of ['0', '-1', '1e3', '0.001', '1000001']) {
    assert.equal((await call(path, 'POST', { ...give, requestId: crypto.randomUUID(), points }, owner)).status, 400)
  }
  assert.equal((await call(path + '?page=0', 'POST', { ...give, requestId: crypto.randomUUID() }, owner)).status, 400)
  assert.equal((await (await call(path, 'GET', undefined, owner)).json()).total, 29)
})

test('a failed adjustment audit rolls back both points and its notification', async t => {
  const { call, db, sqlite } = await setup(t)
  await call(); db.failBatch = true
  const body = { requestId: crypto.randomUUID(), action: 'give', points: '10', reason: 'Community contribution' }
  assert.equal((await call(`/studio/staff/points/${member}`, 'POST', body, '1400375985211441242')).status, 503)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lumen_points_adjustments').get().n, 0)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:adjust:%'").get().n, 0)
  assert.equal((await (await call()).json()).balance, 100 + 0)
})

test('previous positive earnings receive one retroactive notice and future awards notify atomically', async t => {
  const { call, sqlite } = await setup(t)
  await call()
  sqlite.exec('DROP TRIGGER lumen_points_credit_notice; DROP TRIGGER lumen_points_adjustment_notice; DROP TRIGGER lumen_points_refund_notice;')
  const now = new Date().toISOString()
  sqlite.prepare("INSERT INTO lumen_points_rewards VALUES (?,?,'tier',10000,'Old reward',?,?)").run('old', member, now, now)
  sqlite.prepare("UPDATE lumen_points_rewards SET points_units=0 WHERE reward_key='old'").run()
  sqlite.prepare("INSERT INTO lumen_points_rewards VALUES (?,?,'tier',5000,'Another reward',?,?)").run('other', member, now, now)
  const migration = await readFile(new URL('../worker/migrations/community/0031_points_notifications.sql', import.meta.url), 'utf8')
  sqlite.exec(migration)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:earn:%'").get().n, 2)
  assert.ok(sqlite.prepare("SELECT body FROM community_notifications WHERE id LIKE 'points:earn:%'").all().every(row => row.body.includes('not a second award')))
  sqlite.exec('DROP TRIGGER lumen_points_credit_notice; DROP TRIGGER lumen_points_adjustment_notice; DROP TRIGGER lumen_points_refund_notice;')
  sqlite.exec(migration)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:earn:%'").get().n, 2)
  sqlite.prepare("INSERT INTO lumen_points_rewards VALUES (?,?,'tier',2500,'New reward',?,?)").run('new', member, now, now)
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:earn:%'").get().n, 3)
  assert.equal((await (await call()).json()).balance, 100 + 75)
})

test('the public roundup is broadcast once without publishing private credit notices', async t => {
  const { call, sqlite } = await setup(t)
  await call('/studio/points/sync', 'POST', {})
  for (const file of ['2026-11-17.sql', '2026-11-17-88-hours.sql']) {
    const publication = await readFile(new URL(`../worker/public-updates/${file}`, import.meta.url), 'utf8')
    sqlite.exec(publication); sqlite.exec(publication)
  }
  const publicRows = sqlite.prepare("SELECT * FROM community_notifications WHERE audience='all' AND kind='update'").all()
  assert.equal(publicRows.length, 2)
  for (const row of publicRows) {
    assert.equal(row.recipient_id, null)
    assert.equal(row.link, '/updates')
    assert.doesNotMatch(row.body, /token|migration|secret|backend|commit|workflow|webhook|123456789012345678/i)
  }
  assert.ok(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE id LIKE 'points:%' AND audience='user' AND recipient_id=?").get(member).n > 0)
})

test('staff wallet UI restores pending adjustment IDs after reload and ignores stale account responses', async t => {
  const { parse, compileScript } = await import('@vue/compiler-sfc')
  const { transformWithEsbuild } = await import('vite')
  const names = ['walletUiSession', 'walletUiRequest', 'sessionStorage']
  const previous = new Map(names.map(name => [name, globalThis[name]]))
  t.after(() => { for (const [name, value] of previous) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value } })
  const saved = new Map()
  globalThis.sessionStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) }
  globalThis.walletUiSession = 'first-staff'
  const summary = { actorId: '1400375985211441242', balance: 500, items: [], total: 0, page: 1, pageSize: 25 }
  const requests = []
  let fail = true
  globalThis.walletUiRequest = async (path, options) => {
    if (options?.method === 'POST') {
      requests.push(JSON.parse(options.body))
      if (fail) { fail = false; throw Error('Connection interrupted') }
      return { ...summary, balance: 510 }
    }
    return summary
  }
  const source = (await readFile(new URL('../docs/.vitepress/theme/StaffMemberPoints.vue', import.meta.url), 'utf8'))
    .replace("import { onMounted, onUnmounted, ref } from 'vue'", "import { ref } from 'vue'\nconst onMounted=()=>{};const onUnmounted=()=>{}")
    .replace("import { getDiscordSession } from './discord-session'", 'const getDiscordSession=()=>globalThis.walletUiSession')
    .replace("import { studioRequest } from './studio-api'", 'const studioRequest=(...args)=>globalThis.walletUiRequest(...args)')
    .replace("import { useSiteDialog } from './site-dialog'", 'const useSiteDialog=()=>({confirm:async()=>true})')
  const compiled = compileScript(parse(source).descriptor, { id: 'staff-member-points-ui' }).content
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  const { code } = await transformWithEsbuild(compiled, 'StaffMemberPoints.ts', { loader: 'ts' })
  const component = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default
  const first = component.setup({ userId: member, disabled: false }, { expose() {} })
  await first.load(); first.points.value = '10'; first.reason.value = 'Community contribution'
  await first.adjust()
  assert.equal(saved.size, 1)
  assert.match(first.error.value, /Connection interrupted/)
  const restored = component.setup({ userId: member, disabled: false }, { expose() {} })
  await restored.load()
  assert.equal(restored.points.value, '10')
  await restored.adjust()
  assert.equal(requests[0].requestId, requests[1].requestId)
  assert.equal(saved.size, 0)
  assert.equal(restored.wallet.value.balance, 510)
  restored.points.value = '0'; restored.reason.value = 'Community contribution'
  await restored.adjust()
  assert.equal(requests.length, 2)
  let finish
  globalThis.walletUiRequest = () => new Promise(resolve => { finish = resolve })
  const loading = restored.load()
  globalThis.walletUiSession = 'second-staff'
  finish({ ...summary, balance: 9999 })
  await loading
  assert.equal(restored.wallet.value.balance, 510)
})

test('points page sends only referral codes and ignores stale cross-account responses', async t => {
  const { parse, compileScript } = await import('@vue/compiler-sfc')
  const { transformWithEsbuild } = await import('vite')
  const previousRequest = globalThis.pointsUiRequest, previousSession = globalThis.pointsUiSession
  t.after(() => {
    if (previousRequest === undefined) delete globalThis.pointsUiRequest
    else globalThis.pointsUiRequest = previousRequest
    if (previousSession === undefined) delete globalThis.pointsUiSession
    else globalThis.pointsUiSession = previousSession
  })
  const calls = []
  const summary = { balance: 123.5, checks: { purchases: { ok: false, error: 'Purchase access unavailable' }, loyalty: { ok: true } },
    periods: { daily: { purchasePoints: 123.5 }, weekly: { purchasePoints: 250 }, monthly: { purchasePoints: 500 } } }
  globalThis.pointsUiSession = 'first-member'
  globalThis.pointsUiRequest = async (path, options = {}) => { calls.push([path, options]); return summary }
  const source = (await readFile(new URL('../docs/.vitepress/theme/LumenPoints.vue', import.meta.url), 'utf8'))
    .replace("import { computed, onMounted, onUnmounted, ref } from 'vue'", "import { computed, ref } from 'vue'\nconst onMounted=()=>{};const onUnmounted=()=>{}")
    .replace("import { getDiscordSession } from './discord-session'", 'const getDiscordSession=()=>globalThis.pointsUiSession')
    .replace("import { studioRequest } from './studio-api'", 'const studioRequest=(...args)=>globalThis.pointsUiRequest(...args)')
  const compiled = compileScript(parse(source).descriptor, { id: 'lumen-points-ui' }).content
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  const { code } = await transformWithEsbuild(compiled, 'LumenPoints.ts', { loader: 'ts' })
  const component = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default
  const ui = component.setup({}, { expose() {} })
  await ui.load()
  assert.deepEqual(calls.map(([path]) => path), ['/points', '/points/sync'])
  assert.equal(ui.status.value.balance, 123.5)
  assert.match(ui.checkErrors.value[0], /Purchase access unavailable/)
  ui.period.value = 'monthly'
  assert.equal(ui.activity.value.purchasePoints, 500)
  ui.referralCode.value = ' LP-ABCDEF123456 '
  await ui.update('referral')
  assert.deepEqual(JSON.parse(calls.at(-1)[1].body), { code: 'LP-ABCDEF123456' })
  assert.equal(ui.referralCode.value, '')
  let finish
  globalThis.pointsUiRequest = () => new Promise(resolve => { finish = resolve })
  const request = ui.update('sync')
  globalThis.pointsUiSession = 'another-member'
  finish({ ...summary, balance: 9999 })
  await request
  assert.equal(ui.status.value.balance, 123.5)
  globalThis.pointsUiSession = ''
  await ui.load()
  assert.equal(ui.status.value, null)
  assert.equal(ui.signedIn.value, false)
})

test('shop UI confirms spending, reuses failed request IDs and discards cross-account responses', async t => {
  const { parse, compileScript } = await import('@vue/compiler-sfc')
  const { transformWithEsbuild } = await import('vite')
  const saved = new Map()
  const globals = ['shopUiSession', 'shopUiRequest', 'sessionStorage']
  const previous = globals.map(key => globalThis[key])
  t.after(() => globals.forEach((key, index) => {
    if (previous[index] === undefined) delete globalThis[key]
    else globalThis[key] = previous[index]
  }))
  globalThis.sessionStorage = { getItem: key => saved.get(key) || null, setItem: (key, value) => saved.set(key, value), removeItem: key => saved.delete(key) }
  globalThis.shopUiSession = 'first-member'
  const product = { id: 'coupon_5', price: 100, name: '5% off', delivery: 'coupon' }
  const summary = { userId: member, balance: 500, products: [product], owned: [], orders: [], choices: [], queue: [] }
  const calls = []
  let fail = true
  globalThis.shopUiRequest = async (path, options) => {
    if (options?.method === 'POST') {
      calls.push(JSON.parse(options.body))
      if (fail) { fail = false; throw Error('Connection interrupted') }
      return { ...summary, balance: 400, orders: [{ id: calls.at(-1).requestId, state: 'fulfilled' }] }
    }
    return summary
  }
  const source = (await readFile(new URL('../docs/.vitepress/theme/PointsShop.vue', import.meta.url), 'utf8'))
    .replace("import { computed, onMounted, onUnmounted, ref } from 'vue'", "import { computed, ref } from 'vue'\nconst onMounted=()=>{};const onUnmounted=()=>{}")
    .replace("import { getDiscordSession } from './discord-session'", 'const getDiscordSession=()=>globalThis.shopUiSession')
    .replace("import { studioRequest } from './studio-api'", 'const studioRequest=(...args)=>globalThis.shopUiRequest(...args)')
    .replace("import { useSiteDialog } from './site-dialog'", 'const useSiteDialog=()=>({confirm:async()=>true})')
    .replace("import LoyaltyBadge from './LoyaltyBadge.vue'", 'const LoyaltyBadge={}')
    .replace("import ProfileEffect from './ProfileEffect.vue'", 'const ProfileEffect={}')
  const compiled = compileScript(parse(source).descriptor, { id: 'points-shop-ui' }).content
    .replaceAll("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  const { code } = await transformWithEsbuild(compiled, 'PointsShop.ts', { loader: 'ts' })
  const component = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default
  const ui = component.setup({}, { expose() {} })
  await ui.load()
  await ui.buy(product)
  assert.match(ui.error.value, /Connection interrupted/)
  assert.equal(saved.size, 1)
  await ui.buy(product)
  assert.equal(calls[0].requestId, calls[1].requestId)
  assert.deepEqual(Object.keys(calls[0]).sort(), ['productId', 'requestId'])
  assert.equal(ui.shop.value.balance, 400)
  assert.equal(saved.size, 0)
  let finish
  globalThis.shopUiRequest = () => new Promise(resolve => { finish = resolve })
  const request = ui.load()
  globalThis.shopUiSession = 'second-member'
  finish({ ...summary, balance: 9999 })
  await request
  assert.equal(ui.shop.value, null)
  globalThis.shopUiSession = ''
  await ui.load()
  assert.equal(ui.signedIn.value, false)
})
