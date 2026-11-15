import { bootstrapRole, hasPermission, OWNER_DISCORD_ID, resolveAccess, rolePolicies } from './access-control.js'
import { staffGuideIds } from './staff-knowledge.js'

export const PRESENCE_TTL_MS = 90000
export const EDITOR_TTL_MS = 120000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const memberId = /^\d{5,22}$/
const validText = (v, min, max) => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v)
const revision = v => Number.isInteger(v) && v >= 0
const staffFeatures = ['staff.docs', 'staff.presence', 'staff.tasks', 'staff.warnings', 'staff.commissions', 'staff.feedback']
const hasStaffFeature = access => staffFeatures.some(p => hasPermission(access, p))
const rows = async (db, sql, ...args) => (await db.prepare(sql).bind(...args).all()).results || []
const taskView = r => ({ id: r.id, title: r.title, body: r.body, assigneeId: r.assignee_id, status: r.status,
  priority: r.priority, dueAt: r.due_at, revision: r.revision, createdAt: r.created_at })
const commissionView = r => ({ ticketId: r.ticket_id, title: r.title, status: r.status, stage: r.stage,
  scope: r.scope, acceptanceCriteria: r.acceptance_criteria, milestones: JSON.parse(r.milestones), revision: r.revision })
const warningView = r => ({ id: r.id, targetId: r.target_id, actorId: r.actor_id, reason: r.reason,
  createdAt: r.created_at, acknowledgedAt: r.acknowledged_at })

export function activityCustomerName(name) {
  return typeof name === 'string' && name.trim()
    ? name.replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 80) || 'Customer'
    : 'Customer'
}

export function staffActivityStatement(db, id, label, now = new Date().toISOString()) {
  return db.prepare(`INSERT INTO staff_presence(member_id,last_online,last_did,last_activity_at) VALUES (?,?,?,?)
    ON CONFLICT(member_id) DO UPDATE SET last_online=excluded.last_online,
    last_did=excluded.last_did,last_activity_at=excluded.last_activity_at`).bind(id, now, label, now)
}

function auditStatement(db, user, access, action, target, now) {
  return db.prepare(`INSERT INTO website_access_audit(id,actor_id,actor_role,action,target,details,created_at)
    SELECT ?,?,?,?,?, '{}',? WHERE changes() = 1`).bind(crypto.randomUUID(), user.id, access.role, action, target, now)
}

async function team(env) {
  const members = await rows(env.COMMUNITY_DB, 'SELECT discord_id,display_name,role_id FROM website_members')
  const policies = await rolePolicies(env)
  const ids = new Set([OWNER_DISCORD_ID, '1012053634911064114', ...(env.ADMIN_DISCORD_IDS || '').split(',').map(v => v.trim()).filter(v => memberId.test(v)), ...members.map(m => m.discord_id)])
  return [...ids].map(id => {
    const m = members.find(m => m.discord_id === id)
    const role = policies.find(r => r.id === (id === OWNER_DISCORD_ID ? 'owner' : m?.role_id || bootstrapRole(id, env)))
    return { id, name: m?.display_name || (id === OWNER_DISCORD_ID ? 'Studio owner' : 'Studio staff'),
      roleName: role.name, rank: role.rank }
  }).filter(m => m.rank >= 2)
}

function memberRoleSql(env, id) {
  const admins = (env.ADMIN_DISCORD_IDS || '').split(',').map(v => v.trim()).filter(v => memberId.test(v))
  const bootstrap = admins.length ? `WHEN ${id} IN (${admins.map(id => `'${id}'`).join(',')}) THEN 'support_team'` : ''
  return `CASE WHEN ${id}='${OWNER_DISCORD_ID}' THEN 'owner'
    ELSE COALESCE((SELECT role_id FROM website_members WHERE discord_id=${id}),
      CASE WHEN ${id}='1012053634911064114' THEN 'studio_lead' ${bootstrap} ELSE 'guest' END) END`
}

const roleRankSql = role => `CASE ${role} WHEN 'owner' THEN 5 WHEN 'studio_lead' THEN 4
  WHEN 'developer' THEN 3 WHEN 'support_team' THEN 2 WHEN 'client' THEN 1 ELSE 0 END`

// Correlated SQL keeps lease eligibility and reply insertion in the same transaction.
export function staffEditorEligibilitySql(env, alias = 'e') {
  const role = memberRoleSql(env, `${alias}.member_id`)
  return `EXISTS (SELECT 1 FROM (SELECT ${role} AS role_id) eligible
    LEFT JOIN website_role_permissions policy ON policy.role_id=eligible.role_id
    WHERE eligible.role_id IN ('support_team','developer','studio_lead','owner')
    AND (eligible.role_id='owner' OR policy.role_id IS NULL OR (
      EXISTS (SELECT 1 FROM json_each(policy.permissions) WHERE value='tickets.view')
      AND EXISTS (SELECT 1 FROM json_each(policy.permissions) WHERE value='tickets.reply'))))`
}

