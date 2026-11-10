import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/chat.js'

const origin = 'https://lumenstudio.fyi'
const signingSecret = 'test-secret-with-at-least-32-characters'

function request(path, options = {}) {
  return new Request(`https://worker.example${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.origin ? { Origin: options.origin } : {}),
      ...(options.cookie ? { Cookie: options.cookie } : {}),
      ...(options.authorization ? { Authorization: options.authorization } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
}

function env(overrides = {}) {
  return {
    ALLOWED_ORIGIN: origin,
    DISCORD_CLIENT_ID: 'discord-client-id',
    DISCORD_CLIENT_SECRET: 'discord-client-secret',
    AUTH_SIGNING_SECRET: signingSecret,
    ASSISTANT_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  }
}

async function createSessionToken(t, discordId = '123456789') {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async url => {
    if (String(url).endsWith('/oauth2/token')) {
      return Response.json({ access_token: 'discord-access-token' })
    }
    if (String(url).endsWith('/api/users/@me')) {
      return Response.json({ id: discordId, username: 'lumen-user' })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const response = await worker.fetch(
    request('/auth/callback?code=authorization-code&state=valid-state', {
      cookie: 'lumen_discord_oauth_state=valid-state',
    }),
    env(),
  )
  const redirect = new URL(response.headers.get('Location'))
  return new URLSearchParams(redirect.hash.slice(1)).get('discord_token')
}

function encodeBase64Url(value) {
  return btoa(typeof value === 'string' ? value : JSON.stringify(value))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

async function createExpiringSessionToken(expiresInSeconds) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${encodeBase64Url({ alg: 'HS256', typ: 'JWT' })}.${encodeBase64Url({
    iss: 'lumen-studios',
    aud: 'lumen-docs',
    sub: '123456789',
    username: 'lumen-user',
    globalName: 'Lumen User',
    avatarUrl: '',
    iat: now,
    exp: now + expiresInSeconds,
  })}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  const bytes = [...new Uint8Array(signature)]
  const binary = bytes.map(byte => String.fromCharCode(byte)).join('')
  return `${unsigned}.${btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}`
}

test('Discord login sends the user to OAuth with state protected by a secure cookie', async () => {
  const response = await worker.fetch(request('/auth/login'), env())
  const redirect = new URL(response.headers.get('Location'))
  const cookie = response.headers.get('Set-Cookie')

  assert.equal(redirect.origin, 'https://discord.com')
  assert.equal(redirect.pathname, '/oauth2/authorize')
  assert.equal(redirect.searchParams.get('client_id'), 'discord-client-id')
  assert.equal(redirect.searchParams.get('scope'), 'identify')
  assert.equal(redirect.searchParams.get('redirect_uri'), 'https://worker.example/auth/callback')
  assert.equal(redirect.searchParams.get('state').length, 43)
  assert.match(cookie, /HttpOnly/)
  assert.match(cookie, /Secure/)
  assert.match(cookie, /SameSite=Lax/)
})

test('Discord login reports missing OAuth configuration without redirecting to Discord', async () => {
  const response = await worker.fetch(request('/auth/login'), env({ AUTH_SIGNING_SECRET: '' }))

  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Location'), `${origin}/#discord_login=unavailable`)
})

