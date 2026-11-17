import { loyaltyStatus } from './loyalty.js'
import { hasPermission, resolveAccess } from './access-control.js'
import { staffProgress } from './staff-progression.js'

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

function requireRead(result, name) {
  if (!result.ok || result.data?.result !== 'success') {
    const code = [401, 403].includes(result.status) ? 'BBB_ACCESS'
      : result.status === 429 ? 'BBB_RATE_LIMIT' : 'BBB_RESPONSE'
    throw new Error(`${code}: ${name} HTTP ${result.status}`)
  }
}

function errorCode(error) {
  const message = error instanceof Error ? error.message : ''
  return ['BBB_ACCESS', 'BBB_RATE_LIMIT', 'BBB_RESPONSE'].find(code => message.startsWith(code + ':')) ||
    (message.includes('author details') ? 'BBB_REVIEWER' : 'CHECK_FAILED')
}

async function saveCheck(env, name, error) {
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO coupon_scan_state(name,status,error_code,checked_at) VALUES (?,?,?,?)
     ON CONFLICT(name) DO UPDATE SET status=excluded.status,error_code=excluded.error_code,checked_at=excluded.checked_at`,
  ).bind(name, error ? 'error' : 'ok', error ? errorCode(error) : null, new Date().toISOString()).run()
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
    requireRead(result, 'coupon scope')
    const entries = result.data?.data?.['coupon-entries'], stats = result.data?.data?.stats
    if (!result.ok || result.data?.result !== 'success' || !Array.isArray(entries) ||
        !Number.isSafeInteger(stats?.total) || stats.total < 0 || stats.page !== page ||
        !Number.isSafeInteger(stats.per_page) || stats.per_page < 1 || stats.per_page > 100 ||
        !(stats.max_page === Math.ceil(stats.total / stats.per_page) || (stats.total === 0 && stats.max_page === 1)) ||
        entries.length > stats.per_page || (total !== undefined && total !== stats.total)) {
      throw new Error(`Coupon scope format mismatch: entries ${Array.isArray(entries) ? 'array' : typeof entries}, stats ${typeof stats}`)
    }
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

function confirmedCoupon(coupon, reward, label) {
  return marketplaceId(coupon?.coupon_id) && typeof coupon.label === 'string' &&
    new RegExp(`^[1-9]\\d*-${label}$`, 'i').test(coupon.label) &&
    coupon.percent === true && coupon.discount === reward.discount / 100 && coupon.active === true &&
    Array.isArray(coupon.all_content_types) && coupon.all_content_types.length === 0 &&
    (coupon.expires_at === null || coupon.expires_at === 0) &&
    (coupon.max_per_user_uses === null || coupon.max_per_user_uses === 0) &&
    (reward.kind !== 'loyalty' ? coupon.max_uses === 1 : coupon.max_uses === null || coupon.max_uses === 0)
}

async function reconcileCoupons(env, resources) {
  const pending = (await env.COMMUNITY_DB.prepare(
    "SELECT reward_key,user_id,kind,discount,label_suffix FROM coupon_rewards WHERE state='uncertain' ORDER BY updated_at LIMIT 5",
  ).all()).results || []
  if (!pending.length) return
  const coupons = []
  let total, seen = 0, complete = false
  for (let page = 1; page <= 25; page++) {
    const result = await marketplace(env, `coupons?${new URLSearchParams({ page: String(page), per_page: '100' })}`)
    requireRead(result, 'coupon reconciliation')
    const rows = result.data?.data?.coupons, stats = result.data?.data?.stats
    if (!Array.isArray(rows) || !Number.isSafeInteger(stats?.total) || stats.total < 0 ||
        stats.page !== page || !Number.isSafeInteger(stats.per_page) || stats.per_page < 1 || stats.per_page > 100 ||
        !(stats.max_page === Math.ceil(stats.total / stats.per_page) || (stats.total === 0 && stats.max_page === 1)) ||
        rows.length > stats.per_page || (total !== undefined && total !== stats.total)) throw new Error('Incomplete coupon reconciliation')
    total = stats.total; seen += rows.length
    coupons.push(...rows)
    if (page >= stats.max_page) { complete = seen === total; break }
    if (rows.length !== stats.per_page) throw new Error('Incomplete coupon reconciliation')
  }
  if (!complete || new Set(coupons.map(coupon => marketplaceId(coupon?.coupon_id))).size !== coupons.length ||
      coupons.some(coupon => !marketplaceId(coupon?.coupon_id))) throw new Error('Incomplete coupon reconciliation')
  for (const reward of pending) {
    const matches = coupons.filter(coupon => typeof coupon.label === 'string' &&
      new RegExp(`^[1-9]\\d*-${reward.label_suffix}$`, 'i').test(coupon.label))
    if (matches.length !== 1 || !confirmedCoupon(matches[0], reward, reward.label_suffix)) continue
    const coupon = matches[0]
    await verifyScope(env, coupon.coupon_id, resources)
    const now = new Date().toISOString()
    await env.COMMUNITY_DB.batch([
      env.COMMUNITY_DB.prepare(
        "UPDATE coupon_rewards SET state='issued',code=?,coupon_id=?,updated_at=? WHERE reward_key=? AND state='uncertain'",
      ).bind(coupon.label, Number(coupon.coupon_id), now, reward.reward_key),
      env.COMMUNITY_DB.prepare(
        `INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
         SELECT ?,?,'Your coupon is ready','Your confirmed coupon is ready in your account.','license','user','/account/coupons',? WHERE changes()=1`,
      ).bind(crypto.randomUUID(), reward.user_id, now),
    ])
  }
}

async function issue(env, resources, reward) {
  const now = new Date().toISOString()
  let label = suffix()
  const reservation = env.COMMUNITY_DB.prepare(
    `INSERT OR IGNORE INTO coupon_rewards(reward_key,user_id,kind,discount,state,label_suffix,created_at,updated_at,granted_by,grant_reason)
     VALUES (?,?,?,?,'issuing',?,?,?,?,?)`,
  ).bind(reward.key, reward.userId, reward.kind, reward.discount, label, now, now, reward.actor?.id || null, reward.reason || null)
  const reserved = reward.actor ? (await env.COMMUNITY_DB.batch([reservation, env.COMMUNITY_DB.prepare(
    `INSERT INTO website_access_audit(id,actor_id,actor_role,action,target,details,created_at)
     SELECT ?,?,?,'coupon.grant',?,?,? WHERE changes()=1`,
  ).bind(crypto.randomUUID(), reward.actor.id, reward.actor.role, reward.userId,
    JSON.stringify({ rewardKey: reward.key, discount: reward.discount, reason: reward.reason, state: 'requested' }), now)]))[0]
    : await reservation.run()
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
    const singleUse = reward.kind !== 'loyalty'
    const body = { type: 'percent', discount: reward.discount, label, resources: resources.join(','),
      do_expiry: false, limited_user_uses: false, all_content_types: [],
      limited_uses: singleUse, ...(singleUse ? { max_uses: 1 } : {}) }
    const result = await marketplace(env, 'coupons', { method: 'POST', body: JSON.stringify(body) })
    if (!result.ok && [401, 403, 429].includes(result.status)) {
      state = 'failed'; retryAt = reward.actor ? null : new Date(Date.now() + 3600000).toISOString()
    } else if (!result.ok && [400, 422].includes(result.status)) state = 'failed'
    else if (result.ok && result.data?.result === 'success') {
      const coupon = result.data?.data?.coupon
      if (confirmedCoupon(coupon, reward, label)) {
        await verifyScope(env, coupon.coupon_id, resources)
        state = 'issued'; code = coupon.label; couponId = Number(coupon.coupon_id)
      }
    }
  } catch (error) {
    console.error('Coupon creation could not be confirmed:', error instanceof Error ? error.message : 'Unknown error')
  }
  const statements = [env.COMMUNITY_DB.prepare(
    'UPDATE coupon_rewards SET state=?,code=?,coupon_id=?,retry_at=?,updated_at=? WHERE reward_key=? AND state=?',
  ).bind(state, code, couponId, retryAt, new Date().toISOString(), reward.key, 'issuing')]
  if (state === 'issued') statements.push(env.COMMUNITY_DB.prepare(
    `INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
     VALUES (?,?,'Your coupon is ready',?,'license','user','/account/coupons',?)`,
  ).bind(crypto.randomUUID(), reward.userId, `Your ${reward.kind === 'manual' ? 'staff-granted' : reward.kind} coupon is ready in your account.`, new Date().toISOString()))
  if (reward.actor) statements.push(env.COMMUNITY_DB.prepare(
    `INSERT INTO website_access_audit(id,actor_id,actor_role,action,target,details,created_at)
     VALUES (?,?,?,'coupon.grant.result',?,?,?)`,
  ).bind(crypto.randomUUID(), reward.actor.id, reward.actor.role, reward.userId,
    JSON.stringify({ rewardKey: reward.key, discount: reward.discount, state }), new Date().toISOString()))
  await env.COMMUNITY_DB.batch(statements)
}

async function reviews(env, resources) {
  let total, seen = 0
  let buyers
  const matched = [], reviewIds = new Set()
  for (let page = 1; page <= 25; page++) {
    const query = new URLSearchParams({ resource_ids: resources.join(','), with: 'Reviewer', page: String(page), per_page: '100' })
    const response = await marketplace(env, `reviews?${query}`)
    requireRead(response, 'reviews')
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
      let author = row.Reviewer
      if (!author || !marketplaceId(author.user_id)) {
        buyers ||= await verifiedBuyers(env, resources)
        author = buyers.get(reviewer)
        if (!author) continue
      }
      if (marketplaceId(author.user_id) !== reviewer) throw new Error('Review author details do not match')
      if (author.banned === true || typeof author.discord_id !== 'string' || !discordId.test(author.discord_id)) continue
      matched.push({ id, userId: author.discord_id })
    }
    if (page >= stats.max_page) {
      if (seen !== total) throw new Error('Incomplete BuiltByBit reviews')
      return matched
    }
    if (rows.length !== stats.per_page) throw new Error('Incomplete BuiltByBit reviews')
  }
  throw new Error('BuiltByBit review scan limit exceeded')
}

async function verifiedBuyers(env, resources) {
  const buyers = new Map(), seenRows = new Set()
  let total, seen = 0
  for (let page = 1; page <= 25; page++) {
    const result = await marketplace(env, `licenses?${new URLSearchParams({
      resource_ids: resources.join(','), with: 'Buyer', page: String(page), per_page: '100',
    })}`)
    requireRead(result, 'review buyer verification')
    const rows = result.data?.data?.licenses, stats = result.data?.data?.stats
    if (!Array.isArray(rows) || !Number.isSafeInteger(stats?.total) || stats.total < 0 ||
        stats.page !== page || !Number.isSafeInteger(stats.per_page) || stats.per_page < 1 || stats.per_page > 100 ||
        !(stats.max_page === Math.ceil(stats.total / stats.per_page) || (stats.total === 0 && stats.max_page === 1)) ||
        rows.length > stats.per_page || (total !== undefined && total !== stats.total)) throw new Error('Incomplete review buyer verification')
    total = stats.total; seen += rows.length
    for (const row of rows) {
      if (row?.content_type !== 'resource' || !resources.includes(marketplaceId(row.content_id))) throw new Error('Invalid review buyer resource')
      const buyerId = marketplaceId(row.buyer_id)
      if (!buyerId || marketplaceId(row.Buyer?.user_id) !== buyerId) throw new Error('Review author details are unavailable')
      const rowKey = `${buyerId}:${row.content_id}`
      if (seenRows.has(rowKey)) throw new Error('Duplicate review buyer data')
      seenRows.add(rowKey)
      const existing = buyers.get(buyerId)
      if (existing && existing.discord_id !== row.Buyer.discord_id) throw new Error('Conflicting review buyer identity')
      buyers.set(buyerId, row.Buyer)
    }
    if (page >= stats.max_page) {
      if (seen !== total) throw new Error('Incomplete review buyer verification')
      return buyers
    }
    if (rows.length !== stats.per_page) throw new Error('Incomplete review buyer verification')
  }
  throw new Error('Review buyer verification exceeds scan limit')
}

export async function runCouponChecks(env) {
  if (!env.COMMUNITY_DB) throw new Error('Coupon storage is not configured')
  const resources = config(env)
  let reconciliationError
  try { await reconcileCoupons(env, resources) } catch (error) {
    reconciliationError = error
    console.error('Coupon reconciliation failed:', error instanceof Error ? error.message : 'Unknown error')
  }
  await saveCheck(env, 'reconciliation', reconciliationError)
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
  await saveCheck(env, 'reviews', reviewError)
  const cursor = await env.COMMUNITY_DB.prepare("SELECT cursor FROM coupon_scan_state WHERE name='loyalty'").first()
  const members = (await env.COMMUNITY_DB.prepare(
    'SELECT discord_id FROM website_members WHERE registered_at IS NOT NULL AND discord_id > ? ORDER BY discord_id LIMIT 2',
  ).bind(cursor?.cursor || '').all()).results || []
  let loyaltyError
  for (const member of members) {
    try {
      const status = await loyaltyStatus(env, member.discord_id)
      if (status.tier?.discount) await issue(env, resources, {
        key: `loyalty:${member.discord_id}:${status.tier.id}`, userId: member.discord_id, kind: 'loyalty', discount: status.tier.discount,
      })
    } catch (error) { loyaltyError = error; console.error('Loyalty coupon check failed:', error instanceof Error ? error.message : 'Unknown error') }
    await env.COMMUNITY_DB.prepare(
      "INSERT INTO coupon_scan_state(name,cursor) VALUES ('loyalty',?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor",
    ).bind(member.discord_id).run()
  }
  if (members.length < 2) await env.COMMUNITY_DB.prepare(
    "INSERT INTO coupon_scan_state(name,cursor) VALUES ('loyalty','') ON CONFLICT(name) DO UPDATE SET cursor=''",
  ).run()
  await saveCheck(env, 'loyalty', loyaltyError)
  let usageError
  try { await checkCouponUses(env) } catch (error) {
    usageError = error
    console.error('Coupon usage checks failed:', error instanceof Error ? error.message : 'Unknown error')
  }
  await saveCheck(env, 'usage', usageError)
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
      'SELECT reward_key,kind,discount,state,code,retry_at,created_at,uses FROM coupon_rewards WHERE user_id=? ORDER BY created_at DESC,reward_key DESC LIMIT ? OFFSET ?',
    ).bind(user.id, pageSize, (page - 1) * pageSize).all()).results || []
    const checks = (await env.COMMUNITY_DB.prepare(
      "SELECT name,status,error_code,checked_at FROM coupon_scan_state WHERE name IN ('loyalty','reviews','usage','reconciliation')",
    ).all()).results || []
    const access = await resolveAccess(user.id, env)
    const progress = hasPermission(access, 'dashboard.view') ? await staffProgress(env, user.id) : null
    return send({ configured, staffLevel: progress?.level || null,
      canGrant: access.rank >= 3 && hasPermission(access, 'coupons.grant') && hasPermission(access, 'dashboard.view') && progress.level >= 2,
      coupons: rows.map(row => ({ id: row.reward_key, kind: row.kind, discount: row.discount, state: row.state, code: row.code, retryAt: row.retry_at, createdAt: row.created_at, uses: row.uses })), page, pageSize, total: total.n,
      checks: Object.fromEntries(checks.map(row => [row.name, { status: row.status, code: row.error_code, checkedAt: row.checked_at }])) })
  } catch (error) {
    console.error('Coupon list failed:', error instanceof Error ? error.message : 'Unknown error')
    return send({ error: 'Coupons could not be loaded. Please try again later.' }, 503)
  }

}

export async function checkCouponUses(env) {
    const cursor = await env.COMMUNITY_DB.prepare("SELECT cursor FROM coupon_scan_state WHERE name='usage'").first()
    const rows = (await env.COMMUNITY_DB.prepare(
      "SELECT reward_key,coupon_id,user_id,uses FROM coupon_rewards WHERE state='issued' AND reward_key>? ORDER BY reward_key LIMIT 20",
    ).bind(cursor?.cursor || '').all()).results || []
    if (rows.length) {
      const result = await marketplace(env, `coupons?${new URLSearchParams({
        coupon_ids: rows.map(row => row.coupon_id).join(','), page: '1', per_page: '100',
      })}`)
      requireRead(result, 'coupon usage')
      const coupons = result.data?.data?.coupons
      if (!Array.isArray(coupons) || coupons.length !== rows.length ||
          new Set(coupons.map(coupon => marketplaceId(coupon?.coupon_id))).size !== rows.length) {
        throw new Error('Incomplete coupon usage response')
      }
      const updates = rows.map(row => {
        const coupon = coupons.find(item => marketplaceId(item?.coupon_id) === String(row.coupon_id))
        if (!coupon || !Number.isSafeInteger(coupon.uses) || coupon.uses < row.uses) throw new Error('Invalid coupon usage count')
        return { ...row, currentUses: coupon.uses }
      })
      for (const row of updates) {
        if (row.currentUses === row.uses) continue
        const now = new Date().toISOString()
        await env.COMMUNITY_DB.batch([
          env.COMMUNITY_DB.prepare(
            'UPDATE coupon_rewards SET uses=? WHERE reward_key=? AND uses=?',
          ).bind(row.currentUses, row.reward_key, row.uses),
          env.COMMUNITY_DB.prepare(
            'INSERT INTO coupon_usage_events(reward_key,uses,observed_at) SELECT ?,?,? WHERE changes()=1',
          ).bind(row.reward_key, row.currentUses, now),
          env.COMMUNITY_DB.prepare(
            `INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
             SELECT ?,?,'Your coupon was used',?,'license','user','/account/coupons',? WHERE changes()=1`,
          ).bind(crypto.randomUUID(), row.user_id,
            `BuiltByBit reports ${row.currentUses - row.uses} new use${row.currentUses - row.uses === 1 ? '' : 's'} of your coupon (${row.currentUses} total). BuiltByBit does not provide the redeemer's username through this API.`, now),
        ])
      }
    }
    await env.COMMUNITY_DB.prepare(
      "INSERT INTO coupon_scan_state(name,cursor) VALUES ('usage',?) ON CONFLICT(name) DO UPDATE SET cursor=excluded.cursor",
    ).bind(rows.length === 20 ? rows.at(-1).reward_key : '').run()
  }

