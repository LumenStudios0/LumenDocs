import { hasPermission } from './access-control.js'

export function ticketClosureStatements(db, { ticketId, staffId, now, eligibleAtRequest }) {
  return [
    db.prepare(`INSERT OR IGNORE INTO staff_ticket_closures
      (ticket_id, closed_by, assigned_staff_id, staff_reply_count, eligible, closed_at)
      SELECT t.id, ?, t.assignee_id,
        (SELECT COUNT(*) FROM community_replies r WHERE r.ticket_id = t.id AND r.staff = 1 AND r.author_id = ? AND r.assignee_id = ?),
        CASE WHEN ? = 1 AND t.owner_id != ? AND t.assignee_id = ?
          AND (SELECT COUNT(*) FROM community_replies r WHERE r.ticket_id = t.id AND r.staff = 1 AND r.author_id = ? AND r.assignee_id = ?) > 5
          THEN 1 ELSE 0 END,
        ?
      FROM community_tickets t
      WHERE t.id = ? AND t.status = 'closed'
        AND NOT EXISTS (SELECT 1 FROM staff_ticket_closures c WHERE c.ticket_id = t.id)`)
      .bind(staffId, staffId, staffId, eligibleAtRequest ? 1 : 0, staffId, staffId, staffId, staffId, now, ticketId),
    db.prepare(`INSERT OR IGNORE INTO staff_xp_ledger
      (id, staff_id, points, source_type, source_id, created_at)
      SELECT ?, assigned_staff_id, 100, 'ticket_close', ticket_id, ?
      FROM staff_ticket_closures WHERE ticket_id = ? AND eligible = 1`)
      .bind(crypto.randomUUID(), now, ticketId),
  ]
}

export async function saveTicketRating(db, ticketId, userId, score, comment, now) {
  const ticket = await db.prepare('SELECT owner_id, status, rating_score FROM community_tickets WHERE id = ?')
    .bind(ticketId).first()
  if (!ticket || ticket.owner_id !== userId) return { status: 404, error: 'Ticket not found' }
  if (ticket.status !== 'closed') return { status: 409, error: 'Only closed tickets can be rated' }
  if (ticket.rating_score != null) return { status: 409, error: 'This ticket has already been rated' }

  const results = await db.batch([
    db.prepare(`UPDATE community_tickets SET rating_score = ?, rating_comment = ?
      WHERE id = ? AND owner_id = ? AND status = 'closed' AND rating_score IS NULL`)
      .bind(score, comment, ticketId, userId),
    db.prepare(`INSERT OR IGNORE INTO staff_xp_ledger
      (id, staff_id, points, source_type, source_id, created_at)
      SELECT ?, c.assigned_staff_id, t.rating_score * 20, 'rating_bonus', t.id, ?
      FROM community_tickets t
      JOIN staff_ticket_closures c ON c.ticket_id = t.id
      WHERE t.id = ? AND c.eligible = 1 AND changes() = 1`)
      .bind(crypto.randomUUID(), now, ticketId),
  ])
  return results[0].meta?.changes
    ? { status: 200, rating: { score, comment } }
    : { status: 409, error: 'This ticket has already been rated or is no longer closed' }
}

export function utcWindowStart(window, now = new Date()) {
  if (window === 'all-time') return null
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  if (window === 'monthly') {
    start.setUTCDate(1)
  } else if (window === 'weekly') {
    const weekday = (start.getUTCDay() + 6) % 7
    start.setUTCDate(start.getUTCDate() - weekday)
  }
  return start.toISOString()
}

export async function staffProgress(env, id) {
  const row = await env.COMMUNITY_DB.prepare(
    'SELECT COALESCE(SUM(points), 0) AS xp FROM staff_xp_ledger WHERE staff_id = ?',
  ).bind(id).first()
  const xp = Number(row?.xp || 0)
  return { xp, level: Math.floor(xp / 100) + 1 }
}

export async function staffProgressionRoute(request, env, suffix, user, access, deps, helpers) {
  if (suffix !== '/staff/progression') return null
  if (request.method !== 'GET') return helpers.json(request, { error: 'Method not allowed' }, 405, deps.respond)
  if (!hasPermission(access, 'dashboard.view') || !hasPermission(access, 'tickets.view')) {
    return helpers.json(request, { error: 'Staff dashboard and ticket access are required' }, 403, deps.respond)
  }

  const url = new URL(request.url)
  const window = url.searchParams.get('window') || 'weekly'
  if (!['daily', 'weekly', 'monthly', 'all-time'].includes(window)) {
    return helpers.json(request, { error: 'Choose daily, weekly, monthly, or all-time' }, 400, deps.respond)
  }
  const db = env.COMMUNITY_DB
  const now = new Date()
  const start = utcWindowStart(window, now)
  const staff = await deps.getStaffMembers(env)
  const identities = staff.length
    ? await db.prepare(`SELECT discord_id, COALESCE(NULLIF(username, ''), NULLIF(display_name, ''), 'Studio staff') AS name
        FROM website_members WHERE discord_id IN (${staff.map(() => '?').join(',')})`)
      .bind(...staff.map(member => member.id)).all()
    : { results: [] }
  const names = new Map((identities.results || []).map(row => [row.discord_id, row.name]))
  const permittedStaff = staff.map(member => ({ id: member.id, name: names.get(member.id) || member.name || 'Studio staff' }))
  const ids = permittedStaff.map(member => member.id)
  const entries = ids.length
    ? await db.prepare(`SELECT staff_id,
        SUM(CASE WHEN ? IS NULL OR created_at >= ? THEN points ELSE 0 END) AS window_xp,
        SUM(points) AS total_xp
      FROM staff_xp_ledger WHERE staff_id IN (${ids.map(() => '?').join(',')}) GROUP BY staff_id`)
      .bind(start, start, ...ids).all()
    : { results: [] }
  const xpByStaff = new Map((entries.results || []).map(row => [row.staff_id, row]))
  const leaderboard = permittedStaff.map(member => {
    const earned = xpByStaff.get(member.id)
    const totalXp = Number(earned?.total_xp || 0)
    return { id: member.id, name: member.name, level: Math.floor(totalXp / 100) + 1,
      windowXp: Number(earned?.window_xp || 0), totalXp }
  }).filter(member => member.windowXp > 0 || member.id === user.id)
    .sort((a, b) => b.windowXp - a.windowXp || b.totalXp - a.totalXp || a.name.localeCompare(b.name))
  const logs = ids.length ? (await db.prepare(`SELECT staff_id, points, source_type, source_id, created_at
    FROM staff_xp_ledger WHERE staff_id IN (${ids.map(() => '?').join(',')})
    ORDER BY created_at DESC, id DESC LIMIT 50`).bind(...ids).all()).results || [] : []
  const ownTotal = Number(xpByStaff.get(user.id)?.total_xp || 0)
  return helpers.json(request, {
    window, windowStart: start, leaderboard,
    currentStaff: { level: Math.floor(ownTotal / 100) + 1, totalXp: ownTotal },
    logs: logs.map(row => ({
      staffId: row.staff_id, staffName: names.get(row.staff_id) || permittedStaff.find(member => member.id === row.staff_id)?.name,
      points: row.points, source: row.source_type, ticketId: row.source_id, createdAt: row.created_at,
    })),
  }, 200, deps.respond)
}
