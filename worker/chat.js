import { handleCommunity, runCommunityChecks } from './community.js'
import { adminPermission, getAdminRole, getStaffMembers, hasPermission, rememberMember, resolveAccess, websiteAdminApi } from './access-control.js'
import { claimDiscordPurchases, submitBuiltByBitClaim } from './builtbybit.js'

const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

function respond(data, status, origin) {
  const headers = new Headers(jsonHeaders)
  headers.set('Access-Control-Allow-Origin', origin)
  headers.set('Vary', 'Origin')
  return new Response(JSON.stringify(data), { status, headers })
}

function licenseServiceUnavailable(origin) {
  return respond({
    error: 'The licensing backend is not configured on this Worker. Set the LICENSE_API_URL Worker setting and LICENSE_ADMIN_API_TOKEN secret, and make sure the backend is reachable over HTTPS.',
    code: 'LICENSE_SERVICE_UNAVAILABLE',
  }, 503, origin)
}

function isAllowedOrigin(origin, env) {
  const allowedOrigins = new Set([
    env.ALLOWED_ORIGIN,
    ...(env.ALLOWED_ORIGINS ?? '').split(',').map(value => value.trim()).filter(Boolean),
  ])
  return allowedOrigins.has(origin)
}

function base64UrlEncode(value) {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlDecode(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, char => char.charCodeAt(0))
}

async function importSigningKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

async function createLoginToken(user, env) {
  const now = Math.floor(Date.now() / 1000)
  const role = await getAdminRole(user.id, env)
  const claims = {
    iss: 'lumen-studios',
    aud: 'lumen-docs',
    sub: user.id,
    username: user.username,
    globalName: user.globalName || user.global_name || user.username,
    avatarUrl: user.avatarUrl || (user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : ''),
    iat: now,
    exp: now + (role ? 8 * 60 * 60 : 30 * 24 * 60 * 60),
  }
  const unsigned = `${base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64UrlEncode(JSON.stringify(claims))}`
  const key = await importSigningKey(env.AUTH_SIGNING_SECRET)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`
}

async function verifyLoginToken(token, env) {
  if (!env.AUTH_SIGNING_SECRET || typeof token !== 'string' || token.length > 2000) return null
  const parts = token.split('.')
  if (parts.length !== 3) return null

  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])))
    if (header.alg !== 'HS256' || header.typ !== 'JWT') return null
    const key = await importSigningKey(env.AUTH_SIGNING_SECRET)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
    const now = Math.floor(Date.now() / 1000)
    if (
      !valid ||
      claims.iss !== 'lumen-studios' ||
      claims.aud !== 'lumen-docs' ||
      typeof claims.sub !== 'string' ||
      typeof claims.username !== 'string' ||
      !Number.isInteger(claims.exp) ||
      claims.exp <= now ||
      claims.iat > now + 60
    ) return null

    return {
      id: claims.sub,
      username: claims.username,
      globalName: claims.globalName,
      avatarUrl: claims.avatarUrl,
      expiresAt: claims.exp,
    }
  } catch {
    return null
  }
}

async function createBuiltByBitState(discordId, env) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${base64UrlEncode(JSON.stringify({
    iss: 'lumen-studios',
    aud: 'lumen-builtbybit',
    sub: discordId,
    nonce: base64UrlEncode(crypto.getRandomValues(new Uint8Array(32))),
    iat: now,
    exp: now + 10 * 60,
  }))}`
  const key = await importSigningKey(env.AUTH_SIGNING_SECRET)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`
}

async function verifyBuiltByBitState(state, discordId, env) {
  if (typeof state !== 'string' || state.length > 2000) return false
  const parts = state.split('.')
  if (parts.length !== 3) return false

  try {
    const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])))
    const claims = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])))
    const key = await importSigningKey(env.AUTH_SIGNING_SECRET)
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    )
    const now = Math.floor(Date.now() / 1000)
    return Boolean(
      valid &&
      header.alg === 'HS256' &&
      header.typ === 'JWT' &&
      claims.iss === 'lumen-studios' &&
      claims.aud === 'lumen-builtbybit' &&
      claims.sub === discordId &&
      typeof claims.nonce === 'string' &&
      claims.nonce.length >= 40 &&
      Number.isInteger(claims.exp) &&
      claims.exp > now &&
      claims.iat <= now + 60,
    )
  } catch {
    return false
  }
}

function redirectToSite(env, hash) {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.ALLOWED_ORIGIN}/${hash}`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  })
}

