import { shopProducts } from '../shared/points-shop.mjs'
import { ensurePointsAccount, pointsBalance } from './points-account.js'
import { higherStaffRecipients, hasPermission, resolveAccess } from './access-control.js'
import { activeOwnership, activeRegistry } from './loyalty.js'
import { issuePointsCoupon } from './coupon-rewards.js'

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const failure = (message, status = 400) => Object.assign(new Error(message), { status })
const canManage = access => hasPermission(access, 'dashboard.view') && hasPermission(access, 'licenses.grant')
const orderView = row => ({
  id: row.id, productId: row.product_id, name: row.product_name, price: row.cost_units / 100,
  state: row.state, details: JSON.parse(row.details), staffNote: row.staff_note, createdAt: row.created_at,
  ...(row.user_id ? { userId: row.user_id, memberName: row.member_name || row.user_id } : {}),
})

async function settleCoupon(db, id) {
  const order = await db.prepare(`SELECT o.*,c.state AS coupon_state FROM lumen_points_orders o
    LEFT JOIN coupon_rewards c ON c.reward_key='shop:'||o.id WHERE o.id=?`).bind(id).first()
  if (!order || !['processing', 'review'].includes(order.state)) return
  const neverIssued = !order.coupon_state && Date.now() - Date.parse(order.created_at) > 15 * 60000
  const state = order.coupon_state === 'issued' ? 'fulfilled' : order.coupon_state === 'failed' || neverIssued ? 'refunded' : 'review'
  await db.prepare("UPDATE lumen_points_orders SET state=?,updated_at=? WHERE id=? AND state IN ('processing','review')")
    .bind(state, new Date().toISOString(), id).run()
}

export async function reconcileShopCoupons(env) {
  await env.COMMUNITY_DB.prepare(`UPDATE coupon_rewards SET state='uncertain'
    WHERE reward_key LIKE 'shop:%' AND state='issuing' AND created_at<?`)
    .bind(new Date(Date.now() - 15 * 60000).toISOString()).run()
  const rows = (await env.COMMUNITY_DB.prepare(`SELECT id FROM lumen_points_orders
    WHERE product_id IN ('coupon_5','coupon_10') AND state IN ('processing','review') ORDER BY updated_at LIMIT 20`).all()).results || []
  for (const row of rows) await settleCoupon(env.COMMUNITY_DB, row.id)
}

async function summary(env, userId, access) {
  const db = env.COMMUNITY_DB
  const owned = (await db.prepare('SELECT product_id FROM lumen_points_shop_entitlements WHERE user_id=?').bind(userId).all()).results || []
  const orders = (await db.prepare(`SELECT * FROM lumen_points_orders WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT 50`).bind(userId).all()).results || []
  let choices = [], productError = ''
  try {
    const [registry, ownership] = await Promise.all([activeRegistry(env), activeOwnership(env, userId)])
    choices = registry.filter(product => !ownership.includes(product.productId)).map(({ productId, name }) => ({ productId, name }))
  } catch (error) {
    console.error('Shop product choices failed:', error instanceof Error ? error.message : 'Unknown error')
    productError = 'Plugin choices could not be verified. Free-product redemptions are temporarily unavailable.'
  }
  const queue = canManage(access) ? (await db.prepare(`SELECT o.*,m.display_name AS member_name
    FROM lumen_points_orders o LEFT JOIN website_members m ON m.discord_id=o.user_id
    WHERE o.state IN ('pending','review','processing') ORDER BY o.created_at,o.id LIMIT 100`).all()).results || [] : []
  return { userId, balance: await pointsBalance(db, userId), products: shopProducts, owned: owned.map(row => row.product_id),
    orders: orders.map(orderView), choices, productError, canManage: canManage(access), queue: queue.map(orderView) }
}

