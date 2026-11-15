import { loyaltyStatus } from './loyalty.js'
import { memberRole } from './access-control.js'
import { ROLES } from '../shared/permissions.mjs'
import { backgrounds, frames, decorations, achievements } from '../shared/profile-cosmetics.mjs'

const ids = /^\d{5,22}$/
const tierNames = { spark: 'Spark', radiance: 'Radiance', nova: 'Nova', elite: 'Lumen Elite' }
const staffBadges = [
  { id: 'jr_staff', name: 'Jr Staff', rank: 2 },
  { id: 'staff', name: 'Staff', rank: 3 },
  { id: 'sr_staff', name: 'Sr Staff', rank: 4 },
  { id: 'developer', name: 'Developer', rank: 5 },
  { id: 'studio_lead', name: 'Studio Lead', rank: 6 },
  { id: 'owner', name: 'Owner', rank: 7 },
]
const profileSelect = `SELECT p.*, m.role_id,
  EXISTS(SELECT 1 FROM community_threads t WHERE t.author_id=p.user_id AND t.hidden=0) AS has_thread,
  EXISTS(SELECT 1 FROM community_thread_posts r JOIN community_threads t ON t.id=r.thread_id
    WHERE r.author_id=p.user_id AND r.hidden=0 AND t.hidden=0) AS has_reply
  FROM member_profiles p LEFT JOIN website_members m ON m.discord_id=p.user_id`
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
  const savedAppearance = JSON.parse(row.appearance)
  const servers = JSON.parse(row.servers)
  const cosmeticAccess = { backgrounds: tierIndex >= 0, frames: tierIndex >= 0, decorations: tierIndex >= 1 }
  const appearance = {
    background: cosmeticAccess.backgrounds ? savedAppearance.background : 'none',
    frame: cosmeticAccess.frames ? savedAppearance.frame : 'none',
    decoration: cosmeticAccess.decorations ? savedAppearance.decoration : 'none',
    ...(savedAppearance.colors ? { colors: cosmeticAccess.backgrounds ? savedAppearance.colors : null } : {}),
  }
  const earnedIds = [
    ...(row.bio.trim().length >= 40 ? ['introduced'] : []),
    ...(servers.length ? ['server_builder'] : []),
    ...(row.has_thread ? ['conversation'] : []),
    ...(row.has_reply ? ['contributor'] : []),
    ...(Date.now() - Date.parse(row.created_at) >= 30 * 86400000 ? ['regular'] : []),
  ]
  const earned = achievements.filter(badge => earnedIds.includes(badge.id))
  const availableBadges = [
    ...tierEntries.slice(0, tierIndex + 1).map(([id, name]) => ({ id, name })),
    ...staffBadges.filter(badge => badge.rank <= role.rank).map(({ id, name }) => ({ id, name })),
    ...earned.map(({ id, name }) => ({ id, name })),
  ]
  const defaultIds = [tier?.id, staffBadges.find(badge => badge.rank === role.rank)?.id].filter(Boolean)
  const selected = row.badge_selection === null ? defaultIds : JSON.parse(row.badge_selection)
  if (!Array.isArray(selected) || selected.some(id => typeof id !== 'string')) throw new Error('Invalid saved profile badges')
  const badges = availableBadges.filter(badge => selected.includes(badge.id))
  return {
    id: row.user_id, username: row.username, displayName: row.display_name, avatarUrl: row.avatar_url,
    bio: row.bio, pronouns: row.pronouns, status: row.status, accent: row.accent, banner: row.banner,
    website: row.website, showcase: row.showcase, favoritePlugin: row.favorite_plugin,
    tier, badges, appearance, servers, bannerVersion: row.banner_version,
    tierCheckedAt: row.tier_checked_at, joinedAt: row.created_at,
    ...(owner ? { public: Boolean(row.public), revision: row.revision, availableBadges, cosmeticAccess,
      savedAppearance,
      achievements: achievements.map(badge => ({ ...badge, earned: earnedIds.includes(badge.id) })) } : {}),
  }
}

