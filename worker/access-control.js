import { PERMISSIONS, ROLES } from '../shared/permissions.mjs'

export const OWNER_DISCORD_ID = '1400375985211441242'
const LEAD_DISCORD_ID = '1012053634911064114'
const permissionIds = new Set(PERMISSIONS.map(item => item.id))
const roleById = id => ROLES.find(role => role.id === id)
export const hasPermission = (access, permission) => access.permissions.includes(permission)

export function adminPermission(path, method) {
  if (path === '/admin/users' && method === 'GET') return 'customers.view'
  if (/^\/admin\/users\/\d{5,22}$/.test(path)) return method === 'GET' ? 'customers.view' : method === 'DELETE' ? 'customers.delete' : null
  const control = path.match(/^\/admin\/users\/\d{5,22}\/(ban|unban|hold|release|verification-request|verify)$/)
  if (control && method === 'POST') return ['verify', 'verification-request'].includes(control[1]) ? 'customers.verify' : 'customers.restrict'
  if (path === '/admin/licenses') return method === 'GET' ? 'customers.view' : method === 'POST' ? 'licenses.grant' : null
  if (path === '/admin/plugins' || path === '/admin/products') {
    return method === 'GET' ? 'plugins.view' : method === 'POST' ? path.endsWith('/plugins') ? 'plugins.register' : 'products.create' : null
  }
  if (/^\/admin\/products\/[A-Za-z0-9_.-]{1,64}\/plugins\/[A-Za-z0-9_.-]{1,64}$/.test(path)) {
    return method === 'POST' ? 'products.link' : method === 'DELETE' ? 'products.unlink' : null
  }
  const registry = path.match(/^\/admin\/(products|plugins)\/[A-Za-z0-9_.-]{1,64}$/)
  if (registry) return method === 'DELETE' ? `${registry[1]}.delete` : method === 'PATCH' ? `${registry[1]}.manage` : null
  if (/^\/admin\/licenses\/[0-9a-f-]{36}$/.test(path) && method === 'GET') return 'customers.view'
  if (/^\/admin\/licenses\/[0-9a-f-]{36}\/(revoke|suspend|activate)$/.test(path) && method === 'POST') return 'licenses.status'
  if (/^\/admin\/licenses\/[0-9a-f-]{36}\/ips$/.test(path) && ['POST', 'DELETE'].includes(method)) return 'licenses.ips'
  return path === '/admin/audit' && method === 'GET' ? 'audit.view' : null
}

export function bootstrapRole(id, env) {
  if (id === OWNER_DISCORD_ID) return 'owner'
  if (id === LEAD_DISCORD_ID) return 'studio_lead'
  return (env.ADMIN_DISCORD_IDS || '').split(',').map(value => value.trim()).includes(id) ? 'support_team' : 'guest'
}

export async function rolePolicies(env) {
  const rows = env.COMMUNITY_DB
    ? (await env.COMMUNITY_DB.prepare('SELECT * FROM website_role_permissions').all()).results || [] : []
  return ROLES.map(role => {
    const saved = rows.find(row => row.role_id === role.id)
    const permissions = saved ? JSON.parse(saved.permissions) : role.permissions
    if (!Array.isArray(permissions) || permissions.some(id => !permissionIds.has(id))) throw new Error('Invalid saved role permissions')
    return { ...role, permissions: [...permissions], revision: saved?.revision || 0 }
  })
}

export async function resolveAccess(id, env) {
  const member = env.COMMUNITY_DB
    ? await env.COMMUNITY_DB.prepare('SELECT role_id, revision FROM website_members WHERE discord_id = ?').bind(id).first() : null
  const roleId = id === OWNER_DISCORD_ID ? 'owner' : member?.role_id || bootstrapRole(id, env)
  const policy = (await rolePolicies(env)).find(role => role.id === roleId)
  if (!policy) throw new Error('Invalid saved member role')
  return { role: roleId, roleName: policy.name, rank: policy.rank, permissions: policy.permissions,
    revision: member?.revision || 0, accessConfigured: Boolean(env.COMMUNITY_DB) }
}

export async function getAdminRole(id, env) {
  const access = await resolveAccess(id, env)
  return hasPermission(access, 'dashboard.view') ? access.role : null
}

export async function rememberMember(user, env) {
  if (!env.COMMUNITY_DB) return
  const now = new Date().toISOString()
  await env.COMMUNITY_DB.prepare(
    `INSERT INTO website_members(discord_id, username, display_name, last_seen_at, registered_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(discord_id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name,
       last_seen_at=excluded.last_seen_at, registered_at=COALESCE(website_members.registered_at, excluded.registered_at)`,
  ).bind(user.id, user.username, user.globalName || user.username, now, now).run()
}