export async function ticketEditors(env, ticketId, currentStaffId) {
  const editors = await rows(env.COMMUNITY_DB,
    `SELECT e.member_id,e.expires_at FROM staff_ticket_editors e WHERE ticket_id = ? AND expires_at > ?
      AND ${staffEditorEligibilitySql(env)}`,
    ticketId, new Date().toISOString())
  const members = await team(env)
  return { editors: editors.filter(e => members.some(m => m.id === e.member_id)).map(e => ({
    id: e.member_id, name: members.find(m => m.id === e.member_id).name, expiresAt: e.expires_at,
  })), currentStaffId }
}

export async function ticketWaitEstimates(db) {
  const samples = await rows(db, `
    SELECT t.type,t.created_at AS opened_at,MIN(r.created_at) AS first_reply_at
    FROM community_tickets t JOIN community_replies r ON r.ticket_id=t.id AND r.staff=1
    WHERE t.created_at >= ? AND r.created_at >= t.created_at
    GROUP BY t.id ORDER BY t.created_at DESC LIMIT 1000
  `, new Date(Date.now() - 30 * 86400000).toISOString())
  const byType = new Map()
  for (const r of samples) {
    const elapsed = Date.parse(r.first_reply_at) - Date.parse(r.opened_at)
    if (!Number.isFinite(elapsed) || elapsed < 0) continue
    const values = byType.get(r.type) || []
    values.push(elapsed)
    byType.set(r.type, values)
  }
  return Object.fromEntries([...byType].filter(([, values]) => values.length >= 3).map(([type, values]) => {
    const minutes = Math.max(1, Math.ceil(values.reduce((sum, value) => sum + value, 0) / values.length / 60000))
    return [type, { minutes, label: `About ${minutes} minutes — not guaranteed`,
      basis: `Mean initial staff reply time for ${values.length} ${type} tickets opened in the last 30 days; not a guarantee.` }]
  }))
}

export const estimatedWait = (ticket, estimates = {}) => ticket.status === 'closed'
  ? { minutes: null, label: 'Closed', basis: 'This ticket is closed.' }
  : estimates[ticket.type] || { minutes: null, label: 'Not enough recent data', basis: 'At least 3 initial staff replies for this type in the last 30 days are required; not a guarantee.' }

// Aggregate-only context for the server-local assistant; never include stored user text.
export async function staffOperationalSummary(env, access) {
  if (access.rank < 2) return {}
  const db = env.COMMUNITY_DB
  let members = null
  if (hasPermission(access, 'staff.presence')) {
    const staff = await team(env)
    const presence = await rows(db, 'SELECT member_id,availability,last_online FROM staff_presence')
    const availability = { available: 0, busy: 0, away: 0, off_shift: 0 }
    let online = 0
    let unreported = 0
    for (const m of staff) {
      const p = presence.find(p => p.member_id === m.id)
      if (p) availability[p.availability]++
      else unreported++
      if (p?.last_online && Date.parse(p.last_online) > Date.now() - PRESENCE_TTL_MS) online++
    }
    members = { total: staff.length, online, offline: staff.length - online, unreported, availability }
  }
  return {
    members,
    presence: members ? Object.entries(members.availability).map(([availability, count]) => ({ availability, count })) : [],
    tasks: hasPermission(access, 'staff.tasks') ? await rows(db, 'SELECT status,COUNT(*) AS count FROM staff_tasks GROUP BY status') : [],
    commissions: hasPermission(access, 'staff.commissions') ? await rows(db,
      "SELECT c.stage,COUNT(*) AS count FROM staff_commissions c JOIN community_tickets t ON t.id=c.ticket_id WHERE t.type='commission' GROUP BY c.stage") : [],
    tickets: hasPermission(access, 'tickets.view') ? await rows(db, 'SELECT type,status,COUNT(*) AS count FROM community_tickets GROUP BY type,status') : [],
  }
}

