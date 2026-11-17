import { marketplaceProduct } from '../shared/product-marketplace.mjs'
import { loyaltyStatus } from './loyalty.js'

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
  const resolved = (await db.prepare('SELECT product_id,resource_id FROM lumen_points_resource_catalog').all()).results || []
  const products = status.products.filter(product => !blocked.some(row => row.product_id === product.productId)).map(product => {
    const mapped = marketplaceProduct(product)
    return { ...product, resourceId: mapped?.resourceId || resolved.find(row => row.product_id === mapped?.productId)?.resource_id,
      units: mapped ? mapped.priceCents * 10 : null }
  })
  const deferred = products.filter(product => !product.resourceId || product.units === null).map(product => product.name)
  const candidates = products.filter(product => product.resourceId && product.units !== null &&
    !paid.some(row => row.resource_id === product.resourceId))
  if (candidates.length) {
    const now = new Date().toISOString()
    await db.batch(candidates.map(product => db.prepare(`INSERT INTO lumen_points_staff_rewards
      (user_id,product_id,resource_id,product_name,awarded_units,points_units,created_at)
      SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM lumen_points_license_choices WHERE user_id=? AND product_id=? AND give_points=0)
        AND NOT EXISTS(SELECT 1 FROM lumen_points_orders WHERE user_id=? AND product_id='free_product' AND state!='refunded' AND json_extract(details,'$.productId')=?)
        AND NOT EXISTS(SELECT 1 FROM lumen_points_purchases WHERE user_id=? AND resource_id=?)
      ON CONFLICT DO NOTHING`)
      .bind(userId, product.productId, product.resourceId, product.name, product.units, product.units, now,
        userId, product.productId, userId, product.productId, userId, product.resourceId)))
  }
  await db.prepare('UPDATE lumen_points_accounts SET staff_checked_at=?,staff_deferred_products=? WHERE user_id=?')
    .bind(new Date().toISOString(), JSON.stringify(deferred), userId).run()
}
