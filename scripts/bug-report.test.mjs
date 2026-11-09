import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/chat.js'

const origin = 'https://lumenstudio.fyi'

function makeRequest(payload, options = {}) {
  return new Request(`https://worker.example${options.path ?? '/bug-report'}`, {
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
    discordUsername: 'LumenPlayer',
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
  assert.equal(sent.body.embeds[0].fields[1].value, 'LumenPlayer')
  assert.match(sent.body.embeds[0].fields[6].value, /@\u200beveryone/)
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

test('reports accepts all compatibility statuses and delivers them to the shared inbox', async t => {
  const originalFetch = globalThis.fetch
  const delivered = []
  globalThis.fetch = async (url, options) => {
    delivered.push({ url, body: JSON.parse(options.body) })
    return new Response(null, { status: 204 })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  for (const status of ['untested', 'broken', 'partial', 'working']) {
    const response = await worker.fetch(makeRequest({
      type: 'compatibility',
      plugin: 'LumenShards',
      serverSoftware: 'Paper',
      version: '1.21.4',
      status,
      description: 'Tested on a clean server',
    }, { path: '/reports' }), makeEnv())

    assert.equal(response.status, 200)
  }

  assert.equal(delivered.length, 4)
  for (const { url, body } of delivered) {
    assert.equal(url, 'https://discord.example/webhook')
    assert.equal(body.embeds[0].title, 'New Compatibility Report')
    assert.deepEqual(body.allowed_mentions, { parse: [] })
  }
  assert.deepEqual(
    delivered.map(report => report.body.embeds[0].fields[3].value),
    ['untested', 'broken', 'partial', 'working'],
  )
})

test('reports accepts feature requests in the shared inbox', async t => {
  const originalFetch = globalThis.fetch
  let embed
  globalThis.fetch = async (_url, options) => {
    embed = JSON.parse(options.body).embeds[0]
    return new Response(null, { status: 204 })
  }
  t.after(() => {
    globalThis.fetch = originalFetch
  })

  const response = await worker.fetch(makeRequest({
    type: 'feature',
    title: 'Add a market history export',
    plugin: 'LumenAuction',
    description: 'Let administrators export transaction history for accounting.',
  }, { path: '/reports' }), makeEnv())

  assert.equal(response.status, 200)
  assert.equal(embed.title, 'New Feature Request')
  assert.equal(embed.fields[0].value, 'Add a market history export')
  assert.equal(embed.fields[1].value, 'LumenAuction')
})

test('reports rejects invalid types, compatibility statuses, and missing fields', async () => {
  const validCompatibilityReport = {
    type: 'compatibility',
    plugin: 'LumenShards',
    serverSoftware: 'Paper',
    version: '1.21.4',
    status: 'working',
    description: 'Tested on a clean server',
  }
  const invalidCases = [
    { ...validCompatibilityReport, type: 'other' },
    { ...validCompatibilityReport, status: 'mostly working' },
    { ...validCompatibilityReport, status: '' },
    { type: 'feature', title: 'Add a feature' },
  ]

  for (const payload of invalidCases) {
    const response = await worker.fetch(makeRequest(payload, { path: '/reports' }), makeEnv())
    assert.equal(response.status, 400)
  }
})
