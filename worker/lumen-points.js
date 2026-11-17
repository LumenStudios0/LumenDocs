import { ensurePointsAccount } from './points-account.js'
import { loyaltyStatus } from './loyalty.js'

export const pointMilestones = [
  { id: 'spark', name: 'Spark', count: 3, points: 50 },
  { id: 'radiance', name: 'Radiance', count: 6, points: 100 },
  { id: 'nova', name: 'Nova', count: 9, points: 150 },
  { id: 'elite', name: 'Lumen Elite', count: null, points: 250 },
]
const id = value => /^[1-9]\d{0,14}$/.test(String(value ?? '')) && Number.isSafeInteger(Number(value)) ? String(value) : null
const failure = (message, status = 503) => Object.assign(new Error(message), { status })

export function usdCents(price) {
  if (price?.currency !== 'USD') throw failure('Purchase points require verified USD prices. A non-USD purchase needs staff review.')
  const value = typeof price.value === 'number' ? String(price.value) : price.value
  if (typeof value !== 'string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(value)) throw failure('BuiltByBit returned an invalid paid amount. No purchase points were changed.')
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

async function marketplaceRows(env, name, resources, deadline) {
  const rows = []
  let total
  for (let page = 1; page <= 25; page++) {
    if (Date.now() >= deadline) throw failure('Purchase verification timed out. Please try again later.')
    const query = new URLSearchParams({ resource_ids: resources.join(','), with: 'Buyer', page: String(page), per_page: '100' })
    const response = await fetch(`https://api.builtbybit.com/v2/resources/creator/${name}?${query}`, {
      headers: { Authorization: env.BUILDBYBIT_API_AUTHORIZATION, Accept: 'application/json' },
      signal: AbortSignal.timeout(Math.min(10000, deadline - Date.now())),
    })
    if (!response.ok) throw failure(`BuiltByBit ${name} checks are unavailable (HTTP ${response.status}). Verify creator API access or try again later.`)
    const raw = await response.text()
    if (raw.length > 2000000) throw failure('BuiltByBit returned oversized purchase data.')
    const payload = JSON.parse(raw), stats = payload?.data?.stats, items = payload?.data?.[name]
    if (payload?.result !== 'success' || !Array.isArray(items) || !stats ||
        !Number.isSafeInteger(stats.total) || stats.total < 0 || stats.page !== page ||
        !Number.isSafeInteger(stats.per_page) || stats.per_page < 1 || stats.per_page > 100 ||
        !(stats.max_page === Math.ceil(stats.total / stats.per_page) || (stats.total === 0 && stats.max_page === 1)) ||
        items.length > stats.per_page || (total !== undefined && total !== stats.total)) throw failure('BuiltByBit returned incomplete purchase data. No purchase points were changed.')
    total = stats.total
    rows.push(...items)
    if (page >= stats.max_page) {
      if (rows.length !== total) throw failure('BuiltByBit purchase pages were incomplete. No purchase points were changed.')
      return rows
    }
    if (items.length !== stats.per_page) throw failure('BuiltByBit purchase pages were incomplete. No purchase points were changed.')
  }
  throw failure('Purchase history is too large to verify safely. Contact support.')
}

function buyer(row) {
  if (!id(row?.buyer_id) || id(row?.Buyer?.user_id) !== id(row.buyer_id) ||
      (row.Buyer.banned !== undefined && typeof row.Buyer.banned !== 'boolean')) throw failure('BuiltByBit did not return verified buyer identities. No purchase points were changed.')
  return row.Buyer
}

export async function verifiedPointPurchases(env, userId) {
  const resources = (env.BUILDBYBIT_RESOURCE_IDS || '').split(',').map(value => value.trim())
  if (!env.BUILDBYBIT_API_AUTHORIZATION || !resources.length || resources.length > 50 || resources.some(value => !id(value))) {
    throw failure('Purchase points need the BuiltByBit creator authorization and resource IDs configured.')
  }
  const deadline = Date.now() + 30000
  const account = await env.COMMUNITY_DB.prepare('SELECT buyer_id FROM lumen_points_accounts WHERE user_id=?').bind(userId).first()
  const purchases = await marketplaceRows(env, 'purchases', resources, deadline)
  const buyerIds = new Set(), seen = new Set(), verified = []
  const now = Date.now()
  for (const row of purchases) {
    if (row?.content_type !== 'resource' || !resources.includes(id(row.content_id)) ||
        !id(row.purchase_id) || seen.has(id(row.purchase_id))) throw failure('Unexpected or duplicate BuiltByBit purchase data.')
    seen.add(id(row.purchase_id))
    const member = buyer(row)
    if (account?.buyer_id === id(row.buyer_id) && member.discord_id !== userId) {
      throw failure('Your verified BuiltByBit Discord link has changed or is missing. Restore the link or contact support.', 409)
    }
    if (member.discord_id !== userId) continue
    if (member.banned) throw failure('This BuiltByBit account cannot earn points.', 403)
    buyerIds.add(id(row.buyer_id))
    if (!Number.isSafeInteger(row.created_at) || row.created_at <= 0 || row.created_at * 1000 > now ||
        !Number.isSafeInteger(row.validated_at) || row.validated_at < 0 || row.validated_at * 1000 > now ||
        !Number.isFinite(new Date(row.created_at * 1000).getTime())) throw failure('BuiltByBit returned invalid purchase timestamps.')
    const cents = usdCents(row.FinalPrice)
    verified.push({
      purchaseId: id(row.purchase_id), buyerId: id(row.buyer_id), resourceId: id(row.content_id), cents,
      units: row.validated_at > 0 ? cents * 10 : 0,
      purchasedAt: new Date(row.created_at * 1000).toISOString(),
    })
  }
  if (buyerIds.size > 1) throw failure('Multiple BuiltByBit accounts match your Discord account. Contact support before earning points.', 409)
  return { buyerId: [...buyerIds][0] || null, purchases: verified, resources }
}

async function savePurchases(env, userId, snapshot) {
  const db = env.COMMUNITY_DB
  const account = await db.prepare('SELECT buyer_id FROM lumen_points_accounts WHERE user_id=?').bind(userId).first()
  if (account.buyer_id && snapshot.buyerId && account.buyer_id !== snapshot.buyerId) throw failure('Your verified BuiltByBit account link has changed. Contact support; no purchase points were changed.', 409)
  if (snapshot.buyerId) {
    const owner = await db.prepare('SELECT user_id FROM lumen_points_accounts WHERE buyer_id=?').bind(snapshot.buyerId).first()
    if (owner && owner.user_id !== userId) throw failure('This BuiltByBit account already belongs to another points account. Contact support.', 409)
  }
  const scan = crypto.randomUUID(), now = new Date().toISOString()
  const previous = (await db.prepare('SELECT purchase_id,buyer_id,resource_id,purchased_at FROM lumen_points_purchases WHERE user_id=?').bind(userId).all()).results || []
  for (const purchase of snapshot.purchases) {
    const saved = previous.find(row => row.purchase_id === purchase.purchaseId)
    if (saved && (saved.buyer_id !== purchase.buyerId || saved.resource_id !== purchase.resourceId || saved.purchased_at !== purchase.purchasedAt)) {
      throw failure('A verified purchase identity has changed. Contact support; no purchase points were changed.', 409)
    }
  }
  const statements = []
  if (snapshot.buyerId) statements.push(db.prepare('UPDATE lumen_points_accounts SET buyer_id=? WHERE user_id=? AND (buyer_id IS NULL OR buyer_id=?)')
    .bind(snapshot.buyerId, userId, snapshot.buyerId))
  for (const purchase of snapshot.purchases) {
    statements.push(db.prepare(`INSERT INTO lumen_points_purchases(purchase_id,user_id,buyer_id,resource_id,paid_cents,points_units,purchased_at,scan_id)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(purchase_id) DO UPDATE SET paid_cents=excluded.paid_cents,points_units=excluded.points_units,scan_id=excluded.scan_id
      WHERE lumen_points_purchases.user_id=excluded.user_id AND lumen_points_purchases.buyer_id=excluded.buyer_id
        AND lumen_points_purchases.resource_id=excluded.resource_id AND lumen_points_purchases.purchased_at=excluded.purchased_at`)
      .bind(purchase.purchaseId, userId, purchase.buyerId, purchase.resourceId, purchase.cents, purchase.units, purchase.purchasedAt, scan))
  }
  // Only a fully validated snapshot may reconcile missing or invalidated purchases.
  statements.push(db.prepare(`UPDATE lumen_points_purchases SET points_units=0 WHERE user_id=? AND scan_id!=?
    AND resource_id IN (${snapshot.resources.map(() => '?').join(',')})`).bind(userId, scan, ...snapshot.resources))
  statements.push(db.prepare(`INSERT INTO lumen_points_rewards(reward_key,user_id,kind,points_units,label,earned_at,updated_at)
    SELECT 'purchase:'||purchase_id,user_id,'purchase',points_units,'Verified plugin purchase',purchased_at,?
    FROM lumen_points_purchases WHERE user_id=?
    ON CONFLICT(reward_key) DO UPDATE SET points_units=excluded.points_units,updated_at=excluded.updated_at`)
    .bind(now, userId))
  statements.push(db.prepare(`UPDATE lumen_points_rewards SET points_units=COALESCE((
    SELECT SUM(p.points_units)/2 FROM lumen_points_referral_purchases rp
    JOIN lumen_points_purchases p ON p.purchase_id=rp.purchase_id
    WHERE rp.buyer_user_id=?
  ),0),updated_at=? WHERE reward_key='referral:'||?`).bind(userId, now, userId))
  statements.push(db.prepare('UPDATE lumen_points_accounts SET purchase_checked_at=? WHERE user_id=?').bind(now, userId))
  await db.batch(statements)
}

async function saveMilestones(env, userId) {
  const status = await loyaltyStatus(env, userId)
  const now = new Date().toISOString()
  const statements = pointMilestones.filter(tier => tier.count === null ? status.tier?.id === 'elite' : status.count >= tier.count)
    .map(tier => env.COMMUNITY_DB.prepare(`INSERT INTO lumen_points_rewards(reward_key,user_id,kind,points_units,label,earned_at,updated_at)
      VALUES (?,?,'tier',?,?,?,?) ON CONFLICT(reward_key) DO NOTHING`)
      .bind(`tier:${userId}:${tier.id}`, userId, tier.points * 100, `${tier.name} milestone`, now, now))
  statements.push(env.COMMUNITY_DB.prepare('UPDATE lumen_points_accounts SET tier_checked_at=? WHERE user_id=?').bind(now, userId))
  await env.COMMUNITY_DB.batch(statements)
}

export async function syncPointEarnings(env, userId) {
  const db = env.COMMUNITY_DB, now = new Date().toISOString(), token = crypto.randomUUID()
  const reserved = await db.prepare(`UPDATE lumen_points_accounts SET sync_token=?,sync_until=?
    WHERE user_id=? AND (sync_until IS NULL OR sync_until < ?)`)
    .bind(token, new Date(Date.now() + 90000).toISOString(), userId, now).run()
  if (!reserved.meta?.changes) throw failure('An earnings check is already running. Wait a moment, then refresh.', 409)
  const checks = {}
  try {
    const account = await db.prepare('SELECT purchase_checked_at,tier_checked_at FROM lumen_points_accounts WHERE user_id=?').bind(userId).first()
    for (const name of ['purchases', 'loyalty']) {
      const last = name === 'purchases' ? account.purchase_checked_at : account.tier_checked_at
      if (last && Date.now() - Date.parse(last) < 60000) { checks[name] = { ok: true, checkedAt: last }; continue }
      try {
        if (name === 'purchases') await savePurchases(env, userId, await verifiedPointPurchases(env, userId))
        else await saveMilestones(env, userId)
        checks[name] = { ok: true, checkedAt: new Date().toISOString() }
      } catch (error) {
        console.error(`Lumen Points ${name} check failed:`, error instanceof Error ? error.message : 'Unknown error')
        checks[name] = { ok: false, error: error instanceof Error ? error.message : 'Earnings could not be verified. Please try again later.' }
      }
    }
    return checks
  } finally {
    await db.prepare('UPDATE lumen_points_accounts SET sync_token=NULL,sync_until=NULL WHERE user_id=? AND sync_token=?').bind(userId, token).run()
  }
}

export async function redeemPointReferral(db, userId, code) {
  const owner = await db.prepare('SELECT user_id,buyer_id FROM lumen_points_accounts WHERE referral_code=?').bind(code).first()
  if (!owner) throw failure('That referral code was not found.', 404)
  if (owner.user_id === userId) throw failure('You cannot redeem your own referral code.', 400)
  const now = new Date().toISOString(), cutoff = new Date(Date.now() - 86400000).toISOString()
  const result = await db.batch([
    db.prepare(`INSERT INTO lumen_points_referrals(buyer_user_id,referrer_user_id,redeemed_at)
      SELECT ?,?,? WHERE EXISTS (
        SELECT 1 FROM lumen_points_purchases WHERE user_id=? AND points_units>0 AND purchased_at>=? AND purchased_at<=?
      ) AND EXISTS (
        SELECT 1 FROM lumen_points_accounts buyer JOIN lumen_points_accounts referrer ON referrer.user_id=?
        WHERE buyer.user_id=? AND buyer.buyer_id IS NOT NULL AND (referrer.buyer_id IS NULL OR referrer.buyer_id!=buyer.buyer_id)
      ) ON CONFLICT(buyer_user_id) DO NOTHING`).bind(userId, owner.user_id, now, userId, cutoff, now, owner.user_id, userId),
    db.prepare(`INSERT INTO lumen_points_referral_purchases(purchase_id,buyer_user_id)
      SELECT purchase_id,? FROM lumen_points_purchases
      WHERE changes()=1 AND user_id=? AND points_units>0 AND purchased_at>=? AND purchased_at<=?
        AND EXISTS(SELECT 1 FROM lumen_points_referrals WHERE buyer_user_id=? AND referrer_user_id=? AND redeemed_at=?)
      ON CONFLICT(purchase_id) DO NOTHING`).bind(userId, userId, cutoff, now, userId, owner.user_id, now),
    db.prepare(`INSERT INTO lumen_points_rewards(reward_key,user_id,kind,points_units,label,earned_at,updated_at)
      SELECT 'referral:'||r.buyer_user_id,r.referrer_user_id,'referral',SUM(p.points_units)/2,'Successful customer referral',r.redeemed_at,?
      FROM lumen_points_referrals r JOIN lumen_points_referral_purchases rp ON rp.buyer_user_id=r.buyer_user_id
      JOIN lumen_points_purchases p ON p.purchase_id=rp.purchase_id
      WHERE r.buyer_user_id=? GROUP BY r.buyer_user_id ON CONFLICT(reward_key) DO NOTHING`).bind(now, userId),
  ])
  if (!result[0].meta?.changes) {
    const used = await db.prepare('SELECT buyer_user_id FROM lumen_points_referrals WHERE buyer_user_id=?').bind(userId).first()
    throw failure(used ? 'You have already redeemed a referral code.' : 'Make a verified paid purchase within the previous 24 hours before redeeming a referral code.', 409)
  }
}

async function pointsSummary(db, userId) {
  const account = await db.prepare('SELECT referral_code,purchase_checked_at,tier_checked_at FROM lumen_points_accounts WHERE user_id=?').bind(userId).first()
  const balance = await db.prepare('SELECT COALESCE(SUM(points_units),0) AS units FROM lumen_points_rewards WHERE user_id=?').bind(userId).first()
  const count = await db.prepare("SELECT COUNT(*) AS n FROM lumen_points_rewards WHERE user_id=? AND kind='referral' AND points_units>0").bind(userId).first()
  const redeemed = await db.prepare('SELECT redeemed_at FROM lumen_points_referrals WHERE buyer_user_id=?').bind(userId).first()
  const eligible = await db.prepare(`SELECT COALESCE(SUM(points_units),0) AS units,MIN(purchased_at) AS oldest
    FROM lumen_points_purchases WHERE user_id=? AND points_units>0 AND purchased_at>=? AND purchased_at<=?`)
    .bind(userId, new Date(Date.now() - 86400000).toISOString(), new Date().toISOString()).first()
  const rewards = (await db.prepare("SELECT reward_key,points_units FROM lumen_points_rewards WHERE user_id=? AND kind='tier'").bind(userId).all()).results || []
  const history = (await db.prepare('SELECT id,delta_units AS units,label,created_at AS createdAt FROM lumen_points_history WHERE user_id=? ORDER BY id DESC LIMIT 50').bind(userId).all()).results || []
  const totals = (await db.prepare(`SELECT kind,SUM(points_units) AS units,COUNT(*) AS n FROM lumen_points_rewards
    WHERE user_id=? AND points_units>0 GROUP BY kind`).bind(userId).all()).results || []
  const periods = {}
  for (const period of ['daily', 'weekly', 'monthly']) {
    const start = new Date(); start.setUTCHours(0, 0, 0, 0)
    if (period === 'weekly') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
    if (period === 'monthly') start.setUTCDate(1)
    const rows = (await db.prepare(`SELECT kind,COALESCE(SUM(points_units),0) AS units,COUNT(*) AS n
      FROM lumen_points_rewards WHERE user_id=? AND earned_at>=? AND points_units>0 GROUP BY kind`).bind(userId, start.toISOString()).all()).results || []
    periods[period] = {
      purchasePoints: (rows.find(row => row.kind === 'purchase')?.units || 0) / 100,
      referralPoints: (rows.find(row => row.kind === 'referral')?.units || 0) / 100,
      referrals: rows.find(row => row.kind === 'referral')?.n || 0,
    }
  }
  return {
    balance: balance.units / 100, referralCode: account.referral_code, successfulReferrals: count.n,
    redeemedAt: redeemed?.redeemed_at || null, eligibleReferralPoints: eligible.units / 200,
    referralExpiresAt: eligible.oldest ? new Date(Date.parse(eligible.oldest) + 86400000).toISOString() : null,
    purchaseCheckedAt: account.purchase_checked_at, tierCheckedAt: account.tier_checked_at,
    purchasePoints: (totals.find(row => row.kind === 'purchase')?.units || 0) / 100,
    referralPoints: (totals.find(row => row.kind === 'referral')?.units || 0) / 100,
    milestones: pointMilestones.map(tier => ({ ...tier, awarded: rewards.some(row => row.reward_key === `tier:${userId}:${tier.id}`) })),
    periods, history: history.map(row => ({ ...row, points: row.units / 100, units: undefined })),
  }
}

export async function handleLumenPoints(request, env, origin, path, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  if (!env.COMMUNITY_DB) return send({ error: 'Lumen Points storage is unavailable.' }, 503)
  const user = await deps.verifyLoginToken((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env)
  if (!user || !/^\d{5,22}$/.test(user.id)) return send({ error: 'Sign in with Discord to use Lumen Points.' }, 401)
  const read = path === '/studio/points' && request.method === 'GET'
  if (!read && !(request.method === 'POST' && ['/studio/points/sync', '/studio/points/referral'].includes(path))) return send({ error: 'Method not allowed.' }, 405)
  const limiter = read ? env.ADMIN_READ_LIMITER : env.ADMIN_WRITE_LIMITER
  if (!limiter) return send({ error: 'Points rate limiting is unavailable.' }, 503)
  if (!(await limiter.limit({ key: `points:${user.id}` })).success) return send({ error: 'Please wait before checking points again.' }, 429)
  try {
    await ensurePointsAccount(env.COMMUNITY_DB, user.id)
    let checks
    if (!read) {
      const raw = await request.text()
      if (raw.length > 256) return send({ error: 'Request is too large.' }, 413)
      let body
      try { body = JSON.parse(raw || '{}') } catch { return send({ error: 'Expected JSON.' }, 400) }
      if (path.endsWith('/referral') && (typeof body.code !== 'string' || !/^LP-[A-F0-9]{12}$/.test(body.code.trim().toUpperCase()))) return send({ error: 'Enter a valid Lumen referral code.' }, 400)
      checks = await syncPointEarnings(env, user.id)
      if (path.endsWith('/referral')) {
        if (!checks.purchases.ok) return send({ error: checks.purchases.error, checks }, 503)
        await redeemPointReferral(env.COMMUNITY_DB, user.id, body.code.trim().toUpperCase())
      }
    }
    return send({ ...await pointsSummary(env.COMMUNITY_DB, user.id), ...(checks ? { checks } : {}) })
  } catch (error) {
    console.error('Lumen Points request failed:', error instanceof Error ? error.message : 'Unknown error')
    return send({ error: error.status ? error.message : 'Lumen Points could not be updated. Refresh your balance before retrying.' }, error.status || 503)
  }
}