export async function redeemShopProduct(env, user, body) {
  const db = env.COMMUNITY_DB
  if (!body || !uuid.test(body.requestId || '') || typeof body.productId !== 'string') throw failure('Choose a product and a valid request ID.')
  const product = shopProducts.find(item => item.id === body.productId)
  if (!product) throw failure('This shop product does not exist.', 404)
  const existing = await db.prepare('SELECT * FROM lumen_points_orders WHERE id=?').bind(body.requestId).first()
  if (existing) {
    if (existing.user_id !== user.id || existing.product_id !== product.id) throw failure('That request ID belongs to another order.', 409)
    await settleCoupon(db, existing.id)
    return
  }
  const details = {}
  if (product.id === 'free_product') {
    const [registry, ownership] = await Promise.all([activeRegistry(env), activeOwnership(env, user.id)])
    const chosen = registry.find(item => item.productId === body.pluginId)
    if (!chosen || ownership.includes(chosen.productId)) throw failure('Choose an active plugin you do not already own.')
    details.productId = chosen.productId; details.productName = chosen.name
  } else if (product.id === 'commission') {
    if (typeof body.description !== 'string' || body.description.trim().length < 20 || body.description.length > 2000 ||
        /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body.description)) throw failure('Describe your small plugin request in 20 to 2,000 characters.')
    details.description = body.description.trim()
  }
  const staff = product.delivery === 'staff' ? await higherStaffRecipients(env, { rank: 1 }) : []
  if (product.delivery === 'staff' && !staff.length) throw failure('Staff fulfillment is unavailable. No points were spent.', 503)
  const now = new Date().toISOString()
  const state = product.delivery === 'instant' ? 'fulfilled' : product.delivery === 'coupon' ? 'processing' : 'pending'
  const statements = [db.prepare(`INSERT INTO lumen_points_orders(id,user_id,product_id,product_name,cost_units,state,details,created_at,updated_at)
    SELECT ?,?,?,?,?,?,?,?,? FROM lumen_points_balances WHERE user_id=? AND units>=?
      AND NOT EXISTS(SELECT 1 FROM lumen_points_shop_entitlements WHERE user_id=? AND product_id=?)
      AND NOT EXISTS(SELECT 1 FROM lumen_points_orders WHERE user_id=? AND product_id=? AND state IN ('pending','processing','review'))
    ON CONFLICT(id) DO NOTHING`)
    .bind(body.requestId, user.id, product.id, product.name, product.price * 100, state, JSON.stringify(details), now, now,
      user.id, product.price * 100, user.id, product.id, user.id, product.id)]
  if (product.delivery === 'instant') statements.push(db.prepare(`INSERT INTO lumen_points_shop_entitlements(user_id,product_id,order_id)
    SELECT user_id,product_id,id FROM lumen_points_orders WHERE id=? AND user_id=? ON CONFLICT(user_id,product_id) DO NOTHING`)
    .bind(body.requestId, user.id))
  for (const memberId of staff) statements.push(db.prepare(`INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
    SELECT ?,?,'Points shop fulfillment',?,'license','user','/account/points/shop',?
    WHERE EXISTS(SELECT 1 FROM lumen_points_orders WHERE id=? AND user_id=?)
    ON CONFLICT(id) DO NOTHING`).bind(`shop:${body.requestId}:${memberId}`, memberId,
      `${user.globalName || user.username || user.id} (${user.id}) redeemed ${product.name} for ${product.price} LP. ${details.productName ? `Plugin: ${details.productName}. ` : ''}Order ${body.requestId}. Open the shop staff queue to fulfill or refund.`, now, body.requestId, user.id))
  await db.batch(statements)
  const order = await db.prepare('SELECT * FROM lumen_points_orders WHERE id=? AND user_id=?').bind(body.requestId, user.id).first()
  if (!order) throw failure('Not enough points, this cosmetic is already owned, or an order for this item is already pending. Refresh your shop.', 409)
  if (order.product_id !== product.id) throw failure('That request ID belongs to another order.', 409)
  if (product.delivery === 'coupon') {
    try { await issuePointsCoupon(env, order) }
    catch (error) {
      console.error('Points coupon delivery failed:', error instanceof Error ? error.message : 'Unknown error')
      const reserved = await db.prepare('SELECT state FROM coupon_rewards WHERE reward_key=?').bind(`shop:${order.id}`).first()
      // Without an upstream reservation, no coupon creation could have been attempted.
      if (!reserved) await db.prepare("UPDATE lumen_points_orders SET state='refunded',updated_at=? WHERE id=? AND state='processing'").bind(new Date().toISOString(), order.id).run()
      else await settleCoupon(db, order.id)
      throw failure('Coupon delivery could not be confirmed. Check your order and Coupons before retrying; any uncertain delivery remains under review.', 503)
    }
    await settleCoupon(db, order.id)
  }
}

