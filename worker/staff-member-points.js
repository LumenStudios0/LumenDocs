import { hasPermission, resolveAccess } from './access-control.js'
import { staffProgress } from './staff-progression.js'
import { pointsBalance } from './points-account.js'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function handleStaffMemberPoints(request, env, origin, path, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  const match = path.match(/^\/studio\/staff\/points\/(\d{5,22})$/)
  if (!match || !['GET', 'POST'].includes(request.method)) return send({ error: 'Not found.' }, 404)
  const user = await deps.verifyLoginToken((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env)
  if (!user) return send({ error: 'Sign in with Discord.' }, 401)
  if (!env.COMMUNITY_DB) return send({ error: 'Member points storage is unavailable.' }, 503)
  try {
    const access = await resolveAccess(user.id, env)
    if (access.rank < 3 || !['dashboard.view', 'customers.view', 'points.manage'].every(permission => hasPermission(access, permission)) ||
        access.rank < 6 && (await staffProgress(env, user.id)).level < 2) {
      return send({ error: 'Support rank, staff level 2, and member-points permission are required. Studio leads and Owner bypass the level requirement.' }, 403)
    }
    const limiter = request.method === 'GET' ? env.ADMIN_READ_LIMITER : env.ADMIN_WRITE_LIMITER
    if (!limiter) return send({ error: 'Points rate limiting is unavailable.' }, 503)
    if (!(await limiter.limit({ key: `staff-points:${user.id}` })).success) return send({ error: 'Too many points requests. Please try again later.' }, 429)
    const db = env.COMMUNITY_DB, target = match[1]
    const rawPage = new URL(request.url).searchParams.get('page') || '1'
    if (!/^[1-9]\d{0,5}$/.test(rawPage)) return send({ error: 'Invalid transaction page.' }, 400)
    if (!await db.prepare('SELECT user_id FROM lumen_points_accounts WHERE user_id=?').bind(target).first()) return send({ error: 'This member has no points wallet. They must sign in first.' }, 404)
    if (request.method === 'POST') {
      const raw = await request.text()
      if (raw.length > 2000) return send({ error: 'Request is too large.' }, 413)
      let body
      try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
      if (!body || !uuid.test(body.requestId || '') || !['give', 'take'].includes(body.action) ||
          typeof body.points !== 'string' || !/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(body.points) ||
          typeof body.reason !== 'string' || body.reason.trim().length < 5 || body.reason.length > 500 ||
          /[\x00-\x1f\x7f]/.test(body.reason)) return send({ error: 'Enter 0.01 to 1,000,000 points, an action and a 5 to 500 character reason.' }, 400)
      const [whole, fraction = ''] = body.points.split('.')
      const units = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
      if (units < 1 || units > 100000000) return send({ error: 'Use between 0.01 and 1,000,000 points per adjustment.' }, 400)
      if (target === user.id && access.rank !== 7) return send({ error: 'Only Owner can adjust their own points.' }, 403)
      const delta = body.action === 'give' ? units : -units, id = `manual:${body.requestId}`
      const prior = await db.prepare('SELECT * FROM lumen_points_adjustments WHERE id=?').bind(id).first()
      if (prior && (prior.user_id !== target || prior.actor_id !== user.id || prior.delta_units !== delta || prior.reason !== body.reason.trim())) {
        return send({ error: 'This request ID belongs to another points adjustment.' }, 409)
      }
      if (!prior) {
        const now = new Date().toISOString()
        const result = await db.batch([
          db.prepare(`INSERT INTO lumen_points_adjustments(id,user_id,delta_units,kind,label,actor_id,reason,created_at)
            SELECT ?,?,?,'staff_adjustment',?,?,?,? FROM lumen_points_balances WHERE user_id=? AND (? > 0 OR units>=?)
            ON CONFLICT(id) DO NOTHING`).bind(id, target, delta, body.action === 'give' ? 'Staff points award' : 'Staff points deduction',
              user.id, body.reason.trim(), now, target, delta, units),
          db.prepare(`INSERT INTO website_access_audit(id,actor_id,actor_role,action,target,details,created_at)
            SELECT ?,?,?,'points.adjust',?,?,? WHERE changes()=1`)
            .bind(crypto.randomUUID(), user.id, access.role, target, JSON.stringify({ requestId: body.requestId, delta: delta / 100, reason: body.reason.trim() }), now),
        ])
        if (!result[0].meta?.changes) {
          const saved = await db.prepare('SELECT * FROM lumen_points_adjustments WHERE id=?').bind(id).first()
          if (!saved || saved.user_id !== target || saved.actor_id !== user.id || saved.delta_units !== delta || saved.reason !== body.reason.trim()) {
            return send({ error: 'Not enough available points to deduct, or the request ID conflicts with another adjustment. Refresh the wallet.' }, 409)
          }
        }
      }
    }
    const page = Number(rawPage), pageSize = 25
    const total = await db.prepare('SELECT COUNT(*) AS n FROM lumen_points_transactions WHERE user_id=?').bind(target).first()
    const items = (await db.prepare(`SELECT id,delta_units/100.0 AS points,label,created_at AS createdAt,actor_id AS actorId,reason
      FROM lumen_points_transactions WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?`)
      .bind(target, pageSize, (page - 1) * pageSize).all()).results || []
    return send({ actorId: user.id, userId: target, balance: await pointsBalance(db, target), items, total: total.n, page, pageSize })
  } catch (error) {
    console.error('Staff member points failed:', error instanceof Error ? error.message : 'Unknown error')
    return send({ error: 'Member points could not be updated. Refresh transactions before retrying; do not submit a new request ID for the same adjustment.' }, 503)
  }
}
