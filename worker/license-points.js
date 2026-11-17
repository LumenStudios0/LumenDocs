import { productMarketplace } from '../shared/product-marketplace.mjs'
import { loyaltyStatus } from './loyalty.js'
import { usdCents } from './lumen-points.js'

export async function saveLicensePointsChoice(db, userId, productId, enabled, actorId) {
  if (!productId) throw new Error('The granted product could not be identified for points.')
  await db.prepare(`INSERT INTO lumen_points_license_choices(user_id,product_id,give_points,actor_id,updated_at)
    VALUES (?,?,?,?,?) ON CONFLICT(user_id,product_id) DO UPDATE SET give_points=excluded.give_points,
    actor_id=excluded.actor_id,updated_at=excluded.updated_at`)
    .bind(userId, productId, Number(enabled), actorId, new Date().toISOString()).run()
  await db.prepare('UPDATE lumen_points_accounts SET staff_checked_at=NULL,backfill_attempted_at=NULL WHERE user_id=?').bind(userId).run()
}

export async function syncStaffLicensePoints(env, userId) {
  const db = env.COMMUNITY_DB
  const status = await loyaltyStatus(env, userId)
  const blocked = (await db.prepare(`SELECT product_id FROM lumen_points_license_choices WHERE user_id=? AND give_points=0
    UNION SELECT json_extract(details,'$.productId') FROM lumen_points_orders WHERE user_id=? AND product_id='free_product' AND state!='refunded'
    UNION SELECT product_id FROM community_trials WHERE user_id=? AND status='approved'
    UNION SELECT product_id FROM lumen_points_staff_rewards WHERE user_id=?`)
    .bind(userId, userId, userId, userId).all()).results || []
  const paid = (await db.prepare(`SELECT DISTINCT resource_id FROM lumen_points_purchases WHERE user_id=?
    UNION SELECT resource_id FROM lumen_points_staff_rewards WHERE user_id=?`).bind(userId, userId).all()).results || []
  const candidates = status.products.filter(product => !blocked.some(row => row.product_id === product.productId)).map(product => {
    const mapped = productMarketplace.find(item => item.productId === product.productId || item.name.toLowerCase() === product.name.toLowerCase())
    return { ...product, resourceId: mapped?.resourceId }
  }).filter(product => !product.resourceId || !paid.some(row => row.resource_id === product.resourceId))
  const missing = candidates.filter(product => !product.resourceId)
  if (missing.length) throw new Error(`Staff-license point pricing is not configured for: ${missing.map(product => product.name).join(', ')}.`)
  if (candidates.length) {
    if (!env.BUILDBYBIT_API_AUTHORIZATION) throw new Error('Marketplace authorization is required to verify staff-license points.')
    const ids = [...new Set(candidates.map(product => product.resourceId))]
    const query = new URLSearchParams({ resource_ids: ids.join(','), per_page: '100', page: '1' })
    const response = await fetch(`https://api.builtbybit.com/v2/resources/discover/resources?${query}`, {
      headers: { Authorization: env.BUILDBYBIT_API_AUTHORIZATION, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    })
    if (!response.ok) throw new Error(`Staff-license prices are unavailable (HTTP ${response.status}). Verify marketplace resource-read access.`)
    const raw = await response.text()
    if (raw.length > 2000000) throw new Error('Staff-license price response is too large.')
    const payload = JSON.parse(raw), rows = payload?.data?.resources, stats = payload?.data?.stats
    if (payload?.result !== 'success' || !Array.isArray(rows) || rows.length !== ids.length ||
        stats?.total !== ids.length || stats.page !== 1 || stats.max_page !== 1 ||
        new Set(rows.map(row => String(row.resource_id))).size !== ids.length ||
        rows.some(row => !ids.includes(String(row.resource_id)))) throw new Error('Staff-license prices were incomplete. No staff-license points were awarded.')
    const quotes = candidates.map(product => ({
      ...product, units: usdCents(rows.find(row => String(row.resource_id) === product.resourceId).FinalPrice) * 10,
    }))
    const now = new Date().toISOString()
    await db.batch(quotes.map(product => db.prepare(`INSERT INTO lumen_points_staff_rewards
      (user_id,product_id,resource_id,product_name,awarded_units,points_units,created_at)
      SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM lumen_points_license_choices WHERE user_id=? AND product_id=? AND give_points=0)
        AND NOT EXISTS(SELECT 1 FROM lumen_points_orders WHERE user_id=? AND product_id='free_product' AND state!='refunded' AND json_extract(details,'$.productId')=?)
        AND NOT EXISTS(SELECT 1 FROM lumen_points_purchases WHERE user_id=? AND resource_id=?)
      ON CONFLICT DO NOTHING`)
      .bind(userId, product.productId, product.resourceId, product.name, product.units, product.units, now,
        userId, product.productId, userId, product.productId, userId, product.resourceId)))
  }
  await db.prepare('UPDATE lumen_points_accounts SET staff_checked_at=? WHERE user_id=?').bind(new Date().toISOString(), userId).run()
}
