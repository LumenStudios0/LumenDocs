import { loyaltyStatus } from './loyalty.js'
import { memberRole } from './access-control.js'
import { ROLES } from '../shared/permissions.mjs'

const ids = /^\d{5,22}$/
const tierNames = { spark: 'Spark', radiance: 'Radiance', nova: 'Nova', elite: 'Lumen Elite' }
const staffBadges = [
  { id: 'staff', name: 'Staff', rank: 2 },
  { id: 'developer', name: 'Developer', rank: 3 },
  { id: 'studio_lead', name: 'Studio Lead', rank: 4 },
  { id: 'owner', name: 'Owner', rank: 5 },
]
const profileSelect = 'SELECT p.*, m.role_id FROM member_profiles p LEFT JOIN website_members m ON m.discord_id=p.user_id'
const fields = { bio: 600, pronouns: 40, status: 80, displayName: 60, favoritePlugin: 80 }
function link(value) {
  if (value === '') return true
  if (typeof value !== 'string' || value.length > 500 || /[\x00-\x20]/.test(value)) return false
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password } catch { return false }
}
function view(row, env, owner = false) {
  const fresh = row.tier_checked_at && Date.now() - Date.parse(row.tier_checked_at) < 86400000
  const tier = fresh && tierNames[row.tier] ? { id: row.tier, name: tierNames[row.tier] } : null
  const role = ROLES.find(role => role.id === memberRole(row.user_id, row.role_id, env))
  if (!role) throw new Error('Invalid member role for profile badges')
  const tierEntries = Object.entries(tierNames)
  const tierIndex = role.id === 'owner' ? tierEntries.length - 1 : tierEntries.findIndex(([id]) => id === tier?.id)
  const availableBadges = [
    ...tierEntries.slice(0, tierIndex + 1).map(([id, name]) => ({ id, name })),
    ...staffBadges.filter(badge => badge.rank <= role.rank).map(({ id, name }) => ({ id, name })),
  ]
  const defaultIds = [tier?.id, staffBadges.find(badge => badge.rank === role.rank)?.id].filter(Boolean)
  const selected = row.badge_selection === null ? defaultIds : JSON.parse(row.badge_selection)
  if (!Array.isArray(selected) || selected.some(id => typeof id !== 'string')) throw new Error('Invalid saved profile badges')
  const badges = availableBadges.filter(badge => selected.includes(badge.id))
  return {
    id: row.user_id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url,
    bio: row.bio, pronouns: row.pronouns, status: row.status, accent: row.accent, banner: row.banner,
    website: row.website, showcase: row.showcase, favoritePlugin: row.favorite_plugin,
    tier, badges,
    tierCheckedAt: row.tier_checked_at, joinedAt: row.created_at,
    ...(owner ? { public: Boolean(row.public), revision: row.revision, availableBadges } : {}),
  }
}
export async function messageProfiles(db, userIds, env = {}) {
  const unique = [...new Set(userIds.filter(id => typeof id === 'string' && ids.test(id)))]
  if (!unique.length) return new Map()
  const rows = (await db.prepare(`${profileSelect} WHERE p.public = 1 AND p.user_id IN (SELECT value FROM json_each(?))`)
    .bind(JSON.stringify(unique)).all()).results || []
  return new Map(rows.map(row => {
    const profile = view(row, env)
    return [row.user_id, { id: row.user_id, displayName: row.display_name, accent: row.accent, avatarUrl: row.avatar_url,
      tier: profile.tier, badges: profile.badges }]
  }))
}
export async function handleProfiles(request, env, origin, path, deps) {
  const send = (body, status = 200) => deps.respond(body, status, origin)
  if (!env.COMMUNITY_DB) return send({ error: 'Profile storage is unavailable.' }, 503)
  const db = env.COMMUNITY_DB
  const mine = path === '/studio/profiles/me'
  const match = path.match(/^\/studio\/profiles\/(\d{5,22})$/)
  if (path !== '/studio/profiles' && !mine && !match) return send({ error: 'Profile not found.' }, 404)
  if (request.method !== 'GET' && !(mine && request.method === 'PUT')) return send({ error: 'Method not allowed.' }, 405)
  let user
  if (mine) {
    const auth = request.headers.get('Authorization') || ''
    user = await deps.verifyLoginToken(auth.startsWith('Bearer ') ? auth.slice(7) : '', env)
    if (!user || !ids.test(user.id)) return send({ error: 'Sign in with Discord to edit your profile.' }, 401)
  }
  const limiter = request.method === 'PUT' ? env.ADMIN_WRITE_LIMITER : env.ADMIN_READ_LIMITER
  if (!limiter) return send({ error: 'Profile rate limiting is unavailable.' }, 503)
  if (!(await limiter.limit({ key: `profiles:${user?.id || request.headers.get('CF-Connecting-IP') || 'public'}` })).success) return send({ error: 'Too many profile requests. Please wait.' }, 429)
  try {
    if (path === '/studio/profiles') {
      const url = new URL(request.url)
      const q = (url.searchParams.get('q') || '').trim().slice(0, 60)
      const page = Math.max(1, Math.min(10000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1))
      const term = `%${q.replace(/[\\%_]/g, char => `\\${char}`)}%`
      const where = "p.public = 1 AND (p.display_name LIKE ? ESCAPE '\\' OR p.username LIKE ? ESCAPE '\\' OR p.user_id = ?)"
      const total = await db.prepare(`SELECT COUNT(*) AS n FROM member_profiles p WHERE ${where}`).bind(term, term, q).first()
      const rows = await db.prepare(`${profileSelect} WHERE ${where} ORDER BY p.display_name COLLATE NOCASE,p.user_id LIMIT 20 OFFSET ?`)
        .bind(term, term, q, (page - 1) * 20).all()
      return send({ items: (rows.results || []).map(row => view(row, env)), total: total.n, page, pageSize: 20 })
    }
    if (mine) {
      const now = new Date().toISOString()
      const avatar = typeof user.avatarUrl === 'string' && /^https:\/\/cdn\.discordapp\.com\/(?:avatars|embed\/avatars)\//.test(user.avatarUrl) ? user.avatarUrl : ''
      await db.prepare(`INSERT INTO member_profiles(user_id,username,display_name,avatar_url,created_at,updated_at,public)
        VALUES (?,?,?,?,?,?,1) ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,avatar_url=excluded.avatar_url`)
        .bind(user.id, user.username || user.id, user.globalName || user.username || user.id, avatar, now, now).run()
      if (request.method === 'PUT') {
        const raw = await request.text()
        if (raw.length > 5000) return send({ error: 'Profile is too large.' }, 413)
        let body
        try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
        if (!body || Object.entries(fields).some(([key, max]) => typeof body[key] !== 'string' || body[key].trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body[key])) ||
            !body.displayName.trim() || !/^#[0-9a-fA-F]{6}$/.test(body.accent || '') || !/^#[0-9a-fA-F]{6}$/.test(body.banner || '') ||
            !link(body.website) || !link(body.showcase) || body.public !== true || !Number.isInteger(body.revision) || body.revision < 0 ||
            body.badgeIds !== undefined && (!Array.isArray(body.badgeIds) || body.badgeIds.length > 8 ||
              body.badgeIds.some(id => typeof id !== 'string') || new Set(body.badgeIds).size !== body.badgeIds.length) ||
            Object.keys(body).some(key => ![...Object.keys(fields), 'accent', 'banner', 'website', 'showcase', 'public', 'revision', 'badgeIds'].includes(key))) {
          return send({ error: 'Profiles are public. Use a display name, supported text lengths, hex colors, HTTPS links and the current revision.' }, 400)
        }
        const current = await db.prepare(`${profileSelect} WHERE p.user_id=?`).bind(user.id).first()
        const available = view(current, env, true).availableBadges
        if (body.badgeIds?.some(id => !available.some(badge => badge.id === id))) {
          return send({ error: 'Choose only badges unlocked by your current tier or staff rank. Refresh if your access changed.' }, 403)
        }
        const result = await db.prepare(`UPDATE member_profiles SET display_name=?,bio=?,pronouns=?,status=?,accent=?,banner=?,
          website=?,showcase=?,favorite_plugin=?,public=?,updated_at=?,badge_selection=?,revision=revision+1 WHERE user_id=? AND revision=?`)
          .bind(body.displayName.trim(), body.bio.trim(), body.pronouns.trim(), body.status.trim(), body.accent, body.banner,
            body.website, body.showcase, body.favoritePlugin.trim(), Number(body.public), now,
            body.badgeIds === undefined ? current.badge_selection : JSON.stringify(body.badgeIds), user.id, body.revision).run()
        if (!result.meta.changes) return send({ error: 'Your profile changed elsewhere. Refresh and compare before saving again.' }, 409)
        return send({ profile: view(await db.prepare(`${profileSelect} WHERE p.user_id=?`).bind(user.id).first(), env, true) })
      }
      let warning = ''
      try {
        const status = await loyaltyStatus(env, user.id)
        await db.prepare('UPDATE member_profiles SET tier=?,tier_checked_at=? WHERE user_id=?').bind(status.tier?.id || null, now, user.id).run()
      } catch (error) {
        console.error('Profile badge verification failed:', error instanceof Error ? error.name : 'Unknown error')
        warning = 'Loyalty badge could not be refreshed. Previously verified badges expire after 24 hours.'
      }
      return send({ profile: view(await db.prepare(`${profileSelect} WHERE p.user_id=?`).bind(user.id).first(), env, true), warning })
    }
    const row = await db.prepare(`${profileSelect} WHERE p.user_id=? AND p.public=1`).bind(match[1]).first()
    return row ? send({ profile: view(row, env) }) : send({ error: 'This profile has not been created yet.' }, 404)
  } catch (error) {
    console.error('Profile request failed:', error instanceof Error ? error.name : 'Unknown error')
    return send({ error: 'Profiles are temporarily unavailable. Refresh before retrying a save.' }, 503)
  }
}