test('Discord callback rejects mismatched OAuth state without contacting Discord', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('Discord must not be contacted for invalid state')
  }
  try {
    const response = await worker.fetch(
      request('/auth/callback?code=unused&state=wrong', { cookie: 'lumen_discord_oauth_state=expected' }),
      env(),
    )
    assert.equal(response.status, 400)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Discord callback exchanges the code and returns a verifiable persistent identity token', async t => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options) => {
    requests.push({ url: String(url), options })
    if (String(url).endsWith('/oauth2/token')) {
      return Response.json({ access_token: 'discord-access-token' })
    }
    if (String(url).endsWith('/api/users/@me')) {
      return Response.json({
        id: '123456789',
        username: 'lumen-user',
        global_name: 'Lumen User',
        avatar: 'avatar-hash',
      })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const callback = await worker.fetch(
    request('/auth/callback?code=authorization-code&state=valid-state', {
      cookie: 'lumen_discord_oauth_state=valid-state',
    }),
    env(),
  )
  const callbackUrl = new URL(callback.headers.get('Location'))
  const token = new URLSearchParams(callbackUrl.hash.slice(1)).get('discord_token')

  assert.equal(callback.status, 302)
  assert.equal(callbackUrl.origin, origin)
  assert.equal(callbackUrl.hash.startsWith('#discord_token='), true)
  assert.match(callback.headers.get('Set-Cookie'), /Max-Age=0/)
  assert.equal(requests.length, 2)
  assert.match(requests[0].options.body.toString(), /grant_type=authorization_code/)
  assert.equal(requests[1].options.headers.Authorization, 'Bearer discord-access-token')

  const profile = await worker.fetch(
    request('/auth/me', { origin, authorization: `Bearer ${token}` }),
    env(),
  )
  const { user } = await profile.json()
  assert.equal(profile.status, 200)
  assert.equal(user.id, '123456789')
  assert.equal(user.username, 'lumen-user')
  assert.equal(user.globalName, 'Lumen User')
  assert.equal(user.avatarUrl, 'https://cdn.discordapp.com/avatars/123456789/avatar-hash.png?size=64')
  assert.ok(user.expiresAt > Math.floor(Date.now() / 1000))
  assert.ok(user.expiresAt - Math.floor(Date.now() / 1000) > 29 * 24 * 60 * 60)
})

test('Discord profile endpoint rejects invalid bearer tokens', async () => {
  const response = await worker.fetch(
    request('/auth/me', { origin, authorization: 'Bearer invalid' }),
    env(),
  )
  assert.equal(response.status, 401)
})

test('active customer sessions renew before expiring', async () => {
  const token = await createExpiringSessionToken(5 * 24 * 60 * 60)
  const response = await worker.fetch(
    request('/auth/me', { origin, authorization: `Bearer ${token}` }),
    env(),
  )
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(typeof result.sessionToken, 'string')
  const refreshedClaims = JSON.parse(
    Buffer.from(result.sessionToken.split('.')[1], 'base64url').toString('utf8'),
  )
  assert.ok(refreshedClaims.exp - Math.floor(Date.now() / 1000) > 29 * 24 * 60 * 60)
})

test('BuiltByBit linking starts an OAuth flow bound to the signed-in Discord account', async t => {
  const token = await createSessionToken(t)
  const response = await worker.fetch(
    request('/account/builtbybit/authorize', {
      method: 'POST',
      origin,
      authorization: `Bearer ${token}`,
    }),
    env({
      BUILDBYBIT_CLIENT_ID: 'bb-client-id',
      BUILDBYBIT_CLIENT_SECRET: 'bb-client-secret',
      BUILDBYBIT_RESOURCE_IDS: '7001,7002',
    }),
  )
  const result = await response.json()
  const authorizeUrl = new URL(result.authorizeUrl)

  assert.equal(response.status, 200)
  assert.equal(authorizeUrl.origin, 'https://builtbybit.com')
  assert.equal(authorizeUrl.pathname, '/account/external/authorize')
  assert.equal(authorizeUrl.searchParams.get('client_id'), 'bb-client-id')
  assert.equal(authorizeUrl.searchParams.get('redirect_uri'), `${origin}/account/licenses/`)
  assert.equal(authorizeUrl.searchParams.get('response_type'), 'code')
  assert.equal(authorizeUrl.searchParams.get('state'), result.state)
  assert.equal(result.state.split('.').length, 3)
})