function readCookie(request, name) {
  const cookie = request.headers.get('Cookie') ?? ''
  const value = cookie.split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`))
  return value?.slice(name.length + 1) ?? ''
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false
  let difference = 0
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index)
  }
  return difference === 0
}

async function startDiscordLogin(request, env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.AUTH_SIGNING_SECRET) {
    return redirectToSite(env, '#discord_login=unavailable')
  }

  const stateBytes = crypto.getRandomValues(new Uint8Array(32))
  const state = base64UrlEncode(stateBytes)
  const callbackUrl = env.DISCORD_CALLBACK_URL || new URL('/auth/callback', request.url).toString()
  const authorizeUrl = new URL('https://discord.com/oauth2/authorize')
  authorizeUrl.searchParams.set('client_id', env.DISCORD_CLIENT_ID)
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('scope', 'identify')
  authorizeUrl.searchParams.set('state', state)

  return new Response(null, {
    status: 302,
    headers: {
      Location: authorizeUrl.toString(),
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': `lumen_discord_oauth_state=${state}; Path=/auth/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    },
  })
}

async function completeDiscordLogin(request, env) {
  if (!env.DISCORD_CLIENT_ID || !env.DISCORD_CLIENT_SECRET || !env.AUTH_SIGNING_SECRET) {
    return redirectToSite(env, '#discord_login=unavailable')
  }

  const url = new URL(request.url)
  const state = url.searchParams.get('state') ?? ''
  const savedState = readCookie(request, 'lumen_discord_oauth_state')
  const clearStateCookie = 'lumen_discord_oauth_state=; Path=/auth/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
  if (!state || !savedState || !constantTimeEqual(state, savedState)) {
    return new Response('Discord sign-in could not be verified. Please try again.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }
  if (url.searchParams.has('error')) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${env.ALLOWED_ORIGIN}/#discord_login=cancelled`, 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  const code = url.searchParams.get('code') ?? ''
  if (!code || code.length > 2048) {
    return new Response('Discord did not provide a valid authorization code.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  const callbackUrl = env.DISCORD_CALLBACK_URL || new URL('/auth/callback', request.url).toString()
  let tokenResponse
  try {
    tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
      }),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return new Response('Discord sign-in is temporarily unavailable.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  if (!tokenResponse.ok) {
    return new Response('Discord sign-in could not be completed. Please try again.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  let tokenPayload
  try {
    tokenPayload = await tokenResponse.json()
  } catch {
    return new Response('Discord returned an invalid sign-in response.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }
  if (typeof tokenPayload?.access_token !== 'string') {
    return new Response('Discord returned an invalid sign-in response.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  let profileResponse
  try {
    profileResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: 'Bearer ' + tokenPayload.access_token },
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return new Response('Discord profile could not be loaded. Please try again.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  if (!profileResponse.ok) {
    return new Response('Discord profile could not be loaded. Please try again.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  let user
  try {
    user = await profileResponse.json()
  } catch {
    return new Response('Discord returned an invalid profile.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }
  if (typeof user?.id !== 'string' || typeof user?.username !== 'string') {
    return new Response('Discord returned an invalid profile.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }

  try {
    await rememberMember({ id: user.id, username: user.username, globalName: user.global_name }, env)
  } catch (error) {
    console.error('Unable to save verified Discord account:', error)
    return new Response('Your website account could not be saved. Please try signing in again later.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': clearStateCookie },
    })
  }
  const token = await createLoginToken(user, env)
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${env.ALLOWED_ORIGIN}/#discord_token=${encodeURIComponent(token)}`,
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'Set-Cookie': clearStateCookie,
    },
  })
}

async function dinosaurDiscoveries(request, env, origin) {
  if (!env.DINO_DISCOVERIES) {
    return respond({ error: 'Dinosaur discovery counter is not configured' }, 503, origin)
  }

  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return respond({ error: 'Request could not be verified' }, 400, origin)
  const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: `dinosaur-discoveries:${ip}` })
  if (!rateLimit.success) {
    return respond({ error: 'Please wait before checking the dinosaur counter again' }, 429, origin)
  }

  let visitorId = ''
  if (request.method === 'POST') {
    const body = await request.text()
    if (body.length > 200) return respond({ error: 'Request is too large' }, 413, origin)

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      return respond({ error: 'Expected a JSON request' }, 400, origin)
    }

    visitorId = typeof payload?.visitorId === 'string' ? payload.visitorId : ''
    if (!/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(visitorId)) {
      return respond({ error: 'A valid visitor ID is required' }, 400, origin)
    }
  }

  try {
    if (request.method === 'POST') {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(visitorId))
      const visitorHash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
      await env.DINO_DISCOVERIES
        .prepare('INSERT OR IGNORE INTO dinosaur_discoverers (visitor_hash, found_at) VALUES (?, ?)')
        .bind(visitorHash, new Date().toISOString())
        .run()
    }

    const result = await env.DINO_DISCOVERIES
      .prepare('SELECT COUNT(*) AS count FROM dinosaur_discoverers')
      .first()
    return respond({ count: Number(result?.count ?? 0) }, 200, origin)
  } catch (error) {
    console.error('Dinosaur discovery counter database request failed:', error)
    return respond({ error: 'Dinosaur discovery counter is temporarily unavailable' }, 503, origin)
  }
}

function isValidIpAddress(address) {
  if (typeof address !== 'string' || address.length > 45) return false
  if (address.includes(':')) {
    if (!/^[\da-f:]+$/i.test(address) || !address.includes(':')) return false
    try {
      return new URL(`http://[${address}]/`).hostname.startsWith('[')
    } catch {
      return false
    }
  }
  const octets = address.split('.')
  return octets.length === 4 && octets.every(octet =>
    /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255,
  )
}

async function accountLicenseApi(request, env, origin, path) {
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const user = await verifyLoginToken(token, env)
  if (!user) return respond({ error: 'Sign in to access your customer account' }, 401, origin)

  if (!env.ASSISTANT_LIMITER) {
    return respond({ error: 'Customer account service is not configured' }, 503, origin)
  }
  const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: `account:${user.id}` })
  if (!rateLimit.success) {
    return respond({ error: 'Please wait before checking your license account again' }, 429, origin)
  }

  if (path === '/account/servers' && request.method !== 'GET') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }
  if (path === '/account/profile' && request.method !== 'PUT') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }
  if (path === '/account/delete' && request.method !== 'DELETE') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }
  if (path === '/account/license-ips' && request.method !== 'GET' && request.method !== 'PUT') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }
  if (path === '/account/builtbybit/authorize' && request.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }
  if ((path === '/account/builtbybit/claim' || path === '/account/builtbybit/discord') && request.method !== 'POST') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }
  if (path === '/account/license-key' && request.method !== 'GET') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }

  if (path === '/account/builtbybit/discord') {
    return claimDiscordPurchases(user, env, origin, respond)
  }

  if (path === '/account/builtbybit/authorize') {
    if (
      !env.BUILDBYBIT_CLIENT_ID ||
      !env.BUILDBYBIT_CLIENT_SECRET ||
      !env.AUTH_SIGNING_SECRET ||
      !env.BUILDBYBIT_RESOURCE_IDS
    ) {
      return respond({ error: 'BuiltByBit purchase linking is not configured' }, 503, origin)
    }
    const state = await createBuiltByBitState(user.id, env)
    const redirectUri = env.BUILDBYBIT_REDIRECT_URI || `${env.ALLOWED_ORIGIN}/account/licenses/`
    const authorizeUrl = new URL('https://builtbybit.com/account/external/authorize')
    authorizeUrl.searchParams.set('client_id', env.BUILDBYBIT_CLIENT_ID)
    authorizeUrl.searchParams.set('redirect_uri', redirectUri)
    authorizeUrl.searchParams.set('response_type', 'code')
    authorizeUrl.searchParams.set('state', state)
    if (env.BUILDBYBIT_OAUTH_SCOPE) {
      authorizeUrl.searchParams.set('scope', env.BUILDBYBIT_OAUTH_SCOPE)
    }
    return respond({ authorizeUrl: authorizeUrl.toString(), state }, 200, origin)
  }

  if (path === '/account/builtbybit/claim') {
    if (
      !env.BUILDBYBIT_CLIENT_ID ||
      !env.BUILDBYBIT_CLIENT_SECRET ||
      !env.AUTH_SIGNING_SECRET ||
      !env.BUILDBYBIT_RESOURCE_IDS
    ) {
      return respond({ error: 'BuiltByBit purchase linking is not configured' }, 503, origin)
    }
    if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) {
      return licenseServiceUnavailable(origin)
    }

    const body = await request.text()
    if (body.length > 5000) return respond({ error: 'Request is too large' }, 413, origin)
    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      return respond({ error: 'Expected a JSON request' }, 400, origin)
    }
    if (
      typeof payload?.code !== 'string' ||
      payload.code.length < 1 ||
      payload.code.length > 2048 ||
      !await verifyBuiltByBitState(payload.state, user.id, env)
    ) {
      return respond({ error: 'BuiltByBit authorization could not be verified. Start the claim again.' }, 400, origin)
    }

    const clientCredentials = btoa(`${env.BUILDBYBIT_CLIENT_ID}:${env.BUILDBYBIT_CLIENT_SECRET}`)
    let tokenResponse
    try {
      tokenResponse = await fetch('https://api.builtbybit.com/oauth2/token', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${clientCredentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code: payload.code }),
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      return respond({ error: 'BuiltByBit is temporarily unavailable. Please try again.' }, 502, origin)
    }
    if (!tokenResponse.ok) {
      return respond({ error: 'BuiltByBit authorization expired or was rejected. Start the claim again.' }, 400, origin)
    }

    let tokenPayload
    try {
      tokenPayload = await tokenResponse.json()
    } catch {
      return respond({ error: 'BuiltByBit returned an invalid authorization response' }, 502, origin)
    }
    if (typeof tokenPayload?.access_token !== 'string' || tokenPayload.access_token.length > 4096) {
      return respond({ error: 'BuiltByBit returned an invalid authorization token' }, 502, origin)
    }

    const buyerHeaders = { Authorization: 'Bearer ' + tokenPayload.access_token }
    let buyerResponse
    try {
      buyerResponse = await fetch('https://api.builtbybit.com/v2/members/self', {
        headers: buyerHeaders,
        signal: AbortSignal.timeout(10000),
      })
    } catch {
      return respond({ error: 'Could not verify the BuiltByBit account. Please try again.' }, 502, origin)
    }
    if (!buyerResponse.ok) {
      return respond({ error: 'Could not verify the BuiltByBit account. Please reconnect it.' }, 502, origin)
    }

    let buyerPayload
    try {
      buyerPayload = await buyerResponse.json()
    } catch {
      return respond({ error: 'BuiltByBit returned an invalid account response' }, 502, origin)
    }
    const buyerId = buyerPayload?.data?.self?.user_id
    if (typeof buyerId !== 'string' || !/^\d{1,32}$/.test(buyerId)) {
      return respond({ error: 'BuiltByBit did not return a valid account ID' }, 502, origin)
    }

    const mappedResourceIds = new Set(
      env.BUILDBYBIT_RESOURCE_IDS.split(',').map(id => id.trim()).filter(id => /^\d+$/.test(id)),
    )
    if (!mappedResourceIds.size) {
      return respond({ error: 'No BuiltByBit resource IDs are configured for automatic licensing' }, 503, origin)
    }

    const licenses = []
    let allPagesRead = false
    for (let page = 1; page <= 25; page += 1) {
      const licensesUrl = new URL('https://api.builtbybit.com/v2/resources/discover/licenses')
      licensesUrl.searchParams.set('page', String(page))
      licensesUrl.searchParams.set('per_page', '100')
      let licensesResponse
      try {
        licensesResponse = await fetch(licensesUrl, {
          headers: buyerHeaders,
          signal: AbortSignal.timeout(10000),
        })
      } catch {
        return respond({ error: 'Could not check BuiltByBit purchases. Please try again.' }, 502, origin)
      }
      if (!licensesResponse.ok) {
        return respond({ error: 'BuiltByBit could not confirm your licenses. Check the requested access and try again.' }, 502, origin)
      }
      let licensesPayload
      try {
        licensesPayload = await licensesResponse.json()
      } catch {
        return respond({ error: 'BuiltByBit returned an invalid license response' }, 502, origin)
      }
      const pageLicenses = licensesPayload?.data?.licenses
      if (!Array.isArray(pageLicenses) || pageLicenses.length > 100) {
        return respond({ error: 'BuiltByBit returned an invalid license list' }, 502, origin)
      }
      for (const license of pageLicenses) {
        if (
          license?.content_type !== 'resource' ||
          String(license.buyer_id) !== buyerId ||
          !mappedResourceIds.has(String(license.content_id))
        ) continue
        const resourceId = Number(license.content_id)
        if (!Number.isSafeInteger(resourceId) || resourceId < 1) continue
        const permanent = license.permanent === true
        const endDate = Number(license.end_date)
        const startDate = Number(license.start_date)
        licenses.push({
          resourceId,
          active: permanent
            ? license.active !== false
            : Number.isFinite(endDate) && endDate > Date.now() / 1000 &&
              (!Number.isFinite(startDate) || startDate <= Date.now() / 1000),
          permanent,
          expiresAt: !permanent && Number.isFinite(endDate) && endDate > 0
            ? new Date(endDate * 1000).toISOString()
            : null,
        })
      }
      if (pageLicenses.length < 100) {
        allPagesRead = true
        break
      }
    }
    if (!allPagesRead) {
      return respond({ error: 'Too many BuiltByBit licenses to safely verify in one claim. Contact support.' }, 413, origin)
    }

    return submitBuiltByBitClaim(user, buyerId, licenses, env, origin, respond)
  }

  if (path === '/account/license-key') {
    if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) {
      return licenseServiceUnavailable(origin)
    }
    let apiBase
    try {
      apiBase = new URL(env.LICENSE_API_URL)
    } catch {
      return respond({ error: 'The licensing service URL is invalid' }, 503, origin)
    }
    if (apiBase.protocol !== 'https:' || apiBase.username || apiBase.password) {
      return respond({ error: 'The licensing service URL must use HTTPS' }, 503, origin)
    }
    try {
      const upstream = await fetch(
        new URL(`/v1/admin/users/${encodeURIComponent(user.id)}/license-key`, apiBase),
        {
          headers: {
            Authorization: 'Bearer ' + env.LICENSE_ADMIN_API_TOKEN,
            'X-Admin-Actor': `customer:${user.id}`,
          },
          signal: AbortSignal.timeout(10000),
        },
      )
      const responseText = await upstream.text()
      if (responseText.length > 50000) {
        return respond({ error: 'The licensing service returned an oversized response' }, 502, origin)
      }
      let responsePayload
      try {
        responsePayload = JSON.parse(responseText)
      } catch {
        return respond({ error: 'The licensing service returned an invalid response' }, 502, origin)
      }
      return respond(responsePayload, upstream.status, origin)
    } catch (error) {
      console.error('Customer license key request failed:', error)
      return respond({ error: 'The licensing service is temporarily unavailable' }, 503, origin)
    }
  }

  let requestedAddresses
  if (path === '/account/license-ips' && request.method === 'PUT') {
    const body = await request.text()
    if (body.length > 2000) return respond({ error: 'Request is too large' }, 413, origin)

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      return respond({ error: 'Expected a JSON request' }, 400, origin)
    }
    if (
      !Array.isArray(payload?.addresses) ||
      payload.addresses.length > 3 ||
      payload.addresses.some(address => !isValidIpAddress(address)) ||
      new Set(payload.addresses).size !== payload.addresses.length
    ) {
      return respond({ error: 'Provide up to 3 unique, valid IPv4 or IPv6 addresses' }, 400, origin)
    }
    requestedAddresses = payload.addresses
  }

  if (path === '/account/license-ips') {
    if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) {
      return licenseServiceUnavailable(origin)
    }

    let apiBase
    try {
      apiBase = new URL(env.LICENSE_API_URL)
    } catch {
      return respond({ error: 'The licensing service URL is invalid' }, 503, origin)
    }
    if (apiBase.protocol !== 'https:' || apiBase.username || apiBase.password) {
      return respond({ error: 'The licensing service URL must use HTTPS' }, 503, origin)
    }

    try {
      const upstream = await fetch(
        new URL(`/v1/admin/users/${encodeURIComponent(user.id)}/license-ips`, apiBase),
        {
          method: request.method,
          headers: {
            Authorization: 'Bearer ' + env.LICENSE_ADMIN_API_TOKEN,
            'X-Admin-Actor': `customer:${user.id}`,
            ...(request.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(request.method === 'PUT' ? { body: JSON.stringify({ addresses: requestedAddresses }) } : {}),
          signal: AbortSignal.timeout(10000),
        },
      )
      const responseText = await upstream.text()
      if (responseText.length > 10000) {
        return respond({ error: 'The licensing service returned an oversized response' }, 502, origin)
      }
      let responsePayload
      try {
        responsePayload = JSON.parse(responseText)
      } catch {
        return respond({ error: 'The licensing service returned an invalid response' }, 502, origin)
      }
      return respond(responsePayload, upstream.status, origin)
    } catch (error) {
      console.error('Customer license IP request failed:', error)
      return respond({ error: 'The licensing service is temporarily unavailable' }, 503, origin)
    }
  }

  if (path === '/account/profile' || path === '/account/delete') {
    if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) {
      return licenseServiceUnavailable(origin)
    }

    let apiBase
    try {
      apiBase = new URL(env.LICENSE_API_URL)
    } catch {
      return respond({ error: 'The licensing service URL is invalid' }, 503, origin)
    }
    if (apiBase.protocol !== 'https:' || apiBase.username || apiBase.password) {
      return respond({ error: 'The licensing service URL must use HTTPS' }, 503, origin)
    }

    const identityPath = `/v1/admin/users/${encodeURIComponent(user.id)}`
    const isDelete = path === '/account/delete'
    try {
      const upstream = await fetch(
        new URL(isDelete ? identityPath : `${identityPath}/identity`, apiBase),
        {
          method: isDelete ? 'DELETE' : 'PUT',
          headers: {
            Authorization: 'Bearer ' + env.LICENSE_ADMIN_API_TOKEN,
            'X-Admin-Actor': `customer:${user.id}`,
            ...(!isDelete ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(!isDelete ? {
            body: JSON.stringify({
              username: user.username,
              globalName: user.globalName || user.username,
            }),
          } : {}),
          signal: AbortSignal.timeout(10000),
        },
      )
      const text = await upstream.text()
      if (text.length > 50000) {
        return respond({ error: 'The licensing service returned an oversized response' }, 502, origin)
      }
      let payload
      try {
        payload = JSON.parse(text)
      } catch {
        return respond({ error: 'The licensing service returned an invalid response' }, 502, origin)
      }
      return respond(payload, upstream.status, origin)
    } catch (error) {
      console.error('Customer account service request failed:', error)
      return respond({ error: 'The licensing service is temporarily unavailable' }, 503, origin)
    }
  }

  return licenseServiceUnavailable(origin)
}

async function adminApi(request, env, origin, path) {
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  const user = await verifyLoginToken(token, env)
  if (!user) return respond({ error: 'Sign in to access the admin dashboard' }, 401, origin)

  const access = await resolveAccess(user.id, env)
  if (!hasPermission(access, 'dashboard.view')) return respond({ error: 'Admin dashboard access is not available for this account' }, 403, origin)
  const permission = adminPermission(path, request.method)
  if (!path.startsWith('/admin/website/') && !permission) {
    return respond({ error: 'Admin route or method is not allowed' }, 404, origin)
  }
  if (permission && !hasPermission(access, permission)) return respond({ error: `Permission required: ${permission}` }, 403, origin)
  if (!env.ASSISTANT_LIMITER) {
    return respond({ error: 'Admin service is not configured' }, 503, origin)
  }
  const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: `admin:${user.id}` })
  if (!rateLimit.success) {
    return respond({ error: 'Please wait before using the admin dashboard again' }, 429, origin)
  }
  if (path.startsWith('/admin/website/')) return websiteAdminApi(request, env, path, user, access, respond, origin)
  if (!env.LICENSE_API_URL || !env.LICENSE_ADMIN_API_TOKEN) {
    return licenseServiceUnavailable(origin)
  }

  let baseUrl
  try {
    baseUrl = new URL(env.LICENSE_API_URL)
  } catch {
    return respond({ error: 'The licensing service URL is invalid' }, 503, origin)
  }
  if (baseUrl.protocol !== 'https:' || baseUrl.username || baseUrl.password) {
    return respond({ error: 'The licensing service URL must use HTTPS' }, 503, origin)
  }

  const incomingUrl = new URL(request.url)
  const upstreamUrl = new URL(`/v1${path}`, baseUrl)
  upstreamUrl.search = incomingUrl.search
  const headers = {
    Authorization: 'Bearer ' + env.LICENSE_ADMIN_API_TOKEN,
    'X-Admin-Actor': `${user.id}:${access.role}`,
  }
  const options = { method: request.method, headers, signal: AbortSignal.timeout(10000) }
  let registryPatch
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const body = await request.text()
    if (body.length > 8000) return respond({ error: 'Request is too large' }, 413, origin)
    if (body) {
      try {
        const parsed = JSON.parse(body)
        if (request.method === 'PATCH') {
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || !Object.keys(parsed).length ||
              Object.keys(parsed).some(key => !['active', 'name'].includes(key)) ||
              ('active' in parsed && typeof parsed.active !== 'boolean') ||
              ('name' in parsed && (typeof parsed.name !== 'string' || !parsed.name.trim() || parsed.name.length > 120))) {
            return respond({ error: 'Supply a name of 1–120 characters and/or an active boolean. Registry IDs cannot be changed.' }, 400, origin)
          }
          if ('name' in parsed) parsed.name = parsed.name.trim()
          registryPatch = parsed
        }
      } catch {
        return respond({ error: 'Expected a JSON request' }, 400, origin)
      }
      headers['Content-Type'] = 'application/json'
      options.body = registryPatch ? JSON.stringify(registryPatch) : body
    } else if (request.method === 'PATCH') {
      return respond({ error: 'Supply registry changes as JSON.' }, 400, origin)
    }
  }

  try {
    const upstream = await fetch(upstreamUrl, options)
    const responseBody = await upstream.text()
    if (responseBody.length > 50000) {
      return respond({ error: 'The licensing service returned an oversized response' }, 502, origin)
    }
    let payload
    try {
      payload = JSON.parse(responseBody)
    } catch {
      return respond({ error: 'The licensing service returned an invalid response' }, 502, origin)
    }
    if (registryPatch?.name && path.startsWith('/admin/plugins/') && upstream.status === 422) {
      return respond({ error: 'This licensing API does not support plugin name editing yet. Run the plugin-editing VPS updater from worker/README.md, rebuild api and bot, then retry.' }, 422, origin)
    }
    if (upstream.ok && registryPatch?.name && payload?.name !== registryPatch.name) {
      return respond({ error: 'The licensing API did not apply the new name. Refresh the registry and update the VPS API before retrying.' }, 502, origin)
    }
    return respond(payload, upstream.status, origin)
  } catch (error) {
    console.error('Admin licensing service request failed:', error)
    return respond({ error: 'The licensing service is temporarily unavailable' }, 503, origin)
  }
}