export async function handleStaffCoupons(request, env, origin, deps) {
    const send = (body, status = 200) => deps.respond(body, status, origin)
    const auth = request.headers.get('Authorization') || ''
    const user = await deps.verifyLoginToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', env)
    if (!user || !discordId.test(user.id)) return send({ error: 'Sign in with Discord.' }, 401)
    if (!env.COMMUNITY_DB || !env.ADMIN_WRITE_LIMITER) return send({ error: 'Coupon grants are unavailable.' }, 503)
    try {
      const access = await resolveAccess(user.id, env)
      if (access.rank < 3 || !hasPermission(access, 'dashboard.view') || !hasPermission(access, 'coupons.grant')) {
        return send({ error: 'Support rank or above with coupon-grant permission is required.' }, 403)
      }
      if ((await staffProgress(env, user.id)).level < 2) return send({ error: 'Reach staff level 2 (100 XP) before granting coupons.' }, 403)
      if (request.method !== 'POST') return send({ error: 'Method not allowed.' }, 405)
      if (!(await env.ADMIN_WRITE_LIMITER.limit({ key: `coupon-grant:${user.id}` })).success) return send({ error: 'Please wait before granting another coupon.' }, 429)
      const raw = await request.text()
      if (raw.length > 2000) return send({ error: 'Request is too large.' }, 413)
      let body
      try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
      if (typeof body?.userId !== 'string' || !discordId.test(body.userId) || ![5, 10, 15].includes(body.discount) ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || '') ||
          typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.trim().length > 300) {
        return send({ error: 'Provide a member Discord ID, 5/10/15% discount, reason (5-300 characters), and request ID.' }, 400)
      }
      if (body.userId === user.id) return send({ error: 'You cannot grant coupons to yourself.' }, 403)
      const member = await env.COMMUNITY_DB.prepare(
        'SELECT discord_id FROM website_members WHERE discord_id=? AND registered_at IS NOT NULL',
      ).bind(body.userId).first()
      if (!member) return send({ error: 'The recipient must have a website account.' }, 404)
      const key = `manual:${user.id}:${body.requestId}`
      const prior = await env.COMMUNITY_DB.prepare('SELECT * FROM coupon_rewards WHERE reward_key=?').bind(key).first()
      if (prior && (prior.user_id !== body.userId || prior.discount !== body.discount || prior.grant_reason !== body.reason.trim())) {
        return send({ error: 'This request ID belongs to another grant. Start a new grant.' }, 409)
      }
      const pending = await env.COMMUNITY_DB.prepare(
        "SELECT reward_key FROM coupon_rewards WHERE kind='manual' AND granted_by=? AND user_id=? AND state IN ('issuing','uncertain')",
      ).bind(user.id, body.userId).first()
      if (pending && pending.reward_key !== key) return send({ error: 'An earlier grant for this member is unconfirmed. Inspect BuiltByBit before creating another coupon.' }, 409)
      await issue(env, config(env), { key, userId: body.userId, kind: 'manual', discount: body.discount,
        actor: { id: user.id, role: access.role }, reason: body.reason.trim() })
      const reward = await env.COMMUNITY_DB.prepare('SELECT state,user_id,discount,grant_reason FROM coupon_rewards WHERE reward_key=?').bind(key).first()
      if (!reward) return send({ error: 'Another unconfirmed grant already exists. Inspect BuiltByBit before creating another coupon.' }, 409)
      if (reward.user_id !== body.userId || reward.discount !== body.discount || reward.grant_reason !== body.reason.trim()) {
        return send({ error: 'This request ID belongs to another grant. Start a new grant.' }, 409)
      }
      return send({ state: reward.state, message: reward.state === 'issued' ? 'Coupon granted. The recipient has been notified.'
        : 'The grant was recorded but issuance was not confirmed. Inspect BuiltByBit before starting another grant.' }, reward.state === 'issued' ? 200 : 202)
    } catch (error) {
      console.error('Staff coupon grant failed:', error instanceof Error ? error.name : 'Unknown error')
      return send({ error: 'Grant could not be completed. Retry without changing the form; if you leave this page, inspect BuiltByBit before starting a new grant.' }, 503)
    }
}