test('BuiltByBit claim verifies the OAuth buyer and proxies only licensed resources', async t => {
  const token = await createSessionToken(t)
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    if (String(url).endsWith('/oauth2/token')) {
      return Response.json({ access_token: 'builtbybit-user-token' })
    }
    if (String(url).endsWith('/v2/members/self')) {
      assert.equal(options.headers.Authorization, 'Bearer builtbybit-user-token')
      return Response.json({ result: 'success', data: { self: { user_id: '998877' } } })
    }
    if (String(url).includes('/v2/resources/discover/licenses')) {
      assert.equal(options.headers.Authorization, 'Bearer builtbybit-user-token')
      return Response.json({
        result: 'success',
        data: {
          licenses: [
            { content_type: 'resource', content_id: 7001, buyer_id: 998877, permanent: true, active: true },
            { content_type: 'resource', content_id: 9001, buyer_id: 998877, permanent: true, active: true },
            { content_type: 'resource', content_id: 7002, buyer_id: 123456, permanent: true, active: true },
          ],
        },
      })
    }
    if (String(url) === 'https://licenses.example/v1/admin/users/123456789/builtbybit/claim') {
      assert.equal(options.method, 'POST')
      assert.equal(options.headers.Authorization, 'Bearer license-admin-token')
      return Response.json({
        licenseKey: 'LUMEN-shared-customer-license',
        claimedProductIds: ['auction'],
      }, { status: 201 })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const workerEnv = env({
    BUILDBYBIT_CLIENT_ID: 'bb-client-id',
    BUILDBYBIT_CLIENT_SECRET: 'bb-client-secret',
    BUILDBYBIT_RESOURCE_IDS: '7001,7002',
    LICENSE_API_URL: 'https://licenses.example',
    LICENSE_ADMIN_API_TOKEN: 'license-admin-token',
  })
  const authorize = await worker.fetch(
    request('/account/builtbybit/authorize', {
      method: 'POST',
      origin,
      authorization: `Bearer ${token}`,
    }),
    workerEnv,
  )
  const { state } = await authorize.json()
  const response = await worker.fetch(
    request('/account/builtbybit/claim', {
      method: 'POST',
      origin,
      authorization: `Bearer ${token}`,
      body: { code: 'short-lived-auth-code', state },
    }),
    workerEnv,
  )
  const result = await response.json()

  assert.equal(response.status, 201)
  assert.equal(result.licenseKey, 'LUMEN-shared-customer-license')
  assert.equal(requests.length, 4)
  const tokenRequest = requests.find(item => item.url.endsWith('/oauth2/token'))
  assert.match(tokenRequest.options.headers.Authorization, /^Basic /)
  assert.match(tokenRequest.options.body.toString(), /grant_type=authorization_code/)
  const claimRequest = requests.at(-1)
  const claimBody = JSON.parse(claimRequest.options.body)
  assert.equal(claimBody.buyerId, '998877')
  assert.deepEqual(claimBody.licenses.map(item => item.resourceId), [7001])
})

test('BuiltByBit claim rejects state issued for another Discord account', async t => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('BuiltByBit must not be contacted for mismatched state')
  }
  t.after(() => { globalThis.fetch = originalFetch })

  const ownerToken = await createSessionToken(t, '123456789')
  const otherToken = await createSessionToken(t, '987654321')
  const workerEnv = env({
    BUILDBYBIT_CLIENT_ID: 'bb-client-id',
    BUILDBYBIT_CLIENT_SECRET: 'bb-client-secret',
    BUILDBYBIT_RESOURCE_IDS: '7001,7002',
    LICENSE_API_URL: 'https://licenses.example',
    LICENSE_ADMIN_API_TOKEN: 'license-admin-token',
  })
  const authorize = await worker.fetch(
    request('/account/builtbybit/authorize', {
      method: 'POST',
      origin,
      authorization: `Bearer ${ownerToken}`,
    }),
    workerEnv,
  )
  const { state } = await authorize.json()
  const response = await worker.fetch(
    request('/account/builtbybit/claim', {
      method: 'POST',
      origin,
      authorization: `Bearer ${otherToken}`,
      body: { code: 'unused-code', state },
    }),
    workerEnv,
  )

  assert.equal(response.status, 400)
})

test('account license endpoints require a valid Discord session', async () => {
  const response = await worker.fetch(
    request('/account/servers', { origin }),
    env(),
  )

  assert.equal(response.status, 401)
  assert.match((await response.json()).error, /Sign in/)
})

test('account server endpoint clearly reports the unconnected license service', async t => {
  const token = await createSessionToken(t)
  const response = await worker.fetch(
    request('/account/servers', { origin, authorization: `Bearer ${token}` }),
    env(),
  )
  const result = await response.json()

  assert.equal(response.status, 503)
  assert.equal(result.code, 'LICENSE_SERVICE_UNAVAILABLE')
})

