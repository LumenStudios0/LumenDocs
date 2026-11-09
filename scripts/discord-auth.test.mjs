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
    },
  })
}

function env(overrides = {}) {
  return {
    ALLOWED_ORIGIN: origin,
    DISCORD_CLIENT_ID: 'discord-client-id',
    DISCORD_CLIENT_SECRET: 'discord-client-secret',
    AUTH_SIGNING_SECRET: signingSecret,
    ...overrides,
  }
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

test('Discord callback exchanges the code and returns a verifiable one-hour identity token', async t => {
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
})

test('Discord profile endpoint rejects invalid bearer tokens', async () => {
  const response = await worker.fetch(
    request('/auth/me', { origin, authorization: 'Bearer invalid' }),
    env(),
  )
  assert.equal(response.status, 401)
})