async function handleStaffOrder(env, user, access, body) {
  if (!canManage(access)) throw failure('License-grant permission is required to fulfill shop requests.', 403)
  if (!body || !uuid.test(body.orderId || '') || !['fulfilled', 'refunded'].includes(body.state) ||
      typeof body.note !== 'string' || body.note.trim().length < 5 || body.note.length > 1000) throw failure('Choose an order, delivery/refund action and a 5 to 1,000 character note.')
  const db = env.COMMUNITY_DB, now = new Date().toISOString()
  const result = await db.batch([
    db.prepare(`UPDATE lumen_points_orders SET state=?,staff_note=?,handled_by=?,updated_at=?
      WHERE id=? AND state='pending' AND product_id IN ('free_product','ip_slot','commission')`)
      .bind(body.state, body.note.trim(), user.id, now, body.orderId),
    db.prepare(`INSERT INTO website_access_audit(id,actor_id,actor_role,action,target,details,created_at)
      SELECT ?,?,?,'points.shop.fulfillment',?,?,? WHERE changes()=1`)
      .bind(crypto.randomUUID(), user.id, access.role, body.orderId, JSON.stringify({ state: body.state, note: body.note.trim() }), now),
    db.prepare(`INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
      SELECT ?,user_id,'Your shop order was updated',?,'license','user','/account/points/shop',?
      FROM lumen_points_orders WHERE id=? AND handled_by=? AND updated_at=? AND changes()=1`)
      .bind(crypto.randomUUID(), `Your order is ${body.state}. Staff note: ${body.note.trim()}`, now, body.orderId, user.id, now),
  ])
  if (!result[0].meta?.changes) throw failure('This order was already handled or cannot be changed here. Refresh the queue.', 409)
}

export async function handlePointsShop(request, env, origin, path, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  const user = await deps.verifyLoginToken((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env)
  if (!user || !/^\d{5,22}$/.test(user.id)) return send({ error: 'Sign in with Discord to use the points shop.' }, 401)
  const read = path === '/studio/points/shop' && request.method === 'GET'
  if (!read && !(request.method === 'POST' && ['/studio/points/shop/redeem', '/studio/points/shop/fulfill'].includes(path))) return send({ error: 'Method not allowed.' }, 405)
  const limiter = read ? env.ADMIN_READ_LIMITER : env.ADMIN_WRITE_LIMITER
  if (!env.COMMUNITY_DB || !limiter) return send({ error: 'The points shop is temporarily unavailable.' }, 503)
  if (!(await limiter.limit({ key: `points-shop:${user.id}` })).success) return send({ error: 'Please wait before using the shop again.' }, 429)
  try {
    const access = await resolveAccess(user.id, env)
    await ensurePointsAccount(env.COMMUNITY_DB, user.id)
    if (!read) {
      const raw = await request.text()
      if (raw.length > 4000) return send({ error: 'Request is too large.' }, 413)
      let body
      try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
      if (path.endsWith('/fulfill')) await handleStaffOrder(env, user, access, body)
      else await redeemShopProduct(env, user, body)
    }
    const pending = (await env.COMMUNITY_DB.prepare("SELECT id FROM lumen_points_orders WHERE user_id=? AND state IN ('processing','review')").bind(user.id).all()).results || []
    for (const order of pending) await settleCoupon(env.COMMUNITY_DB, order.id)
    return send(await summary(env, user.id, access))
  } catch (error) {
    console.error('Points shop request failed:', error instanceof Error ? error.message : 'Unknown error')
    return send({ error: error.status ? error.message : 'The shop could not complete this request. Refresh your orders before retrying.' }, error.status || 503)
  }
}