export async function handleStaffOperations(request, env, origin, path, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  if (!env.COMMUNITY_DB) return send({ error: 'Staff operations require the website database and migrations.' }, 503)
  const user = await deps.verifyLoginToken((request.headers.get('Authorization') || '').replace(/^Bearer /, ''), env)
  if (!user) return send({ error: 'Sign in to use staff operations.' }, 401)
  const access = await resolveAccess(user.id, env)
  if (access.rank < 2) return send({ error: 'Staff rank is required.' }, 403)
  const task = path.match(/^\/studio\/staff\/tasks\/([^/]+)$/)
  const warningAck = path.match(/^\/studio\/staff\/warnings\/([^/]+)\/acknowledge$/)
  const commission = path.match(/^\/studio\/staff\/commissions\/([^/]+)$/)
  const editor = path.match(/^\/studio\/staff\/tickets\/([^/]+)\/presence$/)
  const permission = path === '/studio/staff/operations' || warningAck ? 'staff.feature'
    : path === '/studio/staff/presence' ? 'staff.presence'
    : path === '/studio/staff/tasks' || task ? 'staff.tasks'
        : path === '/studio/staff/warnings' ? 'staff.warnings'
          : commission ? 'staff.commissions'
            : path === '/studio/staff/guide-feedback' ? 'staff.feedback' : editor ? 'tickets.view' : null
  if (!permission) return send({ error: 'Staff operation not found.' }, 404)
  if (!(permission === 'staff.feature' ? hasStaffFeature(access) : hasPermission(access, permission)) ||
      editor && request.method === 'POST' && !hasPermission(access, 'tickets.reply')) {
    return send({ error: `Permission required: ${permission}` }, 403)
  }
  const limiter = request.method === 'GET' ? env.ADMIN_READ_LIMITER : env.ADMIN_WRITE_LIMITER
  if (!limiter) return send({ error: 'Staff request limiter is not configured.' }, 503)
  if (!(await limiter.limit({ key: `admin:${user.id}` })).success) return send({ error: 'Too many staff requests. Please wait.' }, 429)
  const db = env.COMMUNITY_DB
  const now = new Date().toISOString()
  try {
    if (path === '/studio/staff/operations' && request.method === 'GET') {
      const members = await team(env)
      const presence = hasPermission(access, 'staff.presence') ? await rows(db, 'SELECT * FROM staff_presence') : []
      const warnings = await rows(db, 'SELECT * FROM staff_warnings ORDER BY created_at DESC LIMIT 500')
      return send({ actor: { id: user.id, role: access.role, roleName: access.roleName, rank: access.rank, permissions: access.permissions },
        members: members.map(m => {
          if (!hasPermission(access, 'staff.presence')) return m
          const p = presence.find(p => p.member_id === m.id)
          return { ...m, availability: p?.availability || 'off_shift', lastOnline: p?.last_online || null,
            lastDid: p?.last_did || null, lastActivityAt: p?.last_activity_at || null,
            online: Boolean(p?.last_online && Date.parse(p.last_online) > Date.now() - PRESENCE_TTL_MS) }
        }),
        tasks: hasPermission(access, 'staff.tasks') ? (await rows(db, 'SELECT * FROM staff_tasks ORDER BY updated_at DESC LIMIT 500')).map(taskView) : [],
        warnings: warnings.filter(w => w.actor_id === user.id || w.target_id === user.id ||
          hasPermission(access, 'staff.warnings') && members.some(m => m.id === w.target_id && access.rank > m.rank)).map(warningView),
        commissions: hasPermission(access, 'staff.commissions') ? (await rows(db,
          "SELECT c.*,t.title,t.status FROM staff_commissions c JOIN community_tickets t ON t.id=c.ticket_id WHERE t.type='commission' ORDER BY c.updated_at DESC LIMIT 500")).map(commissionView) : [],
        feedback: hasPermission(access, 'staff.feedback') ? (await rows(db,
          'SELECT id,guide_id AS guideId,actor_id AS actorId,message,created_at AS createdAt FROM staff_guide_feedback ORDER BY created_at DESC LIMIT 500')) : [],
      })
    }
    if (editor) {
      if (!uuid.test(editor[1])) return send({ error: 'Invalid ticket ID.' }, 400)
      const t = await db.prepare('SELECT status FROM community_tickets WHERE id=?').bind(editor[1]).first()
      if (!t) return send({ error: 'Ticket not found.' }, 404)
      if (request.method === 'GET') return send(await ticketEditors(env, editor[1], user.id))
    }
    if (!['POST', 'PUT'].includes(request.method)) return send({ error: 'Method not allowed.' }, 405)
    const raw = await request.text()
    if (raw.length > 24000) return send({ error: 'Request is too large.' }, 413)
    let body
    try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return send({ error: 'Expected an object.' }, 400)
    if (path === '/studio/staff/presence' && request.method === 'POST') {
      if (body.availability !== undefined && !['available', 'busy', 'away', 'off_shift'].includes(body.availability)) return send({ error: 'Choose a valid availability.' }, 400)
      const statements = []
      if (body.availability !== undefined) {
        statements.push(db.prepare(`INSERT INTO staff_presence(member_id,availability,last_online,last_did,last_activity_at)
          SELECT ?,?,?,'Changed availability',?
          WHERE ? != COALESCE((SELECT availability FROM staff_presence WHERE member_id=?),'off_shift')
          ON CONFLICT(member_id) DO UPDATE SET availability=excluded.availability,last_online=excluded.last_online,
          last_did=excluded.last_did,last_activity_at=excluded.last_activity_at`)
          .bind(user.id, body.availability, now, now, body.availability, user.id),
        auditStatement(db, user, access, 'staff.availability_changed', user.id, now))
      }
      statements.push(db.prepare(`INSERT INTO staff_presence(member_id,last_online) VALUES (?,?)
        ON CONFLICT(member_id) DO UPDATE SET last_online=excluded.last_online`).bind(user.id, now))
      await db.batch(statements)
      return send({ ok: true, lastOnline: now })
    }
    if (editor && request.method === 'POST') {
      if (typeof body.editing !== 'boolean') return send({ error: 'editing must be a boolean.' }, 400)
      const statement = body.editing ? db.prepare(`INSERT INTO staff_ticket_editors(ticket_id,member_id,expires_at)
        SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM community_tickets WHERE id=? AND status!='closed')
        ON CONFLICT(ticket_id,member_id) DO UPDATE SET expires_at=excluded.expires_at`)
        .bind(editor[1], user.id, new Date(Date.now() + EDITOR_TTL_MS).toISOString(), editor[1])
        : db.prepare('DELETE FROM staff_ticket_editors WHERE ticket_id=? AND member_id=?').bind(editor[1], user.id)
      await db.batch([statement, auditStatement(db, user, access, 'staff.ticket_presence', editor[1], now)])
      return send(await ticketEditors(env, editor[1], user.id))
    }
    let statement, action, target, label, resultView
    if ((path === '/studio/staff/tasks' && request.method === 'POST') || task && request.method === 'PUT') {
      if (!validText(body.title, 1, 160) || !validText(body.body, 0, 6000) ||
          !['todo','in_progress','done'].includes(body.status) || !['low','normal','high'].includes(body.priority) ||
          (body.assigneeId != null && (typeof body.assigneeId !== 'string' || !(await team(env)).some(m => m.id === body.assigneeId))) ||
          (body.dueAt != null && (typeof body.dueAt !== 'string' || !Number.isFinite(Date.parse(body.dueAt)))) ||
          (task && (!uuid.test(task[1]) || !revision(body.revision)))) return send({ error: 'Provide valid task fields and a current revision when updating.' }, 400)
      target = task?.[1] || crypto.randomUUID()
      const values = [body.title.trim(), body.body.trim(), body.assigneeId ?? null, body.status, body.priority,
        body.dueAt == null ? null : new Date(body.dueAt).toISOString()]
      statement = task ? db.prepare(`UPDATE staff_tasks SET title=?,body=?,assignee_id=?,status=?,priority=?,due_at=?,
        revision=revision+1,updated_at=? WHERE id=? AND revision=?`).bind(...values, now, target, body.revision)
        : db.prepare(`INSERT INTO staff_tasks(title,body,assignee_id,status,priority,due_at,id,created_by,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(...values, target, user.id, now, now)
      action = 'staff.task_saved'; label = 'Updated a staff task'
      resultView = async () => ({ task: taskView(await db.prepare('SELECT * FROM staff_tasks WHERE id=?').bind(target).first()) })
    } else if (path === '/studio/staff/warnings' && request.method === 'POST') {
      if (typeof body.targetId !== 'string' || !memberId.test(body.targetId) || !validText(body.reason, 3, 2000)) return send({ error: 'Choose a staff member and a reason of 3–2000 characters.' }, 400)
      const targetAccess = await resolveAccess(body.targetId, env)
      if (body.targetId === user.id || targetAccess.rank < 2 || targetAccess.rank >= access.rank) return send({ error: 'Warnings may only target staff strictly below your rank, never yourself or an equal.' }, 403)
      target = crypto.randomUUID()
      statement = db.prepare(`INSERT INTO staff_warnings(id,target_id,actor_id,reason,created_at)
        SELECT ?,people.target_id,people.actor_id,?,? FROM (SELECT ? AS target_id,? AS actor_id) people
        WHERE people.target_id!=people.actor_id
        AND ${roleRankSql(memberRoleSql(env, 'people.target_id'))} >= 2
        AND ${roleRankSql(memberRoleSql(env, 'people.target_id'))} < ${roleRankSql(memberRoleSql(env, 'people.actor_id'))}`)
        .bind(target, body.reason.trim(), now, body.targetId, user.id)
      action = 'staff.warning_created'; label = 'Issued a staff warning'
      resultView = async () => ({ warning: warningView(await db.prepare('SELECT * FROM staff_warnings WHERE id=?').bind(target).first()) })
    } else if (warningAck && request.method === 'POST') {
      if (!uuid.test(warningAck[1])) return send({ error: 'Invalid warning ID.' }, 400)
      const warning = await db.prepare('SELECT * FROM staff_warnings WHERE id=?').bind(warningAck[1]).first()
      if (!warning || warning.target_id !== user.id) return send({ error: 'Only the warning target may acknowledge it.' }, 403)
      if (warning.acknowledged_at) return send({ warning: warningView(warning) })
      target = warning.id
      statement = db.prepare('UPDATE staff_warnings SET acknowledged_at=? WHERE id=? AND target_id=? AND acknowledged_at IS NULL').bind(now, target, user.id)
      action = 'staff.warning_acknowledged'; label = 'Acknowledged a staff warning'
    } else if (commission && request.method === 'PUT') {
      if (!uuid.test(commission[1]) || !revision(body.revision) || !['enquiry','scoping','quoted','development','review','delivered','cancelled'].includes(body.stage) ||
          !validText(body.scope, 0, 6000) || !validText(body.acceptanceCriteria, 0, 6000) || !Array.isArray(body.milestones) ||
          body.milestones.length > 20 || body.milestones.some(v => !validText(v, 1, 240))) return send({ error: 'Provide a valid stage, scope, acceptance criteria, up to 20 text milestones, and current revision.' }, 400)
      target = commission[1]
      const ticket = await db.prepare('SELECT type,owner_name FROM community_tickets WHERE id=?').bind(target).first()
      if (ticket?.type !== 'commission') return send({ error: 'Commission ticket not found.' }, 404)
      statement = db.prepare(`UPDATE staff_commissions SET stage=?,scope=?,acceptance_criteria=?,milestones=?,
        revision=revision+1,updated_at=? WHERE ticket_id=? AND revision=?
        AND EXISTS (SELECT 1 FROM community_tickets WHERE id=? AND type='commission')`)
        .bind(body.stage, body.scope.trim(), body.acceptanceCriteria.trim(), JSON.stringify(body.milestones.map(v => v.trim())), now, target, body.revision, target)
      action = 'staff.commission_saved'; label = `Updated ${activityCustomerName(ticket.owner_name)}'s commission`
      resultView = async () => ({ commission: commissionView(await db.prepare('SELECT c.*,t.title,t.status FROM staff_commissions c JOIN community_tickets t ON t.id=c.ticket_id WHERE c.ticket_id=?').bind(target).first()) })
    } else if (path === '/studio/staff/guide-feedback' && request.method === 'POST') {
      if (typeof body.guideId !== 'string' || !staffGuideIds.has(body.guideId) || !validText(body.message, 3, 2000)) return send({ error: 'Choose a known staff guide and a message of 3–2000 characters.' }, 400)
      target = crypto.randomUUID()
      statement = db.prepare('INSERT INTO staff_guide_feedback(id,guide_id,actor_id,message,created_at) VALUES (?,?,?,?,?)').bind(target, body.guideId, user.id, body.message.trim(), now)
      action = 'staff.guide_feedback'; label = 'Submitted guide feedback'
    } else return send({ error: 'Staff operation or method not found.' }, 404)
    const results = await db.batch([statement, auditStatement(db, user, access, action, target, now),
      db.prepare(`INSERT INTO staff_presence(member_id,last_online,last_did,last_activity_at)
        SELECT ?,?,?,? WHERE changes() = 1 ON CONFLICT(member_id) DO UPDATE SET last_online=excluded.last_online,
        last_did=excluded.last_did,last_activity_at=excluded.last_activity_at`).bind(user.id, now, label, now)])
    if (!results[0].meta?.changes) return send({ error: 'This item changed or no longer exists. Refresh before saving.' }, 409)
    return send(resultView ? await resultView() : { ok: true }, request.method === 'POST' && !warningAck ? 201 : 200)
  } catch (error) {
    console.error('Staff operations failed:', error instanceof Error ? error.name : 'Unknown error')
    return send({ error: 'Staff operations are temporarily unavailable. Check the database migrations.' }, 503)
  }
}
