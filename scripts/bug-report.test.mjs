import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/chat.js'

const origin = 'https://lumenstudio.fyi'

function makeRequest(payload, options = {}) {
  return new Request(`https://worker.example/bug-report`, {
    method: options.method ?? 'POST',
    headers: {
      Origin: options.origin ?? origin,
      'CF-Connecting-IP': '203.0.113.10',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
  })
}

function makeEnv(overrides = {}) {
  return {
    ALLOWED_ORIGIN: origin,
    DISCORD_BUG_REPORT_WEBHOOK: 'https://discord.example/webhook',
    ASSISTANT_LIMITER: { limit: async () => ({ success: true }) },
    ...overrides,
  }
}

test('bug report rejects requests from unapproved origins', async () => {
  const response = await worker.fetch(makeRequest({}, { origin: 'https://untrusted.example' }), makeEnv())
  assert.equal(response.status, 403)
})

test('bug report requires all required fields', async () => {
  const response = await worker.fetch(makeRequest({ plugin: 'LumenShards' }), makeEnv())
  assert.equal(response.status, 400)
})

test('bug report sends a formatted, mention-safe Discord embed', async t => {
  const originalFetch = globalThis.fetch
  let sent
  globalThis.fetch = async (url, options) => {
    sent = { url, body: JSON.parse(options.body) }
    return new Response(null, { status: 204 })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const response = await worker.fetch(makeRequest({
    plugin: 'LumenShards',
    serverSoftware: 'Paper',
    version: '1.21.4',
    productKey: '',
    consoleLog: 'Error: test',
    description: 'It broke @everyone *check*',
  }), makeEnv())

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { ok: true })
  assert.equal(sent.url, 'https://discord.example/webhook')
  assert.deepEqual(sent.body.allowed_mentions, { parse: [] })
  assert.equal(sent.body.embeds[0].color, 0x7B3FF2)
  assert.equal(sent.body.embeds[0].fields[0].value, 'LumenShards')
  assert.match(sent.body.embeds[0].fields[5].value, /@\u200beveryone/)
})

test('bug report returns an error when Discord rejects delivery', async t => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(null, { status: 404 })
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const response = await worker.fetch(makeRequest({
    plugin: 'LumenShards',
    serverSoftware: 'Paper',
    version: '1.21.4',
    description: 'Example issue',
  }), makeEnv())

  assert.equal(response.status, 502)
  assert.match((await response.json()).error, /Could not deliver/)
})