function validServers(servers) {
  const limits = { name: 60, description: 400, javaAddress: 100, bedrockAddress: 100, version: 40, gamemodes: 100, plugins: 120 }
  const links = ['website', 'discord', 'trailer', 'logo']
  const keys = [...Object.keys(limits), ...links, 'screenshots', 'featured']
  return Array.isArray(servers) && servers.length <= 3 && servers.every(server =>
    server && typeof server === 'object' && !Array.isArray(server) &&
    Object.keys(server).every(key => keys.includes(key)) &&
    Object.entries(limits).every(([key, max]) => typeof server[key] === 'string' && server[key].length <= max &&
      !/[\x00-\x1f\x7f]/.test(server[key])) && server.name.trim() &&
    ['javaAddress', 'bedrockAddress'].every(key => validAddress(server[key])) &&
    links.every(key => link(server[key])) && typeof server.featured === 'boolean' &&
    Array.isArray(server.screenshots) && server.screenshots.length <= 4 &&
    server.screenshots.every(image => image && Object.keys(image).every(key => ['url', 'alt'].includes(key)) &&
      typeof image.alt === 'string' && image.alt.length <= 120 && typeof image.url === 'string' && image.url && link(image.url))
  ) && servers.filter(server => server.featured).length <= 1
}

function validAddress(address) {
  if (!address) return true
  if (typeof address !== 'string' || !/^(?:[a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\])(?::[0-9]{1,5})?$/.test(address)) return false
  try {
    const url = new URL(`https://${address}`)
    const port = address.match(/:([0-9]+)$/)?.[1]
    return Boolean(url.hostname) && (!port || Number(port) >= 1 && Number(port) <= 65535)
  } catch { return false }
}

function validBanner(data) {
  if (data === null) return true
  if (typeof data !== 'string' || data.length > 350000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data) || data.length % 4) return false
  const bytes = Uint8Array.from(atob(data), c => c.charCodeAt(0))
  if (bytes.length < 30 || bytes.length > 256 * 1024) return false
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end))
  const view = new DataView(bytes.buffer)
  if (text(0, 4) !== 'RIFF' || text(8, 12) !== 'WEBP' || view.getUint32(4, true) + 8 !== bytes.length) return false
  let offset = 12, imageChunks = 0
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false
    const chunk = text(offset, offset + 4), size = view.getUint32(offset + 4, true)
    if (!['VP8X', 'ICCP', 'ALPH', 'VP8 ', 'VP8L'].includes(chunk) || size === 0 ||
      offset + 8 + size + (size % 2) > bytes.length) return false
    if (chunk === 'VP8 ' || chunk === 'VP8L') imageChunks++
    offset += 8 + size + (size % 2)
  }
  if (imageChunks !== 1) return false
  const kind = text(12, 16)
  let width, height
  if (kind === 'VP8X') {
    if (view.getUint32(16, true) !== 10 || bytes[20] & 2) return false
    width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16)
    height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)
  } else if (kind === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    width = view.getUint16(26, true) & 0x3fff; height = view.getUint16(28, true) & 0x3fff
  } else if (kind === 'VP8L' && bytes[20] === 0x2f) {
    const bits = view.getUint32(21, true)
    width = (bits & 0x3fff) + 1; height = ((bits >>> 14) & 0x3fff) + 1
  } else return false
  return width > 0 && height > 0 && width <= 1200 && height <= 400
}