test('account IP endpoint validates addresses and reports an unconnected license service', async t => {
  const token = await createSessionToken(t)
  const invalid = await worker.fetch(
    request('/account/license-ips', {
      method: 'PUT',
      origin,
      authorization: `Bearer ${token}`,
      body: { addresses: ['192.0.2.1', '192.0.2.2', '192.0.2.3', '192.0.2.4'] },
    }),
    env(),
  )
  const valid = await worker.fetch(
    request('/account/license-ips', {
      method: 'PUT',
      origin,
      authorization: `Bearer ${token}`,
      body: { addresses: ['192.0.2.1', '2001:db8::1'] },
    }),
    env(),
  )

  assert.equal(invalid.status, 400)
  assert.equal(valid.status, 503)
  assert.equal((await valid.json()).code, 'LICENSE_SERVICE_UNAVAILABLE')
})

test('account IP endpoint proxies reads and updates for the signed-in Discord account', async t => {
  const token = await createSessionToken(t)
  const actualFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options })
    return Response.json({ addresses: ['203.0.113.8'], maxAddresses: 3 })
  }
  t.after(() => { globalThis.fetch = actualFetch })

  const workerEnv = env({
    LICENSE_API_URL: 'https://licenses.example',
    LICENSE_ADMIN_API_TOKEN: 'server-only-secret',
  })
  const readResponse = await worker.fetch(
    request('/account/license-ips', { origin, authorization: 'Bearer ' + token }),
    workerEnv,
  )
  const updateResponse = await worker.fetch(
    request('/account/license-ips', {
      method: 'PUT',
      origin,
      authorization: 'Bearer ' + token,
      body: { addresses: ['203.0.113.9'] },
    }),
    workerEnv,
  )

  assert.equal(readResponse.status, 200)
  assert.equal(updateResponse.status, 200)
  assert.equal(requests.length, 2)
  assert.equal(requests[0].url, 'https://licenses.example/v1/admin/users/123456789/license-ips')
  assert.equal(requests[0].options.method, 'GET')
  assert.equal(requests[1].options.method, 'PUT')
  assert.equal(requests[1].options.headers.Authorization, 'Bearer ' + workerEnv.LICENSE_ADMIN_API_TOKEN)
  assert.deepEqual(JSON.parse(requests[1].options.body), { addresses: ['203.0.113.9'] })
})

test('customer profile sync uses the verified Discord identity, not a browser-supplied ID', async t => {
  const actualFetch = globalThis.fetch
  const token = await createSessionToken(t)
  let upstreamRequest
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options }
    return Response.json({ discordId: '123456789', username: 'lumen-user' })
  }

  try {
    const response = await worker.fetch(
      request('/account/profile', {
        method: 'PUT',
        origin,
        authorization: `Bearer ${token}`,
        body: { discordId: '999999999', username: 'forged' },
      }),
      env({
        LICENSE_API_URL: 'https://licenses.example',
        LICENSE_ADMIN_API_TOKEN: 'server-only-secret',
      }),
    )
    assert.equal(response.status, 200)
    assert.equal(upstreamRequest.url, 'https://licenses.example/v1/admin/users/123456789/identity')
    assert.equal(upstreamRequest.options.method, 'PUT')
    assert.deepEqual(JSON.parse(upstreamRequest.options.body), {
      username: 'lumen-user',
      globalName: 'lumen-user',
    })
    assert.equal(upstreamRequest.options.headers['X-Admin-Actor'], 'customer:123456789')
  } finally {
    globalThis.fetch = actualFetch
  }
})

test('customer account deletion only targets the authenticated Discord account', async t => {
  const actualFetch = globalThis.fetch
  const token = await createSessionToken(t)
  let upstreamRequest
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options }
    return Response.json({ deleted: true })
  }

  try {
    const response = await worker.fetch(
      request('/account/delete', {
        method: 'DELETE',
        origin,
        authorization: `Bearer ${token}`,
        body: { discordId: '999999999' },
      }),
      env({
        LICENSE_API_URL: 'https://licenses.example',
        LICENSE_ADMIN_API_TOKEN: 'server-only-secret',
      }),
    )
    assert.equal(response.status, 200)
    assert.equal(upstreamRequest.url, 'https://licenses.example/v1/admin/users/123456789')
    assert.equal(upstreamRequest.options.method, 'DELETE')
    assert.equal(upstreamRequest.options.headers['X-Admin-Actor'], 'customer:123456789')
  } finally {
    globalThis.fetch = actualFetch
  }
})

