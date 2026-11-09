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
  const claims = {
    iss: 'lumen-studios',
    aud: 'lumen-docs',
    sub: user.id,
    username: user.username,
    globalName: user.global_name || user.username,
    avatarUrl: user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : '',
    iat: now,
    exp: now + 3600,
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
  const callbackUrl = new URL('/auth/callback', request.url).toString()
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

  const callbackUrl = new URL('/auth/callback', request.url).toString()
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
      headers: { Authorization: `Bearer ${tokenPayload.access_token}` },
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

function cleanReportValue(value, maxLength) {
  return value
    .trim()
    .slice(0, maxLength)
    .replace(/@/g, '@\u200b')
    .replace(/([\\`*_~|])/g, '\\$1')
}

async function submitReport(request, env, origin) {
  if (!env.DISCORD_BUG_REPORT_WEBHOOK) {
    return respond({ error: 'Reports are not configured yet' }, 503, origin)
  }

  const ip = request.headers.get('CF-Connecting-IP')
  if (!ip) return respond({ error: 'Request could not be verified' }, 400, origin)

  const rateLimit = await env.ASSISTANT_LIMITER.limit({ key: `reports:${ip}` })
  if (!rateLimit.success) {
    return respond({ error: 'Please wait a moment before submitting another report' }, 429, origin)
  }

  const body = await request.text()
  if (body.length > 8000) return respond({ error: 'Report is too large' }, 413, origin)

  let payload
  try {
    payload = JSON.parse(body)
  } catch {
    return respond({ error: 'Expected a JSON request' }, 400, origin)
  }

  const fields = {
    type: typeof payload?.type === 'string' ? payload.type.trim() : 'bug',
    plugin: typeof payload?.plugin === 'string' ? payload.plugin.trim() : '',
    serverSoftware: typeof payload?.serverSoftware === 'string' ? payload.serverSoftware.trim() : '',
    version: typeof payload?.version === 'string' ? payload.version.trim() : '',
    status: typeof payload?.status === 'string' ? payload.status.trim() : '',
    discordUsername: typeof payload?.discordUsername === 'string' ? payload.discordUsername.trim() : '',
    productKey: typeof payload?.productKey === 'string' ? payload.productKey.trim() : '',
    consoleLog: typeof payload?.consoleLog === 'string' ? payload.consoleLog.trim() : '',
    description: typeof payload?.description === 'string' ? payload.description.trim() : '',
    title: typeof payload?.title === 'string' ? payload.title.trim() : '',
  }
  if (!['bug', 'compatibility', 'feature'].includes(fields.type)) {
    return respond({ error: 'Choose a valid report type' }, 400, origin)
  }

  const requiredByType = {
    bug: ['plugin', 'serverSoftware', 'version', 'description'],
    compatibility: ['plugin', 'serverSoftware', 'version', 'status', 'description'],
    feature: ['title', 'description'],
  }
  if (requiredByType[fields.type].some(field => !fields[field])) {
    return respond({ error: 'Fill in all required report fields' }, 400, origin)
  }
  if (fields.type === 'compatibility' && !['untested', 'broken', 'partial', 'working'].includes(fields.status)) {
    return respond({ error: 'Choose a valid compatibility status' }, 400, origin)
  }
  if (
    fields.type.length > 20 ||
    fields.plugin.length > 100 ||
    fields.serverSoftware.length > 100 ||
    fields.version.length > 60 ||
    fields.status.length > 20 ||
    fields.discordUsername.length > 100 ||
    fields.productKey.length > 200 ||
    fields.consoleLog.length > 2000 ||
    fields.description.length > 2000 ||
    fields.title.length > 120
  ) {
    return respond({ error: 'One or more report fields are too long' }, 400, origin)
  }

  const reportNames = {
    bug: 'Bug Report',
    compatibility: 'Compatibility Report',
    feature: 'Feature Request',
  }
  const embedField = (name, value, maxLength) => ({
    name,
    value: cleanReportValue(value, maxLength) || 'Not provided',
    inline: false,
  })
  const fieldsByType = {
    bug: [
      embedField('Plugin', fields.plugin, 100),
      embedField('Discord username', fields.discordUsername, 100),
      embedField('Server software', fields.serverSoftware, 100),
      embedField('Version number', fields.version, 60),
      embedField('Product key', fields.productKey, 200),
      embedField('Console log message', fields.consoleLog, 2000),
      embedField('What happened', fields.description, 2000),
    ],
    compatibility: [
      embedField('Plugin', fields.plugin, 100),
      embedField('Server software', fields.serverSoftware, 100),
      embedField('Version number', fields.version, 60),
      embedField('Compatibility status', fields.status, 20),
      embedField('Details', fields.description, 2000),
    ],
    feature: [
      embedField('Request', fields.title, 120),
      embedField('Plugin', fields.plugin, 100),
      embedField('Discord username', fields.discordUsername, 100),
      embedField('Description and use case', fields.description, 2000),
    ],
  }
  const report = {
    username: 'Lumen Studios Reports',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: `New ${reportNames[fields.type]}`,
      color: 0x7B3FF2,
      fields: fieldsByType[fields.type],
      timestamp: new Date().toISOString(),
      footer: { text: `Lumen Studios Reports · ${fields.type}` },
    }],
  }

  let upstream
  try {
    upstream = await fetch(env.DISCORD_BUG_REPORT_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(10000),
    })
  } catch {
    return respond({ error: 'Could not deliver the report. Please try again later.' }, 502, origin)
  }

  if (!upstream.ok) {
    return respond({ error: 'Could not deliver the report. Please try again later.' }, 502, origin)
  }

  return respond({ ok: true }, 200, origin)
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
  if (path === '/account/license-ips' && request.method !== 'GET' && request.method !== 'PUT') {
    return respond({ error: 'Method not allowed' }, 405, origin)
  }

  if (request.method === 'PUT') {
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
  }

  return respond({
    error: 'The license service is not connected yet',
    code: 'LICENSE_SERVICE_UNAVAILABLE',
  }, 503, origin)
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname
    if (path === '/auth/login') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      return startDiscordLogin(request, env)
    }
    if (path === '/auth/callback') {
      if (request.method !== 'GET') return new Response('Method not allowed', { status: 405 })
      return completeDiscordLogin(request, env)
    }

    const origin = request.headers.get('Origin')
    if (!origin || origin !== env.ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 })
    }

    if (
      path !== '/chat' &&
      path !== '/bug-report' &&
      path !== '/reports' &&
      path !== '/dinosaur-discoveries' &&
      path !== '/auth/me' &&
      path !== '/account/servers' &&
      path !== '/account/license-ips'
    ) {
      return respond({ error: 'Not found' }, 404, origin)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': path === '/dinosaur-discoveries'
            ? 'GET, POST, OPTIONS'
            : path === '/auth/me' || path === '/account/servers'
              ? 'GET, OPTIONS'
              : path === '/account/license-ips'
                ? 'GET, PUT, OPTIONS'
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
      return respond({ user }, 200, origin)
    }

    if (path === '/account/servers' || path === '/account/license-ips') {
      return accountLicenseApi(request, env, origin, path)
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

    if (path === '/bug-report' || path === '/reports') {
      return submitReport(request, env, origin)
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
}
