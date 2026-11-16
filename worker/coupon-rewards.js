import { loyaltyStatus } from './loyalty.js'

const discordId = /^\d{5,22}$/
const marketplaceId = value => {
  const id = String(value ?? '')
  return /^[1-9]\d{0,14}$/.test(id) && Number.isSafeInteger(Number(id)) ? id : null
}

function config(env) {
  if (!env.BUILDBYBIT_API_AUTHORIZATION) throw new Error('BuiltByBit creator authorization is not configured')
  const ids = (env.BUILDBYBIT_RESOURCE_IDS || '').split(',').map(id => id.trim())
  if (!ids.length || ids.length > 50 || ids.some(id => !marketplaceId(id))) throw new Error('Invalid BuiltByBit resource configuration')
  return [...new Set(ids)]
}

async function marketplace(env, path, options = {}) {
  const response = await fetch(`https://api.builtbybit.com/v2/resources/creator/${path}`, {
    ...options,
    headers: { Authorization: env.BUILDBYBIT_API_AUTHORIZATION, Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    signal: AbortSignal.timeout(10000),
  })
  const raw = await response.text()
  if (raw.length > 2000000) throw new Error('BuiltByBit response is too large')
  let data
  try { data = JSON.parse(raw) } catch { throw new Error('BuiltByBit returned invalid JSON') }
  return { status: response.status, ok: response.ok, data }
}

function suffix() {
  return Array.from(crypto.getRandomValues(new Uint8Array(7)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
}

async function verifyScope(env, couponId, resources) {
  const found = new Set()
  let total, seen = 0
  for (let page = 1; page <= 25; page++) {
    const query = new URLSearchParams({ coupon_ids: String(couponId), page: String(page), per_page: '100' })
    const result = await marketplace(env, `coupons/entries?${query}`)
    const entries = result.data?.data?.['coupon-entries'], stats = result.data?.data?.stats
    if (!result.ok || result.data?.result !== 'success' || !Array.isArray(entries) ||
        !Number.isSafeInteger(stats?.total) || stats.total < 0 || stats.page !== page ||
        !Number.isSafeInteger(stats.per_page) || stats.per_page < 1 || stats.per_page > 100 ||
        !(stats.max_page === Math.ceil(stats.total / stats.per_page) || (stats.total === 0 && stats.max_page === 1)) ||
        entries.length > stats.per_page || (total !== undefined && total !== stats.total)) throw new Error('Coupon scope could not be verified')
    total = stats.total; seen += entries.length
    for (const entry of entries) {
      const id = marketplaceId(entry?.content_id)
      if (marketplaceId(entry?.coupon_id) !== String(couponId) || entry?.content_type !== 'resource' ||
          !id || !resources.includes(id) || found.has(id)) throw new Error('Unexpected coupon scope')
      found.add(id)
    }
    if (page >= stats.max_page) {
      if (seen !== total || found.size !== resources.length) throw new Error('Incomplete coupon scope')
      return
    }
    if (entries.length !== stats.per_page) throw new Error('Incomplete coupon scope')
  }
  throw new Error('Coupon scope exceeds scan limit')
}

async function issue(env, resources, reward) {
  const now = new Date().toISOString()
  let label = suffix()
  const reserved = await env.COMMUNITY_DB.prepare(
    `INSERT OR IGNORE INTO coupon_rewards(reward_key,user_id,kind,discount,state,label_suffix,created_at,updated_at)
     VALUES (?,?,?,?,'issuing',?,?,?)`,
  ).bind(reward.key, reward.userId, reward.kind, reward.discount, label, now, now).run()
  if (!reserved.meta.changes) {
    const retried = await env.COMMUNITY_DB.prepare(
      `UPDATE coupon_rewards SET state='issuing',retry_at=NULL,updated_at=?
       WHERE reward_key=? AND user_id=? AND kind=? AND discount=? AND state='failed' AND retry_at IS NOT NULL AND retry_at<=?`,
    ).bind(now, reward.key, reward.userId, reward.kind, reward.discount, now).run()
    if (!retried.meta.changes) return
    const row = await env.COMMUNITY_DB.prepare('SELECT label_suffix FROM coupon_rewards WHERE reward_key=?').bind(reward.key).first()
    if (!row?.label_suffix) throw new Error('Coupon reservation is missing')
    label = row.label_suffix
  }
  let state = 'uncertain', code = null, couponId = null, retryAt = null
  try {
    const body = { type: 'percent', discount: reward.discount, label, resources: resources.join(','),
      do_expiry: false, limited_uses: reward.kind === 'review', ...(reward.kind === 'review' ? { max_uses: 1 } : {}) }
    const result = await marketplace(env, 'coupons', { method: 'POST', body: JSON.stringify(body) })
    if (!result.ok && [401, 403, 429].includes(result.status)) {
      state = 'failed'; retryAt = new Date(Date.now() + 3600000).toISOString()
    } else if (!result.ok && [400, 422].includes(result.status)) state = 'failed'
    else if (result.ok && result.data?.result === 'success') {
      const coupon = result.data?.data?.coupon
      const expectedDiscount = coupon?.discount === reward.discount / 100
      if (marketplaceId(coupon?.coupon_id) && typeof coupon.label === 'string' &&
          new RegExp(`^[1-9]\\d*-${label}$`, 'i').test(coupon.label) &&
          coupon.percent === true && expectedDiscount && coupon.active === true &&
          Array.isArray(coupon.all_content_types) && coupon.all_content_types.length === 0 &&
          (coupon.expires_at === null || coupon.expires_at === 0) &&
          (coupon.max_per_user_uses === null || coupon.max_per_user_uses === 0) &&
          (reward.kind === 'review' ? coupon.max_uses === 1 : coupon.max_uses === null || coupon.max_uses === 0)) {
        await verifyScope(env, coupon.coupon_id, resources)
        state = 'issued'; code = coupon.label; couponId = Number(coupon.coupon_id)
      }
    }
  } catch (error) {
    console.error('Coupon creation could not be confirmed:', error instanceof Error ? error.name : 'Unknown error')
  }
  const statements = [env.COMMUNITY_DB.prepare(
    'UPDATE coupon_rewards SET state=?,code=?,coupon_id=?,retry_at=?,updated_at=? WHERE reward_key=? AND state=?',
  ).bind(state, code, couponId, retryAt, new Date().toISOString(), reward.key, 'issuing')]
  if (state === 'issued') statements.push(env.COMMUNITY_DB.prepare(
    `INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
     VALUES (?,?,'Your coupon is ready',?,'license','user','/account/coupons',?)`,
  ).bind(crypto.randomUUID(), reward.userId, `Your ${reward.kind === 'review' ? 'review' : 'loyalty'} coupon is ready in your account.`, new Date().toISOString()))
  await env.COMMUNITY_DB.batch(statements)
}

async function reviews(env, resources) {
  let total, seen = 0
  const matched = [], reviewIds = new Set()
  for (let page = 1; page <= 25; page++) {
    const query = new URLSearchParams({ resource_ids: resources.join(','), with: 'Reviewer', page: String(page), per_page: '100' })
    const response = await marketplace(env, `reviews?${query}`)
    const rows = response.data?.data?.reviews, stats = response.data?.data?.stats
    if (!response.ok || response.data?.result !== 'success' || !Array.isArray(rows) ||
        !Number.isSafeInteger(stats?.total) || stats.total < 0 || stats.page !== page ||
        !Number.isSafeInteger(stats.per_page) || stats.per_page < 1 || stats.per_page > 100 ||
        !(stats.max_page === Math.ceil(stats.total / stats.per_page) || (stats.total === 0 && stats.max_page === 1)) ||
        rows.length > stats.per_page || (total !== undefined && total !== stats.total)) throw new Error('Incomplete BuiltByBit reviews')
    total = stats.total; seen += rows.length
    for (const row of rows) {
      const id = marketplaceId(row?.review_id), resource = marketplaceId(row?.resource_id)
      const reviewer = marketplaceId(row?.reviewer_id)
      if (!id || !resource || !reviewer || !resources.includes(resource) || reviewIds.has(id)) throw new Error('Invalid BuiltByBit review')
      reviewIds.add(id)
      if (marketplaceId(row.Reviewer?.user_id) !== reviewer || typeof row.Reviewer?.banned !== 'boolean') throw new Error('Review author details are unavailable')
      if (row.Reviewer.banned || typeof row.Reviewer.discord_id !== 'string' || !discordId.test(row.Reviewer.discord_id)) continue
      matched.push({ id, userId: row.Reviewer.discord_id })
    }
    if (page >= stats.max_page) {
      if (seen !== total) throw new Error('Incomplete BuiltByBit reviews')
      return matched
    }
    if (rows.length !== stats.per_page) throw new Error('Incomplete BuiltByBit reviews')
  }
  throw new Error('BuiltByBit review scan limit exceeded')
}

export async function runCouponChecks(env) {
  if (!env.COMMUNITY_DB) throw new Error('Coupon storage is not configured')
  const resources = config(env)
  let reviewError
  try {
    const list = await reviews(env, resources)
    const userIds = [...new Set(list.map(review => review.userId))]
    const keys = list.map(review => `review:${review.id}`)
    const members = userIds.length ? (await env.COMMUNITY_DB.prepare(
      'SELECT discord_id FROM website_members WHERE registered_at IS NOT NULL AND discord_id IN (SELECT value FROM json_each(?))',
    ).bind(JSON.stringify(userIds)).all()).results || [] : []
    const prior = keys.length ? (await env.COMMUNITY_DB.prepare(
      'SELECT reward_key,state,retry_at FROM coupon_rewards WHERE reward_key IN (SELECT value FROM json_each(?))',
    ).bind(JSON.stringify(keys)).all()).results || [] : []
    const eligible = new Set(members.map(member => member.discord_id))
    const existing = new Map(prior.map(row => [row.reward_key, row]))
    let issued = 0
    for (const review of list) {
      if (issued >= 5) break
      if (!eligible.has(review.userId)) continue
      const exists = existing.get(`review:${review.id}`)
      if (exists && !(exists.state === 'failed' && exists.retry_at && exists.retry_at <= new Date().toISOString())) continue
      await issue(env, resources, { key: `review:${review.id}`, userId: review.userId, kind: 'review', discount: 10 })
      issued++
    }
  } catch (error) {
    reviewError = error
    console.error('Coupon review checks failed:', error instanceof Error ? error.message : 'Unknown error')
  }
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO coupon_scan_state(name,status,checked_at) VALUES ('reviews',?,?)
     ON CONFLICT(name) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at`,
  ).bind(reviewError ? 'error' : 'ok', new Date().toISOString()).run()
  const cursor = await env.COMMUNITY_DB.prepare("SELECT cursor FROM coupon_scan_state WHERE name='loyalty'").first()
  const members = (await env.COMMUNITY_DB.prepare(
    'SELECT discord_id FROM website_members WHERE registered_at IS NOT NULL AND discord_id > ? ORDER BY discord_id LIMIT 2',
  ).bind(cursor?.cursor || '').all()).results || []
  let loyaltyError = false
  for (const member of members) {
    try {
      const status = await loyaltyStatus(env, member.discord_id)
      if (status.tier?.discount) await issue(env, resources, {
        key: `loyalty:${member.discord_id}:${status.tier.id}`, userId: member.discord_id, kind: 'loyalty', discount: status.tier.discount,
      })
    } catch (error) { loyaltyError = true; console.error('Loyalty coupon check failed:', error instanceof Error ? error.message : 'Unknown error') }
    await env.COMMUNITY_DB.prepare(
      "INSERT INTO coupon_scan_state(name,cursor) VALUES ('loyalty',?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor",
    ).bind(member.discord_id).run()
  }
  if (members.length < 2) await env.COMMUNITY_DB.prepare(
    "INSERT INTO coupon_scan_state(name,cursor) VALUES ('loyalty','') ON CONFLICT(name) DO UPDATE SET cursor=''",
  ).run()
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO coupon_scan_state(name,status,checked_at) VALUES ('loyalty',?,?)
     ON CONFLICT(name) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at`,
  ).bind(loyaltyError ? 'error' : 'ok', new Date().toISOString()).run()
  if (reviewError) throw reviewError
}

export async function handleCoupons(request, env, origin, deps) {
  const send = (body, status = 200) => deps.respond(body, status, origin)
  if (request.method !== 'GET') return send({ error: 'Method not allowed.' }, 405)
  const auth = request.headers.get('Authorization') || ''
  const user = await deps.verifyLoginToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', env)
  if (!user || !discordId.test(user.id)) return send({ error: 'Sign in with Discord to view coupons.' }, 401)
  if (!env.COMMUNITY_DB || !env.ADMIN_READ_LIMITER) return send({ error: 'Coupons are temporarily unavailable.' }, 503)
  if (!(await env.ADMIN_READ_LIMITER.limit({ key: `coupons:${user.id}` })).success) return send({ error: 'Please wait before trying again.' }, 429)
  try {
    let configured = true
    try { config(env) } catch { configured = false }
    const rawPage = new URL(request.url).searchParams.get('page') || '1'
    if (!/^[1-9]\d{0,3}$/.test(rawPage)) return send({ error: 'Invalid coupon page.' }, 400)
    const page = Number(rawPage), pageSize = 20
    const total = await env.COMMUNITY_DB.prepare('SELECT COUNT(*) AS n FROM coupon_rewards WHERE user_id=?').bind(user.id).first()
    const rows = (await env.COMMUNITY_DB.prepare(
      'SELECT reward_key,kind,discount,state,code,retry_at,created_at FROM coupon_rewards WHERE user_id=? ORDER BY created_at DESC,reward_key DESC LIMIT ? OFFSET ?',
    ).bind(user.id, pageSize, (page - 1) * pageSize).all()).results || []
    const checks = (await env.COMMUNITY_DB.prepare(
      "SELECT name,status,checked_at FROM coupon_scan_state WHERE name IN ('loyalty','reviews')",
    ).all()).results || []
    return send({ configured, coupons: rows.map(row => ({ id: row.reward_key, kind: row.kind, discount: row.discount, state: row.state, code: row.code, retryAt: row.retry_at, createdAt: row.created_at })), page, pageSize, total: total.n,
      checks: Object.fromEntries(checks.map(row => [row.name, { status: row.status, checkedAt: row.checked_at }])) })
  } catch (error) {
    console.error('Coupon list failed:', error instanceof Error ? error.message : 'Unknown error')
    return send({ error: 'Coupons could not be loaded. Please try again later.' }, 503)
  }
}
