import { hasPermission, resolveAccess } from './access-control.js'

const CHUNK_SIZE = 65536
const MAX_JAR_SIZE = 32 * 1024 * 1024
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

function downloadView(row) {
  return {
    id: row.id, productId: row.product_id, productKey: row.product_key, name: row.name,
    version: row.version, filename: row.filename, sha256: row.sha256, size: row.size,
    createdAt: row.created_at,
  }
}

function validArtifact(row) {
  return Number.isInteger(row.size) && row.size > 0 && row.size <= MAX_JAR_SIZE &&
    row.chunk_count === Math.ceil(row.size / CHUNK_SIZE) &&
    /^[a-f0-9]{64}$/.test(row.sha256) &&
    /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.jar$/i.test(row.filename)
}

export async function handlePluginDownloads(request, env, origin, path, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  const match = path.match(new RegExp(`^/studio/downloads/(${uuid})$`, 'i'))
  if (path !== '/studio/downloads' && !match) return send({ error: 'Download not found.' }, 404)
  if (!['GET', 'HEAD'].includes(request.method) || (!match && request.method !== 'GET')) {
    return send({ error: 'Download method is not allowed.' }, 405)
  }
  const authorization = request.headers.get('Authorization') || ''
  const user = await deps.verifyLoginToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '', env)
  if (!user) return send({ error: 'Sign in with Discord to download your plugins.' }, 401)
  const access = await resolveAccess(user.id, env)
  const staff = hasPermission(access, 'dashboard.view') && hasPermission(access, 'products.manage')
  const limiter = match ? env.ASSISTANT_LIMITER : env.ADMIN_READ_LIMITER
  if (!limiter) return send({ error: 'Download rate limiting is not configured.' }, 503)
  if (!(await limiter.limit({ key: `${match ? 'plugin-download' : 'plugin-download-list'}:${user.id}` })).success) {
    return send({ error: 'Too many download requests. Wait a minute before trying again.' }, 429)
  }
  let owned = []
  if (!staff) {
    let profile
    try { profile = await deps.licensingRequest(env, `/customers/${encodeURIComponent(user.id)}`) }
    catch (error) {
      console.error('Download entitlement lookup failed:', error instanceof Error ? error.name : 'Unknown error')
      return send({ error: 'Your license access could not be verified. Please try again later.' }, 503)
    }
    if (profile.status === 404) {
      if (match) return send({ error: 'An active license is required for this download.' }, 403)
    } else {
      if (!profile.ok || profile.data?.customerDiscordId !== user.id || !Array.isArray(profile.data.products) ||
          typeof profile.data.verificationRequired !== 'boolean') {
        return send({ error: 'Your license access could not be verified. Please try again later.' }, 503)
      }
      if (profile.data.status !== 'active' || profile.data.verificationRequired === true) {
        return send({ error: 'Downloads are unavailable while your account is restricted or awaiting verification.' }, 403)
      }
      for (const product of profile.data.products) {
        if (!product || typeof product.productId !== 'string' || typeof product.status !== 'string' ||
            typeof product.productActive !== 'boolean' || (product.expiresAt !== null &&
              (typeof product.expiresAt !== 'string' || !Number.isFinite(Date.parse(product.expiresAt))))) {
          return send({ error: 'The licensing service returned invalid access information.' }, 503)
        }
        if (product.productActive && product.status === 'active' && (!product.expiresAt || Date.parse(product.expiresAt) > Date.now())) {
          owned.push(product.productId)
        }
      }
    }
  }
  if (!match) {
    const url = new URL(request.url)
    const page = Math.max(1, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '1', 10) || 1))
    const where = `WHERE published = 1${staff ? '' : ' AND product_id IN (SELECT value FROM json_each(?))'}`
    const params = staff ? [] : [JSON.stringify(owned)]
    const count = await env.COMMUNITY_DB.prepare(`SELECT COUNT(*) AS total FROM studio_downloads ${where}`).bind(...params).first()
    const result = await env.COMMUNITY_DB.prepare(
      `SELECT * FROM studio_downloads ${where} ORDER BY created_at DESC, id LIMIT 20 OFFSET ?`,
    ).bind(...params, (page - 1) * 20).all()
    const builds = staff ? (await env.COMMUNITY_DB.prepare(
      'SELECT product_key AS productKey, state, message, updated_at AS updatedAt FROM studio_build_results ORDER BY product_key',
    ).all()).results || [] : undefined
    return send({ items: (result.results || []).map(downloadView), total: count.total, page, pageSize: 20, ...(staff ? { builds } : {}) })
  }
  const artifact = await env.COMMUNITY_DB.prepare('SELECT * FROM studio_downloads WHERE id = ? AND published = 1').bind(match[1]).first()
  if (!artifact || (!staff && !owned.includes(artifact.product_id))) return send({ error: 'Download not found or an active license is required.' }, 404)
  if (!validArtifact(artifact)) {
    console.error('A published plugin download has invalid metadata')
    return send({ error: 'This plugin build is unavailable. Please contact staff.' }, 503)
  }
  const headers = {
    'Content-Type': 'application/java-archive',
    'Content-Disposition': `attachment; filename="${artifact.filename}"`,
    'Content-Length': String(artifact.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Checksum-Sha256': artifact.sha256,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, X-Checksum-Sha256',
    Vary: 'Origin',
  }
  if (request.method === 'HEAD') return new Response(null, { headers })
  let index = 0
  let buffered = []
  const stream = new ReadableStream({
    async pull(controller) {
      try {
        if (!buffered.length) {
          const result = await env.COMMUNITY_DB.prepare(
            'SELECT chunk_index, data FROM studio_download_chunks WHERE download_id = ? AND chunk_index >= ? ORDER BY chunk_index LIMIT 16',
          ).bind(artifact.id, index).all()
          buffered = result.results || []
        }
        const chunk = buffered.shift()
        if (!chunk || chunk.chunk_index !== index || typeof chunk.data !== 'string') throw new Error('Missing plugin download chunk')
        const bytes = Uint8Array.from(atob(chunk.data), char => char.charCodeAt(0))
        const expected = Math.min(CHUNK_SIZE, artifact.size - index * CHUNK_SIZE)
        if (bytes.length !== expected) throw new Error('Invalid plugin download chunk size')
        controller.enqueue(bytes)
        index++
        if (index === artifact.chunk_count) controller.close()
      } catch (error) {
        console.error('Plugin download stream failed:', error instanceof Error ? error.message : 'Unknown error')
        controller.error(new Error('The plugin download could not be completed.'))
      }
    },
  })
  return new Response(stream, { headers })
}
