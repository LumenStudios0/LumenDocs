import { licensingRequest } from './product-tools.js'

export async function staffLicenseKey(env, user, access, licenseId, send) {
  if (access.rank < 2) return send({ error: 'Only authorized staff can inspect license keys.' }, 403)
  if (!env.COMMUNITY_DB) return send({ error: 'Key inspection audit storage is unavailable.' }, 503)
  try {
    const record = await licensingRequest(env, `/licenses/${licenseId}`)
    if (!record.ok) return send({ error: record.status === 404 ? 'License not found.' : 'The licensing service could not load this license.' }, record.status === 404 ? 404 : 502)
    const license = record.data
    if (license?.licenseId !== licenseId || typeof license.customerDiscordId !== 'string' ||
        !/^\d{5,22}$/.test(license.customerDiscordId) || typeof license.productId !== 'string') {
      return send({ error: 'The licensing service returned an invalid license record.' }, 502)
    }
    const recovered = await licensingRequest(env, `/users/${license.customerDiscordId}/license-key`)
    if (!recovered.ok) return send({ error: recovered.status === 404
      ? 'No recoverable key is available. Older per-license keys stored only as hashes cannot be displayed. Account keys require the staff-license VPS updater.'
      : recovered.status === 403 ? 'The licensing service does not allow key retrieval for this restricted account.'
        : 'The licensing service could not recover this account key.' }, [403, 404].includes(recovered.status) ? recovered.status : 502)
    const data = recovered.data
    if (typeof data?.licenseKey !== 'string' || !/^[^\s\x00-\x1f\x7f]{16,128}$/.test(data.licenseKey) ||
        data.license?.customerDiscordId !== license.customerDiscordId ||
        (data.license.licenseId !== licenseId &&
          (!Array.isArray(data.license.productIds) || !data.license.productIds.includes(license.productId)))) {
      return send({ error: 'The recovered key could not be associated with the inspected license.' }, 502)
    }
    await env.COMMUNITY_DB.prepare(
      `INSERT INTO website_access_audit(id,actor_id,actor_role,action,target,details,created_at)
       VALUES (?,?,?,'license.key_viewed',?,'{}',?)`,
    ).bind(crypto.randomUUID(), user.id, access.role, licenseId, new Date().toISOString()).run()
    return send({ licenseKey: data.licenseKey, licenseId, customerDiscordId: license.customerDiscordId,
      kind: 'account' })
  } catch (error) {
    console.error('Staff key inspection failed:', error instanceof Error ? error.name : 'Unknown error')
    return send({ error: 'License key inspection is temporarily unavailable.' }, 503)
  }
}