export default {
  async fetch(request, env) {
    const requestUrl = new URL(request.url)
    const path = requestUrl.pathname.startsWith('/api/')
      ? requestUrl.pathname.slice('/api'.length)
      : requestUrl.pathname
    if (path === '/auth/login') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      return startDiscordLogin(request, env)
    }
    if (path === '/auth/callback') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      return completeDiscordLogin(request, env)
    }

    const origin = request.headers.get('Origin') ?? requestUrl.origin
    if (!isAllowedOrigin(origin, env)) {
      return new Response('Forbidden', { status: 403 })
    }

    if (
      path !== '/chat' &&
      path !== '/bug-report' &&
      path !== '/reports' &&
      path !== '/dinosaur-discoveries' &&
      !path.startsWith('/community') &&
      path !== '/auth/me' &&
      path !== '/account/servers' &&
      path !== '/account/license-ips' &&
      path !== '/account/license-key' &&
      path !== '/account/builtbybit/authorize' &&
      path !== '/account/builtbybit/claim' &&
      path !== '/account/builtbybit/discord' &&
      path !== '/account/profile' &&
      path !== '/account/delete' &&
      !path.startsWith('/admin/')
    ) {
      return respond({ error: 'Not found' }, 404, origin)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': path.startsWith('/community')
            ? 'GET, POST, PUT, OPTIONS'
            : path === '/dinosaur-discoveries'
            ? 'GET, POST, OPTIONS'
            : path === '/auth/me' || path === '/account/servers'
              ? 'GET, OPTIONS'
              : path === '/account/license-ips'
                ? 'GET, PUT, OPTIONS'
                : path === '/account/builtbybit/authorize' || path === '/account/builtbybit/claim' || path === '/account/builtbybit/discord'
                  ? 'POST, OPTIONS'
                  : path === '/account/license-key'
                    ? 'GET, OPTIONS'
                : path === '/account/profile'
                  ? 'PUT, OPTIONS'
                : path === '/account/delete'
                  ? 'DELETE, OPTIONS'
                : path.startsWith('/admin/')
                  ? 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
              : 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Max-Age': '86400',
          'Vary': 'Origin',
        },
      })
    }

    if (path === '/auth/me') {
      if (request.method !== 'GET') return respond({ error: 'Method not allowed' }, 405, origin)
      const authorization = request.headers.get('Authorization') ?? ''
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
      const user = await verifyLoginToken(token, env)
      if (!user) return respond({ error: 'Sign-in has expired. Please sign in again.' }, 401, origin)
      try {
        const access = await resolveAccess(user.id, env)
        await rememberMember(user, env)
        const refreshThreshold = hasPermission(access, 'dashboard.view') ? 60 * 60 : 7 * 24 * 60 * 60
        const sessionToken = user.expiresAt - Math.floor(Date.now() / 1000) < refreshThreshold ? await createLoginToken(user, env) : undefined
        return respond({ user: { ...user, ...access }, ...(sessionToken ? { sessionToken } : {}) }, 200, origin)
      } catch (error) {
        console.error('Website access lookup failed:', error)
        return respond({ error: 'Website access could not be verified. Please try again later.' }, 503, origin)
      }
    }

    if (path.startsWith('/community') || path === '/bug-report' || path === '/reports') {
      try {
        return await handleCommunity(request, env, origin, path, { respond, verifyLoginToken, getAdminRole, getStaffMembers })
      } catch (error) {
        console.error('Community request failed unexpectedly:', error)
        return respond({ error: 'The community service is temporarily unavailable' }, 503, origin)
      }
    }

    if (path.startsWith('/admin/')) {
      try {
        return await adminApi(request, env, origin, path)
      } catch (error) {
        console.error('Admin dashboard request failed unexpectedly:', error)
        return respond({ error: 'The admin service encountered an internal error. Check the Worker logs.' }, 500, origin)
      }
    }

    if (
      path === '/account/servers' ||
      path === '/account/license-ips' ||
      path === '/account/license-key' ||
      path === '/account/builtbybit/authorize' ||
      path === '/account/builtbybit/claim' ||
      path === '/account/builtbybit/discord' ||
      path === '/account/profile' ||
      path === '/account/delete'
    ) {
      const response = await accountLicenseApi(request, env, origin, path)
      if (response.status >= 500) {
        const authorization = request.headers.get('Authorization') || ''
        const user = await verifyLoginToken(authorization.startsWith('Bearer ') ? authorization.slice(7) : '', env)
        if (!user || !await getAdminRole(user.id, env)) {
          console.error('Customer licensing request failed:', path, response.status)
          return respond({
            error: 'The license system is temporarily unavailable or being worked on. Please try again later.',
            code: 'LICENSE_SERVICE_UNAVAILABLE',
          }, response.status, origin)
        }
      }
      return response
    }

    if (path === '/dinosaur-discoveries') {
      if (request.method !== 'GET' && request.method !== 'POST') {
        return respond({ error: 'Method not allowed' }, 405, origin)
      }
      return dinosaurDiscoveries(request, env, origin)
    }

    if (request.method !== 'POST') {
      return respond({ error: 'Method not allowed' }, 405, origin)
    }

    if (!env.DEEPSEEK_API_KEY) {
      return respond({ error: 'Assistant is not configured' }, 503, origin)
    }

    const ip = request.headers.get('CF-Connecting-IP')
    if (!ip) return respond({ error: 'Request could not be verified' }, 400, origin)

    const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: ip })
    if (!rateLimit.success) {
      return respond({ error: 'Please wait a moment before asking another question' }, 429, origin)
    }

    const body = await request.text()
    if (body.length > 6000) {
      return respond({ error: 'Request is too large' }, 413, origin)
    }

    let payload
    try {
      payload = JSON.parse(body)
    } catch {
      return respond({ error: 'Expected a JSON request' }, 400, origin)
    }

    const question = typeof payload?.question === 'string' ? payload.question.trim() : ''
    const context = Array.isArray(payload?.context) ? payload.context.slice(0, 4) : []
    if (!question || question.length > 500) {
      return respond({ error: 'Question must be between 1 and 500 characters' }, 400, origin)
    }

    const excerpts = context
      .filter(item => typeof item?.title === 'string' && typeof item?.text === 'string')
      .slice(0, 4)
      .map(item => `## ${item.title.slice(0, 80)}\n${item.text.slice(0, 1000)}`)
      .join('\n\n')
      .slice(0, 4200)

    let upstream
    try {
      upstream = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          temperature: 0.3,
          max_tokens: 90,
          messages: [
            {
              role: 'system',
              content: 'You are Lumen Studios’ Minecraft plugin docs assistant. Reply in at most 2 short bullets and 40 words. Use only supplied docs; never guess commands, permissions, versions, settings, or behavior. If unknown, say so and point to https://discord.gg/lumenstudios.',
            },
            { role: 'user', content: `Documentation excerpts:\n${excerpts || '(No matching excerpts found.)'}\n\nQuestion:\n${question}` },
          ],
        }),
        signal: AbortSignal.timeout(20000),
      })
    } catch {
      return respond({ error: 'Assistant provider is temporarily unavailable' }, 502, origin)
    }

    if (!upstream.ok) {
      return respond({ error: 'Assistant provider returned an error' }, 502, origin)
    }

    let result
    try {
      result = await upstream.json()
    } catch {
      return respond({ error: 'Assistant provider returned an invalid response' }, 502, origin)
    }

    const answer = result?.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) {
      return respond({ error: 'Assistant provider returned an empty answer' }, 502, origin)
    }

    return respond({ answer: answer.trim() }, 200, origin)
  },

  async scheduled(_event, env, context) {
    context.waitUntil(runCommunityChecks(env).catch(() => undefined))
  },
}