export async function getStaffMembers(env) {
  const members = env.COMMUNITY_DB
    ? (await env.COMMUNITY_DB.prepare('SELECT discord_id, display_name, role_id FROM website_members').all()).results || [] : []
  const ids = [...new Set([OWNER_DISCORD_ID, LEAD_DISCORD_ID,
    ...(env.ADMIN_DISCORD_IDS || '').split(',').map(id => id.trim()).filter(id => /^\d{5,22}$/.test(id)), ...members.map(row => row.discord_id)])]
  const policies = await rolePolicies(env)
  return ids.filter(id => {
    const role = id === OWNER_DISCORD_ID ? 'owner' : members.find(row => row.discord_id === id)?.role_id || bootstrapRole(id, env)
    return policies.find(item => item.id === role)?.permissions.includes('tickets.view')
  }).map(id => ({ id, name: members.find(row => row.discord_id === id)?.display_name ||
    (id === OWNER_DISCORD_ID ? 'Studio owner' : id === LEAD_DISCORD_ID ? 'Studio lead' : 'Studio staff') }))
}

export const DEFAULT_SITE_SETTINGS = {
  supportOpen: true,
  supportClosedMessage: 'New support requests are paused. Please try again later.',
  forumOpen: true,
  forumClosedMessage: 'The community forum is temporarily read-only.',
}
export async function siteSettings(env) {
  if (!env.COMMUNITY_DB) throw new Error('Website settings require COMMUNITY_DB')
  const row = await env.COMMUNITY_DB.prepare('SELECT value, revision FROM website_settings WHERE id = 1').first()
  return { settings: row ? JSON.parse(row.value) : { ...DEFAULT_SITE_SETTINGS }, revision: row?.revision || 0 }
}

function auditStatement(db, user, access, action, target, details) {
  return db.prepare(
    `INSERT INTO website_access_audit(id, actor_id, actor_role, action, target, details, created_at)
     SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`,
  ).bind(crypto.randomUUID(), user.id, access.role, action, target, JSON.stringify(details), new Date().toISOString())
}

