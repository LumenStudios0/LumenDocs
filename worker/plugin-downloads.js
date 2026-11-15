import { hasPermission, resolveAccess } from './access-control.js'
import { trialProducts } from '../shared/trial-products.mjs'
import { delegatedProducts } from './loyalty.js'

const CHUNK_SIZE = 65536
const MAX_JAR_SIZE = 32 * 1024 * 1024
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const UPLOAD_BATCH = 20
const VERIFY_BATCH = 16

function decodeChunk(data) {
  if (Uint8Array.fromBase64) return Uint8Array.fromBase64(data)
  const binary = atob(data)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < bytes.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

async function readUploadJson(request, limit) {
  const reader = request.body?.getReader()
  if (!reader) throw new Error('Expected JSON.')
  const parts = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.length
      if (length > limit) throw new Error('Upload request is too large.')
      parts.push(value)
    }
  } finally { await reader.cancel() }
  const bytes = new Uint8Array(length)
  let offset = 0
  for (const part of parts) { bytes.set(part, offset); offset += part.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}

// Check ZIP structure without inflating untrusted entries (or executing plugin code).
function validJar(bytes) {
  if (bytes.length < 22) return false
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (view.getUint32(0, true) !== 0x04034b50) return false
  let end = bytes.length - 22
  const floor = Math.max(0, end - 65535)
  while (end >= floor && view.getUint32(end, true) !== 0x06054b50) end--
  if (end < floor || end + 22 + view.getUint16(end + 20, true) !== bytes.length ||
      view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0) return false
  const count = view.getUint16(end + 10, true)
  const start = view.getUint32(end + 16, true)
  if (!count || count === 65535 || view.getUint16(end + 8, true) !== count ||
      start + view.getUint32(end + 12, true) !== end) return false
  let offset = start
  let descriptor = false
  let classes = false
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) return false
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const compressed = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const next = offset + 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
    const local = view.getUint32(offset + 42, true)
    if ((flags & 1) || ![0, 8].includes(method) || next > end || local + 30 > start ||
        view.getUint16(offset + 34, true) !== 0 || view.getUint32(local, true) !== 0x04034b50 ||
        view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method ||
        view.getUint16(local + 26, true) !== nameLength) return false
    const dataStart = local + 30 + nameLength + view.getUint16(local + 28, true)
    if (dataStart + compressed > start) return false
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength)
    if (!nameBytes.every((byte, n) => byte === bytes[local + 30 + n])) return false
    const name = new TextDecoder().decode(nameBytes)
    if (name === 'plugin.yml' || name === 'paper-plugin.yml') descriptor = true
    if (name.endsWith('.class')) classes = true
    offset = next
  }
  return offset === end && descriptor && classes
}

