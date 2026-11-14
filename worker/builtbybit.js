export async function submitBuiltByBitClaim(user, buyerId, licenses, env, origin, respond) {
  let base
  try { base = new URL(env.LICENSE_API_URL) }
  catch { return respond({ error: 'The licensing service URL is invalid' }, 503, origin) }
  if (base.protocol !== 'https:' || base.username || base.password) {
    return respond({ error: 'The licensing service URL must use HTTPS' }, 503, origin)
  }
  try {
    const upstream = await fetch(new URL(`/v1/admin/users/${encodeURIComponent(user.id)}/builtbybit/claim`, base), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.LICENSE_ADMIN_API_TOKEN}`,
        'X-Admin-Actor': `customer:${user.id}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ buyerId, licenses }),
      signal: AbortSignal.timeout(10000),
    })
    const text = await upstream.text()
    if (text.length > 50000) return respond({ error: 'The licensing service returned an oversized response' }, 502, origin)
    let payload
    try { payload = JSON.parse(text) }
    catch { return respond({ error: 'The licensing service returned an invalid response' }, 502, origin) }
    return respond(payload, upstream.status, origin)
  } catch (error) {
    console.error('BuiltByBit license claim failed:', error)
    return respond({ error: 'Automatic licensing is temporarily unavailable' }, 503, origin)
  }
}

export async function claimDiscordPurchases(user, env, origin, respond) {
  if (!env.BUILDBYBIT_API_AUTHORIZATION || !env.BUILDBYBIT_RESOURCE_IDS) {
    return respond({ error: 'Discord purchase verification needs the BuiltByBit creator API authorization and resource IDs configured on the Worker.' }, 503, origin)
  }
  if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) {
    return respond({ error: 'The licensing backend is not configured on this Worker.' }, 503, origin)
  }
  const ids = env.BUILDBYBIT_RESOURCE_IDS.split(',').map(id => id.trim())
  if (!ids.length || ids.length > 50 || ids.some(id => !/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)))) {
    return respond({ error: 'Configure between 1 and 50 valid BuiltByBit resource IDs.' }, 503, origin)
  }
  const mappedIds = new Set(ids)
  const licenses = []
  let buyerId = ''
  let total
  let seen = 0
  const deadline = Date.now() + 30000
  for (let page = 1; page <= 25; page++) {
    const url = new URL('https://api.builtbybit.com/v2/resources/creator/licenses')
    url.search = new URLSearchParams({ resource_ids: [...mappedIds].join(','), with: 'Buyer', page: String(page), per_page: '100' }).toString()
    let response
    try {
      if (Date.now() >= deadline) throw new Error('Purchase verification deadline reached')
      response = await fetch(url, {
        headers: { Authorization: env.BUILDBYBIT_API_AUTHORIZATION },
        signal: AbortSignal.timeout(Math.min(10000, deadline - Date.now())),
      })
    } catch {
      return respond({ error: 'BuiltByBit purchase verification timed out or is unavailable. Please try again.' }, 502, origin)
    }
    if (!response.ok) {
      return respond({ error: response.status === 429
        ? 'BuiltByBit is rate limiting purchase checks. Please wait and try again.'
        : 'BuiltByBit could not verify purchases. Check the creator API authorization and required API access.' }, response.status === 429 ? 429 : 502, origin)
    }
    let payload
    try { payload = await response.json() }
    catch { return respond({ error: 'BuiltByBit returned an invalid purchase response.' }, 502, origin) }
    const rows = payload?.data?.licenses
    const stats = payload?.data?.stats
    if (payload?.result !== 'success' || !Array.isArray(rows) || !stats ||
        !Number.isSafeInteger(stats.total) || stats.total < 0 ||
        stats.page !== page || !Number.isSafeInteger(stats.per_page) || stats.per_page < 1 || stats.per_page > 100 ||
        !(stats.max_page === Math.ceil(stats.total / stats.per_page) || (stats.total === 0 && stats.max_page === 1)) ||
        rows.length > stats.per_page || (total !== undefined && total !== stats.total)) {
      return respond({ error: 'BuiltByBit returned incomplete or changing purchase data. Please retry the check.' }, 502, origin)
    }
    if (stats.max_page > 25) return respond({ error: 'Too many purchase pages to verify safely in one check. Contact support.' }, 413, origin)
    total = stats.total
    seen += rows.length
    for (const row of rows) {
      if (row?.content_type !== 'resource' || !mappedIds.has(String(row.content_id))) continue
      const buyer = row.Buyer
      if (!buyer || typeof buyer.user_id !== 'string' || buyer.user_id !== String(row.buyer_id)) {
        return respond({ error: 'BuiltByBit did not include the verified buyer details required for Discord linking.' }, 502, origin)
      }
      if (buyer.discord_id !== user.id) continue
      if (!/^[1-9]\d{0,31}$/.test(buyer.user_id) || buyer.banned === true) {
        return respond({ error: 'This BuiltByBit buyer account cannot be linked. Contact support.' }, 403, origin)
      }
      if (buyerId && buyerId !== buyer.user_id) {
        return respond({ error: 'More than one BuiltByBit account matches this Discord account. Contact support.' }, 409, origin)
      }
      buyerId = buyer.user_id
      if (typeof row.permanent !== 'boolean' || (row.permanent && typeof row.active !== 'boolean') ||
          (!row.permanent && (!Number.isSafeInteger(row.start_date) || !Number.isSafeInteger(row.end_date) ||
            row.start_date < 0 || row.end_date <= row.start_date || !Number.isFinite(new Date(row.end_date * 1000).getTime())))) {
        return respond({ error: 'BuiltByBit returned invalid license validity information.' }, 502, origin)
      }
      licenses.push({
        resourceId: Number(row.content_id),
        active: row.permanent ? row.active : row.start_date <= Date.now() / 1000 && row.end_date > Date.now() / 1000,
        permanent: row.permanent,
        expiresAt: row.permanent ? null : new Date(row.end_date * 1000).toISOString(),
      })
    }
    if (page >= stats.max_page) {
      if (seen !== total) return respond({ error: 'BuiltByBit returned an incomplete purchase list. No licenses were changed.' }, 502, origin)
      if (!buyerId) {
        return respond({ error: 'No Lumen purchase was found linked to your Discord account. In BuiltByBit account settings, choose Link Discord account using the same Discord account as this website, then check again.' }, 403, origin)
      }
      return submitBuiltByBitClaim(user, buyerId, licenses, env, origin, respond)
    }
    if (rows.length !== stats.per_page) return respond({ error: 'BuiltByBit returned an incomplete purchase page. No licenses were changed.' }, 502, origin)
  }
  return respond({ error: 'Purchase verification could not finish safely. No licenses were changed.' }, 413, origin)
}