export async function websiteAdminApi(request, env, path, user, access, respond, origin) {
  const send = (payload, status = 200) => respond(payload, status, origin)
  const allows = permission => hasPermission(access, permission)
  if (!env.COMMUNITY_DB) return send({ error: 'Website roles and settings require the community database and migrations.' }, 503)
  const db = env.COMMUNITY_DB
  const url = new URL(request.url)
  const roleMatch = path.match(/^\/admin\/website\/roles\/([a-z_]+)$/)
  const memberMatch = path.match(/^\/admin\/website\/members\/(\d{5,22})\/role$/)
  const isRead = request.method === 'GET'
  const permission = path === '/admin/website/access' ? null
    : path === '/admin/website/members' || memberMatch ? 'roles.assign'
      : roleMatch ? 'settings.roles'
        : path === '/admin/website/settings' ? (isRead ? 'settings.view' : 'settings.site')
          : path === '/admin/website/audit' ? 'settings.audit' : null
  if (!permission && path !== '/admin/website/access') return send({ error: 'Website route not found' }, 404)
  if (permission && !allows(permission) || path.includes('/website/roles/') && !allows('settings.view') ||
      path === '/admin/website/settings' && !allows('settings.view') || path === '/admin/website/audit' && !allows('settings.view') ||
      path === '/admin/website/access' && !allows('roles.assign') && !allows('settings.view')) {
    return send({ error: 'You do not have permission to manage this website area.' }, 403)
  }
  if (isRead && path === '/admin/website/access') {
    return send({ actor: access, roles: await rolePolicies(env), permissions: PERMISSIONS })
  }
  if (isRead && (path === '/admin/website/members' || path === '/admin/website/audit')) {
    const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1))
    const query = (url.searchParams.get('query') || '').trim().slice(0, 120)
    const members = path.endsWith('/members')
    const table = members ? 'website_members' : 'website_access_audit'
    const where = members && query ? ' WHERE discord_id = ? OR instr(lower(username), lower(?)) > 0 OR instr(lower(display_name), lower(?)) > 0' : ''
    const values = where ? [query, query, query] : []
    const count = await db.prepare(`SELECT COUNT(*) AS total FROM ${table}${where}`).bind(...values).first()
    const rows = await db.prepare(`SELECT * FROM ${table}${where} ORDER BY ${members ? 'last_seen_at' : 'created_at'} DESC, ${members ? 'discord_id' : 'id'} DESC LIMIT 50 OFFSET ?`).bind(...values, (page - 1) * 50).all()
    const policies = await rolePolicies(env)
    return send({ items: (rows.results || []).map(row => members ? {
      discordId: row.discord_id, username: row.username, displayName: row.display_name,
      role: row.discord_id === OWNER_DISCORD_ID ? 'owner' : row.role_id || bootstrapRole(row.discord_id, env),
      revision: row.revision, lastSeenAt: row.last_seen_at, registeredAt: row.registered_at,
      protected: row.discord_id === OWNER_DISCORD_ID,
      rank: policies.find(role => role.id === (row.discord_id === OWNER_DISCORD_ID ? 'owner' : row.role_id || bootstrapRole(row.discord_id, env))).rank,
    } : { ...row, details: JSON.parse(row.details) }), page, pageSize: 50, total: count.total })
  }
  if (isRead && path === '/admin/website/settings') return send(await siteSettings(env))
  if (request.method !== 'PUT' || !(roleMatch || memberMatch || path === '/admin/website/settings')) {
    return send({ error: 'Website route or method not allowed' }, 404)
  }
  const text = await request.text()
  if (text.length > 12000) return send({ error: 'Request is too large' }, 413)
  let body
  try { body = JSON.parse(text) } catch { return send({ error: 'Expected a JSON request' }, 400) }
  if (!body || !Number.isInteger(body.revision) || body.revision < 0) return send({ error: 'A current revision is required. Refresh first.' }, 400)
  let statements
  let changeIndex = 0
  if (memberMatch) {
    const id = memberMatch[1]
    const target = await resolveAccess(id, env)
    const nextRole = roleById(body.role)
    if (!nextRole) return send({ error: 'Choose a preset role.' }, 400)
    if (id === OWNER_DISCORD_ID || (access.role !== 'owner' && (id === user.id || target.rank >= access.rank || nextRole.rank >= access.rank))) {
      return send({ error: 'You may only change users and assign roles strictly below your own. The original owner is protected.' }, 403)
    }
    const policy = (await rolePolicies(env)).find(role => role.id === nextRole.id)
    if (access.role !== 'owner' && policy.permissions.some(id => !allows(id))) return send({ error: 'You cannot delegate a role with permissions you do not have.' }, 403)
    if (target.revision !== body.revision) return send({ error: 'This user changed. Refresh before saving.' }, 409)
    changeIndex = 1
    statements = [
      db.prepare('INSERT OR IGNORE INTO website_members(discord_id) VALUES (?)').bind(id),
      db.prepare('UPDATE website_members SET role_id = ?, revision = revision + 1 WHERE discord_id = ? AND revision = ?').bind(nextRole.id, id, body.revision),
      auditStatement(db, user, access, 'member.role_changed', id, { before: target.role, after: nextRole.id }),
    ]
  } else if (roleMatch) {
    const role = roleById(roleMatch[1])
    if (!role) return send({ error: 'Role not found' }, 404)
    if (role.id === 'owner' || access.role !== 'owner' && role.rank >= access.rank) return send({ error: 'Only lower role permissions can be edited. Owner permissions are fixed.' }, 403)
    if (!Array.isArray(body.permissions) || body.permissions.some(id => !permissionIds.has(id))) return send({ error: 'Choose valid preset permissions.' }, 400)
    const permissions = [...new Set(body.permissions)].sort()
    if (access.role !== 'owner' && permissions.some(id => !allows(id))) return send({ error: 'You cannot delegate permissions you do not have.' }, 403)
    statements = [
      db.prepare(`INSERT INTO website_role_permissions(role_id, permissions, revision)
        SELECT ?, ?, 1 WHERE ? = 0 OR EXISTS (SELECT 1 FROM website_role_permissions WHERE role_id = ? AND revision = ?)
        ON CONFLICT(role_id) DO UPDATE SET permissions=excluded.permissions, revision=website_role_permissions.revision+1
        WHERE website_role_permissions.revision = ?`).bind(role.id, JSON.stringify(permissions), body.revision, role.id, body.revision, body.revision),
      auditStatement(db, user, access, 'role.permissions_changed', role.id, { permissions }),
    ]
  } else {
    const settings = body.settings
    if (!settings || typeof settings.supportOpen !== 'boolean' || typeof settings.forumOpen !== 'boolean' ||
        ['supportClosedMessage', 'forumClosedMessage'].some(key => typeof settings[key] !== 'string' || !settings[key].trim() || settings[key].length > 240)) {
      return send({ error: 'Supply both posting switches and messages between 1 and 240 characters.' }, 400)
    }
    const value = { supportOpen: settings.supportOpen, forumOpen: settings.forumOpen,
      supportClosedMessage: settings.supportClosedMessage.trim(), forumClosedMessage: settings.forumClosedMessage.trim() }
    statements = [
      db.prepare(`INSERT INTO website_settings(id, value, revision)
        SELECT 1, ?, 1 WHERE ? = 0 OR EXISTS (SELECT 1 FROM website_settings WHERE id = 1 AND revision = ?)
        ON CONFLICT(id) DO UPDATE SET value=excluded.value, revision=website_settings.revision+1
        WHERE website_settings.revision = ?`).bind(JSON.stringify(value), body.revision, body.revision, body.revision),
      auditStatement(db, user, access, 'site.settings_changed', 'website', value),
    ]
  }
  const result = await db.batch(statements)
  if (!result[changeIndex].meta?.changes) return send({ error: 'Another administrator saved a change. Refresh before retrying.' }, 409)
  return send({ saved: true })
}