async function manualUpload(request, env, user, access, route, send) {
  if (!hasPermission(access, 'dashboard.view') || !hasPermission(access, 'products.manage')) {
    return send({ error: 'Dashboard and product management permissions are required to upload JARs.' }, 403)
  }
  const dataRequest = route?.[2] === 'chunks'
  const listing = !route && request.method === 'GET'
  if (!listing && request.method !== (dataRequest ? 'PUT' : 'POST')) return send({ error: 'Upload method is not allowed.' }, 405)
  const limiter = listing ? env.ADMIN_READ_LIMITER : env.ADMIN_WRITE_LIMITER
  if (!limiter) return send({ error: 'Upload rate limiting is not configured.' }, 503)
  if (!(await limiter.limit({ key: `plugin-upload${listing ? '-list' : ''}:${user.id}` })).success) {
    return send({ error: 'Too many upload requests. Wait a minute, then retry.' }, 429)
  }
  const db = env.COMMUNITY_DB
  const now = new Date().toISOString()
  try {
    if (listing) {
      const result = await db.prepare(`SELECT d.id,d.name,d.filename,u.state,u.expires_at AS expiresAt
        FROM studio_manual_uploads u JOIN studio_downloads d ON d.id = u.download_id
        WHERE u.actor_id = ? AND u.state != 'published' AND u.expires_at > ? ORDER BY d.created_at LIMIT 2`)
        .bind(user.id, now).all()
      return send({ uploads: result.results || [] })
    }
    if (!route) {
      const body = await readUploadJson(request, 4096)
      const product = trialProducts.find(item => item.productId === body?.productId)
      if (!product || (body.name !== undefined && body.name !== product.name) || typeof body.version !== 'string' ||
          !/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/.test(body.version) || !validArtifact({
            ...body, chunk_count: Math.ceil(body.size / CHUNK_SIZE),
          })) return send({ error: 'Choose a listed plugin, a valid version, safe .jar filename, SHA-256 and a JAR of at most 32 MiB. Plugin IDs and names must match the shared catalog exactly.' }, 400)
      // Expired drafts are private garbage; published artifacts are never removed.
      await db.prepare(`DELETE FROM studio_downloads WHERE published = 0 AND id IN
        (SELECT download_id FROM studio_manual_uploads WHERE actor_id = ? AND expires_at <= ?)`).bind(user.id, now).run()
      const id = crypto.randomUUID()
      const expires = new Date(Date.now() + 86400000).toISOString()
      const result = await db.batch([
        db.prepare(`INSERT INTO studio_downloads
          (id,product_id,product_key,name,version,filename,sha256,size,chunk_count,source_commit,created_at,published)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,0 WHERE
          (SELECT COUNT(*) FROM studio_manual_uploads WHERE actor_id = ? AND state != 'published') < 2`)
          .bind(id, product.productId, product.productId, product.name, body.version, body.filename, body.sha256, body.size,
            Math.ceil(body.size / CHUNK_SIZE), `manual:${user.id}`, now, user.id),
        db.prepare(`INSERT INTO studio_manual_uploads (download_id,actor_id,state,expires_at)
          SELECT ?,?,'uploading',? WHERE EXISTS (SELECT 1 FROM studio_downloads WHERE id = ?)`)
          .bind(id, user.id, expires, id),
      ])
      if (!result[0].meta.changes) return send({ error: 'Cancel unfinished uploads before starting another (maximum two).' }, 409)
      return send({ uploadId: id, chunkSize: CHUNK_SIZE, batchSize: UPLOAD_BATCH, expiresAt: expires }, 201)
    }
    const id = route[1]
    const upload = await db.prepare(`SELECT d.*, u.state FROM studio_downloads d
      JOIN studio_manual_uploads u ON u.download_id = d.id
      WHERE d.id = ? AND u.actor_id = ? AND u.expires_at > ?`).bind(id, user.id, now).first()
    if (!upload) return send({ error: 'Upload not found or expired.' }, 404)
    if (route[2] === 'cancel') {
      const result = await db.prepare(`DELETE FROM studio_downloads WHERE id = ? AND published = 0 AND id IN
        (SELECT download_id FROM studio_manual_uploads WHERE actor_id = ? AND state IN ('uploading','failed'))`)
        .bind(id, user.id).run()
      return result.meta.changes ? send({ cancelled: true }) : send({ error: 'A verifying or published upload cannot be cancelled.' }, 409)
    }
    if (route[2] === 'chunks') {
      if (upload.state !== 'uploading') return send({ error: 'This upload is no longer accepting chunks.' }, 409)
      const body = await readUploadJson(request, 1800000)
      if (!Number.isInteger(body?.start) || body.start < 0 || !Array.isArray(body.chunks) ||
          !body.chunks.length || body.chunks.length > UPLOAD_BATCH || body.start + body.chunks.length > upload.chunk_count) {
        return send({ error: 'Invalid upload chunk range.' }, 400)
      }
      for (let n = 0; n < body.chunks.length; n++) {
        const data = body.chunks[n]
        const expected = Math.min(CHUNK_SIZE, upload.size - (body.start + n) * CHUNK_SIZE)
        if (typeof data !== 'string' || data.length !== 4 * Math.ceil(expected / 3) ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(data) || atob(data).length !== expected || btoa(atob(data)) !== data) {
          return send({ error: 'Invalid base64 chunk or chunk size.' }, 400)
        }
      }
      await db.batch(body.chunks.map((data, n) => db.prepare(`INSERT INTO studio_download_chunks (download_id,chunk_index,data)
        SELECT ?,?,? WHERE EXISTS (SELECT 1 FROM studio_manual_uploads
          WHERE download_id = ? AND actor_id = ? AND state = 'uploading' AND expires_at > ?)
        ON CONFLICT(download_id,chunk_index) DO NOTHING`).bind(id, body.start + n, data, id, user.id, now)))
      const stored = (await db.prepare(`SELECT chunk_index,data FROM studio_download_chunks
        WHERE download_id = ? AND chunk_index >= ? AND chunk_index < ? ORDER BY chunk_index`)
        .bind(id, body.start, body.start + body.chunks.length).all()).results || []
      if (stored.length !== body.chunks.length || stored.some((row, n) => row.chunk_index !== body.start + n || row.data !== body.chunks[n])) {
        return send({ error: 'Chunks conflict with existing data or verification has started. Cancel and start a new upload.' }, 409)
      }
      return send({ received: stored.length })
    }
    if (upload.state === 'published') return send({ download: downloadView(upload) })
    if (upload.state !== 'uploading') return send({ error: 'Upload is verifying or failed. Refresh builds; cancel failed drafts before retrying.' }, 409)
    if (!trialProducts.some(product => product.productId === upload.product_id && product.name === upload.name)) {
      return send({ error: 'This draft no longer matches the shared plugin catalog. Discard it and select a listed plugin.' }, 409)
    }
    const locked = await db.prepare(`UPDATE studio_manual_uploads SET state = 'verifying'
      WHERE download_id = ? AND actor_id = ? AND state = 'uploading' AND expires_at > ?`).bind(id, user.id, now).run()
    if (!locked.meta.changes) return send({ error: 'Upload is already being verified.' }, 409)
    try {
      const bytes = new Uint8Array(upload.size)
      for (let start = 0; start < upload.chunk_count; start += VERIFY_BATCH) {
        const rows = (await db.prepare(`SELECT chunk_index,data FROM studio_download_chunks
          WHERE download_id = ? AND chunk_index >= ? ORDER BY chunk_index LIMIT 16`).bind(id, start).all()).results || []
        if (rows.length !== Math.min(VERIFY_BATCH, upload.chunk_count - start)) throw new Error('Missing uploaded chunks.')
        for (let n = 0; n < rows.length; n++) {
          if (rows[n].chunk_index !== start + n) throw new Error('Missing uploaded chunks.')
          const part = decodeChunk(rows[n].data)
          if (part.length !== Math.min(CHUNK_SIZE, upload.size - (start + n) * CHUNK_SIZE)) throw new Error('Invalid stored chunk size.')
          bytes.set(part, (start + n) * CHUNK_SIZE)
        }
      }
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      if (hash !== upload.sha256) throw new Error('Stored JAR failed SHA-256 verification.')
      if (!validJar(bytes)) throw new Error('Expected a valid plugin JAR with a plugin descriptor and compiled classes (non-ZIP64, unencrypted ZIP).')
      const result = await db.batch([
        db.prepare(`UPDATE studio_downloads SET published = 1 WHERE id = ? AND published = 0 AND id IN
          (SELECT download_id FROM studio_manual_uploads WHERE state = 'verifying' AND expires_at > ?)`).bind(id, new Date().toISOString()),
        db.prepare(`UPDATE studio_manual_uploads SET state = 'published' WHERE download_id = ?
          AND EXISTS (SELECT 1 FROM studio_downloads WHERE id = ? AND published = 1)`).bind(id, id),
        db.prepare(`INSERT INTO website_access_audit (id,actor_id,actor_role,action,target,details,created_at)
          SELECT ?,?,?,'download.publish',?,?,? WHERE EXISTS (SELECT 1 FROM studio_downloads WHERE id = ? AND published = 1)`)
          .bind(crypto.randomUUID(), user.id, access.role, id, JSON.stringify({ productId: upload.product_id, sha256: hash }), new Date().toISOString(), id),
      ])
      if (!result[0].meta.changes) throw new Error('Upload expired before publication.')
      return send({ download: downloadView(upload) }, 201)
    } catch (error) {
      await db.prepare("UPDATE studio_manual_uploads SET state = 'failed' WHERE download_id = ? AND state = 'verifying'").bind(id).run()
      const known = error instanceof Error && /^(Missing uploaded chunks\.|Invalid stored chunk size\.|Stored JAR failed SHA-256 verification\.|Expected a valid plugin JAR|Upload expired before publication\.)/.test(error.message)
      if (!known) console.error('Manual JAR verification failed:', error instanceof Error ? error.name : 'Unknown error')
      return send({ error: `${known ? error.message : 'Stored JAR verification or publication failed.'} No existing download was replaced.` }, known ? 409 : 503)
    }
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof DOMException && error.name === 'InvalidCharacterError' ||
        error instanceof Error && ['Expected JSON.', 'Upload request is too large.'].includes(error.message)) {
      return send({ error: 'Invalid JSON or oversized upload request.' }, error.message === 'Upload request is too large.' ? 413 : 400)
    }
    console.error('Manual plugin upload failed:', error instanceof Error ? error.name : 'Unknown error')
    const action = listing ? 'Unfinished uploads could not be listed.' : route?.[2] === 'cancel'
      ? 'Upload cancellation could not be confirmed.' : 'Upload failed.'
    return send({ error: `${action} Refresh builds to check the outcome before retrying. Ensure community migration 0009_manual_uploads.sql is applied and the website database is available; existing downloads are unchanged.` }, 503)
  }
}

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
    typeof row.sha256 === 'string' && /^[a-f0-9]{64}$/.test(row.sha256) &&
    typeof row.filename === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}\.jar$/i.test(row.filename)
}