async function boundedText(request, max) {
  const reader = request.body?.getReader()
  if (!reader) return ''
  const parts = []; let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > max) return null
      parts.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return new TextDecoder().decode(bytes)
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
  const media = path.match(/^\/studio\/profiles\/media\/(\d{5,22})$/)
  if (path !== '/studio/profiles' && !mine && !match && !media) return send({ error: 'Profile not found.' }, 404)
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
    if (media) {
      const row = await db.prepare(`SELECT b.data FROM member_profile_banners b JOIN member_profiles p ON p.user_id=b.user_id
        WHERE b.user_id=? AND p.public=1 AND p.banner_version IS NOT NULL`).bind(media[1]).first()
      if (!row?.data) return send({ error: 'Banner not found.' }, 404)
      const headers = new Headers(deps.respond({}, 200, origin).headers)
      headers.set('Content-Type', 'image/webp')
      headers.set('Cache-Control', 'no-store')
      headers.set('X-Content-Type-Options', 'nosniff')
      headers.set('Content-Security-Policy', "default-src 'none'; sandbox")
      return new Response(Uint8Array.from(atob(row.data), c => c.charCodeAt(0)), { headers })
    }
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
        const raw = await boundedText(request, 400000)
        if (raw === null) return send({ error: 'Profile is too large. Banner images must be 256 KiB or smaller.' }, 413)
        let body
        try { body = JSON.parse(raw) } catch { return send({ error: 'Expected JSON.' }, 400) }
        if (!body || Object.entries(fields).some(([key, max]) => typeof body[key] !== 'string' || body[key].trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body[key])) ||
            !body.displayName.trim() || !/^#[0-9a-fA-F]{6}$/.test(body.accent || '') || !/^#[0-9a-fA-F]{6}$/.test(body.banner || '') ||
            !link(body.website) || !link(body.showcase) || body.public !== true || !Number.isInteger(body.revision) || body.revision < 0 ||
            body.badgeIds !== undefined && (!Array.isArray(body.badgeIds) || body.badgeIds.length > 15 ||
              body.badgeIds.some(id => typeof id !== 'string') || new Set(body.badgeIds).size !== body.badgeIds.length) ||
            body.servers !== undefined && !validServers(body.servers) ||
            body.bannerImage !== undefined && !validBanner(body.bannerImage) ||
            Object.keys(body).some(key => ![...Object.keys(fields), 'accent', 'banner', 'website', 'showcase', 'public', 'revision', 'badgeIds', 'appearance', 'servers', 'bannerImage'].includes(key))) {
          return send({ error: 'Profiles are public. Use a display name, supported text lengths, hex colors, HTTPS links and the current revision.' }, 400)
        }
        const current = await db.prepare(`${profileSelect} WHERE p.user_id=?`).bind(user.id).first()
        const currentView = view(current, env, true)
        const available = currentView.availableBadges
        const saved = JSON.parse(current.appearance)
        const appearance = body.appearance === undefined ? saved
          : { ...body.appearance, ...(body.appearance?.colors === undefined && saved.colors ? { colors: saved.colors } : {}) }
        if (body.appearance !== undefined && (!body.appearance || typeof body.appearance !== 'object' || Array.isArray(body.appearance) ||
          Object.keys(appearance).some(key => !['background', 'frame', 'decoration', 'colors'].includes(key)) ||
          !backgrounds.some(preset => preset.id === appearance.background) || !frames.some(preset => preset.id === appearance.frame) ||
          !decorations.some(preset => preset.id === appearance.decoration) ||
          appearance.colors !== undefined && appearance.colors !== null &&
            (typeof appearance.colors !== 'object' || Array.isArray(appearance.colors) ||
              Object.keys(appearance.colors).length !== 3 ||
              ['surface', 'text', 'links'].some(key => typeof appearance.colors[key] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(appearance.colors[key]))))) {
          return send({ error: 'Choose supported background, frame and decoration presets.' }, 400)
        }
        if (appearance.colors && JSON.stringify(appearance.colors) !== JSON.stringify(saved.colors) && !currentView.cosmeticAccess.backgrounds) {
          return send({ error: 'Custom profile colors require Spark or higher.' }, 403)
        }
        for (const [key, access] of [['background', 'backgrounds'], ['frame', 'frames'], ['decoration', 'decorations']]) {
          if (appearance[key] !== 'none' && appearance[key] !== saved[key] && !currentView.cosmeticAccess[access]) {
            return send({ error: key === 'decoration' ? 'Avatar decorations require Radiance or higher.' : 'Backgrounds and avatar frames require Spark or higher.' }, 403)
          }
        }
        if (body.badgeIds?.some(id => !available.some(badge => badge.id === id))) {
          return send({ error: 'Choose only badges unlocked by your current tier or staff rank. Refresh if your access changed.' }, 403)
        }
        const update = db.prepare(`UPDATE member_profiles SET display_name=?,bio=?,pronouns=?,status=?,accent=?,banner=?,
          website=?,showcase=?,favorite_plugin=?,public=?,updated_at=?,badge_selection=?,appearance=?,servers=?,banner_version=?,
          revision=revision+1 WHERE user_id=? AND revision=?`)
          .bind(body.displayName.trim(), body.bio.trim(), body.pronouns.trim(), body.status.trim(), body.accent, body.banner,
            body.website, body.showcase, body.favoritePlugin.trim(), Number(body.public), now,
            body.badgeIds === undefined ? current.badge_selection : JSON.stringify(body.badgeIds),
            JSON.stringify(appearance), body.servers === undefined ? current.servers : JSON.stringify(body.servers),
            body.bannerImage === undefined ? current.banner_version : body.bannerImage === null ? null : body.revision + 1,
            user.id, body.revision)
        const statements = [update]
        if (body.bannerImage !== undefined) statements.push(db.prepare(`INSERT INTO member_profile_banners(user_id,data)
          SELECT ?,? WHERE changes()=1 ON CONFLICT(user_id) DO UPDATE SET data=excluded.data`).bind(user.id, body.bannerImage))
        const [result] = await db.batch(statements)
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