test('admin roles are included only for the configured Discord accounts', async t => {
  const ownerToken = await createSessionToken(t, '1400375985211441242')
  const ownerResponse = await worker.fetch(
    request('/auth/me', { origin, authorization: `Bearer ${ownerToken}` }),
    env(),
  )
  const owner = await ownerResponse.json()
  assert.equal(owner.user.role, 'owner')
})

test('admin routes deny non-admin Discord sessions before contacting the license service', async t => {
  const token = await createSessionToken(t)
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('The licensing service must not be contacted')
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const response = await worker.fetch(
    request('/admin/users', { origin, authorization: `Bearer ${token}` }),
    env({ LICENSE_API_URL: 'https://licenses.example', LICENSE_ADMIN_API_TOKEN: 'server-secret' }),
  )
  assert.equal(response.status, 403)
})

test('additional staff IDs can be authorized through the Worker configuration', async t => {
  const token = await createSessionToken(t)
  const response = await worker.fetch(
    request('/admin/users', { origin, authorization: `Bearer ${token}` }),
    env({ ADMIN_DISCORD_IDS: '123456789' }),
  )

  assert.equal(response.status, 503)
  assert.equal((await response.json()).code, 'LICENSE_SERVICE_UNAVAILABLE')
})

test('owner admin requests proxy with server-only credentials and actor attribution', async t => {
  const actualFetch = globalThis.fetch
  const token = await createSessionToken(t, '1400375985211441242')
  let upstreamRequest
  globalThis.fetch = async (url, options) => {
    upstreamRequest = { url: String(url), options }
    return Response.json({ items: [], total: 0 })
  }

  let response
  let deletion
  try {
    response = await worker.fetch(
      request('/admin/users?query=1400375985211441242', {
        origin,
        authorization: `Bearer ${token}`,
      }),
      env({
        LICENSE_API_URL: 'https://licenses.example/',
        LICENSE_ADMIN_API_TOKEN: 'server-only-secret',
      }),
    )
    deletion = await worker.fetch(
      request('/admin/users/123456789012345678', {
        method: 'DELETE',
        origin,
        authorization: `Bearer ${token}`,
      }),
      env({
        LICENSE_API_URL: 'https://licenses.example/',
        LICENSE_ADMIN_API_TOKEN: 'server-only-secret',
      }),
    )
  } finally {
    globalThis.fetch = actualFetch
  }

  assert.equal(response.status, 200)
  assert.equal(upstreamRequest.url, 'https://licenses.example/v1/admin/users/123456789012345678')
  assert.equal(upstreamRequest.options.headers.Authorization, 'Bearer server-only-secret')
  assert.equal(upstreamRequest.options.headers['X-Admin-Actor'], '1400375985211441242:owner')
  assert.equal((await response.json()).total, 0)
  assert.equal(deletion.status, 200)
  assert.equal(upstreamRequest.options.method, 'DELETE')
})

test('admin worker failures return a CORS-enabled JSON error instead of a browser fetch failure', async t => {
  const token = await createSessionToken(t, '1400375985211441242')
  const response = await worker.fetch(
    request('/admin/users', { origin, authorization: `Bearer ${token}` }),
    env({
      ASSISTANT_LIMITER: {
        limit: async () => { throw new Error('rate limiter unavailable') },
      },
    }),
  )

  assert.equal(response.status, 500)
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin)
  assert.match((await response.json()).error, /Worker logs/)
})

test('Worker accepts only explicitly configured Lumen site origins', async () => {
  const allowedOrigin = 'https://www.lumenstudio.fyi'
  const allowedResponse = await worker.fetch(
    request('/admin/users', {
      origin: allowedOrigin,
      authorization: 'Bearer invalid',
    }),
    env({ ALLOWED_ORIGINS: 'https://www.lumenstudio.fyi,https://lumenstudios0.github.io' }),
  )
  const deniedResponse = await worker.fetch(
    request('/admin/users', {
      origin: 'https://unrelated.example',
      authorization: 'Bearer invalid',
    }),
    env({ ALLOWED_ORIGINS: 'https://www.lumenstudio.fyi,https://lumenstudios0.github.io' }),
  )

  assert.equal(allowedResponse.status, 401)
  assert.equal(allowedResponse.headers.get('Access-Control-Allow-Origin'), allowedOrigin)
  assert.equal(deniedResponse.status, 403)
  assert.equal(deniedResponse.headers.get('Access-Control-Allow-Origin'), null)
})