export async function handlePluginDownloads(request, env, origin, path, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  const uploadRoute = path.match(new RegExp(`^/studio/downloads/uploads/(${uuid})/(chunks|publish|cancel)$`, 'i'))
  const uploading = path === '/studio/downloads/uploads' || !!uploadRoute
  const match = path.match(new RegExp(`^/studio/downloads/(${uuid})$`, 'i'))
  if (path !== '/studio/downloads' && !match && !uploading) return send({ error: 'Download not found.' }, 404)
  if (!uploading && (!['GET', 'HEAD'].includes(request.method) || (!match && request.method !== 'GET'))) {
    return send({ error: 'Download method is not allowed.' }, 405)
  }
  const authorization = request.headers.get('Authorization') || ''
  const user = await deps.verifyLoginToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '', env)
  if (!user) return send({ error: 'Sign in with Discord to download your plugins.' }, 401)
  const access = await resolveAccess(user.id, env)
  const staff = hasPermission(access, 'dashboard.view') && hasPermission(access, 'products.manage')
  if (uploading) return manualUpload(request, env, user, access, uploadRoute, send)
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
    if (profile.status !== 404) {
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
    try { owned.push(...await delegatedProducts(env, user.id)) }
    catch (error) {
      console.error('Delegated download access verification failed:', error instanceof Error ? error.name : 'Unknown error')
      return send({ error: 'Shared plugin access could not be verified. Please try again later.' }, 503)
    }
    if (profile.status === 404 && match && !owned.length) return send({ error: 'An active license or shared plugin access is required for this download.' }, 403)
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
