import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import worker from '../worker/chat.js'

const origin = 'https://lumenstudio.fyi'
const customerId = '123456789012345678'
const secret = 'legacy-community-test-secret-long-enough'

function encode(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

async function tokenFor(id = customerId) {
  const now = Math.floor(Date.now() / 1000)
  const unsigned = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iss: 'lumen-studios', aud: 'lumen-docs', sub: id, username: 'Customer',
    globalName: 'Customer', iat: now, exp: now + 3600,
  })}`
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${Buffer.from(signature).toString('base64url')}`
}

function createD1() {
  const sqlite = new DatabaseSync(':memory:')
  const ready = Promise.all(['0001_community.sql', '0002_ticket_routing.sql', '0004_website_access.sql', '0005_member_registration.sql'].map(
    name => readFile(new URL(`../worker/migrations/community/${name}`, import.meta.url), 'utf8'),
  )).then(sqls => sqls.forEach(sql => sqlite.exec(sql)))
  return {
    sqlite,
    ready,
    async batch(statements) {
      await ready
      sqlite.exec('BEGIN')
      try {
        const results = []
        for (const statement of statements) results.push(await statement.run())
        sqlite.exec('COMMIT')
        return results
      } catch (error) {
        sqlite.exec('ROLLBACK')
        throw error
      }
    },
    prepare(query) {
      let params = []
      const statement = {
        bind(...values) { params = values; return statement },
        async first() { await ready; return sqlite.prepare(query).get(...params) ?? null },
        async all() { await ready; return { results: sqlite.prepare(query).all(...params) } },
        async run() {
          await ready
          const result = sqlite.prepare(query).run(...params)
          return { meta: { changes: Number(result.changes) } }
        },
      }
      return statement
    },
  }
}

const database = createD1()
const calls = []
const env = {
  ALLOWED_ORIGIN: origin,
  AUTH_SIGNING_SECRET: secret,
  COMMUNITY_DB: database,
  ASSISTANT_LIMITER: {
    limit: async ({ key }) => { calls.push(key); return { success: true } },
  },
}

function request(path, payload, { authorization, requestOrigin = origin } = {}) {
  return new Request(`https://worker.example${path}`, {
    method: 'POST',
    headers: {
      Origin: requestOrigin,
      'CF-Connecting-IP': '203.0.113.10',
      'Content-Type': 'application/json',
      ...(authorization ? { Authorization: `Bearer ${authorization}` } : {}),
    },
    body: JSON.stringify(payload),
  })
}

test('legacy report aliases use verified accounts and never send report contents to Discord', async t => {
  await database.ready
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => { throw new Error('Legacy alias must not call a webhook') }
  t.after(() => { globalThis.fetch = originalFetch })

  const unauthorized = await worker.fetch(request('/bug-report', {
    plugin: 'LumenShards', serverSoftware: 'Paper', version: '1.21.4', description: 'It failed.',
  }), env)
  assert.equal(unauthorized.status, 401)

  const token = await tokenFor()
  const response = await worker.fetch(request('/bug-report', {
    plugin: 'LumenShards',
    discordUsername: 'unverified-browser-name',
    serverSoftware: 'Paper',
    version: '1.21.4',
    productKey: 'must-never-be-stored',
    licenseKey: 'also-must-never-be-stored',
    consoleLog: 'Error: test',
    description: 'It broke during startup.',
  }, { authorization: token }), env)

  assert.equal(response.status, 201)
  const payload = await response.json()
  assert.deepEqual(Object.keys(payload), ['ticket'])
  assert.equal(payload.ticket.type, 'bug')
  assert.equal(payload.ticket.productId, 'LumenShards')
  assert.match(payload.ticket.body, /Minecraft version: 1\.21\.4/)
  assert.doesNotMatch(JSON.stringify(payload), /must-never-be-stored|unverified-browser-name/)
  const saved = database.sqlite.prepare('SELECT * FROM community_tickets WHERE id = ?').get(payload.ticket.id)
  assert.doesNotMatch(JSON.stringify(saved), /must-never-be-stored|also-must-never-be-stored/)
  assert.equal(calls.at(-1), `community:${customerId}`)
})

test('legacy reports translate compatibility and feature submissions into tickets', async () => {
  await database.ready
  const token = await tokenFor()
  for (const status of ['untested', 'broken', 'partial', 'working']) {
    const response = await worker.fetch(request('/reports', {
      type: 'compatibility',
      plugin: 'LumenShards',
      serverSoftware: 'Paper',
      version: '1.21.4',
      status,
      description: 'Tested on a clean server.',
    }, { authorization: token }), env)
    assert.equal(response.status, 201)
    const { ticket } = await response.json()
    assert.equal(ticket.type, 'compatibility')
    assert.deepEqual(Object.keys(ticket), ['id', 'type', 'title', 'body', 'productId', 'status', 'customerName', 'assignedTo', 'labels', 'serverSoftware', 'minecraftVersion', 'createdAt', 'updatedAt'])
    assert.match(ticket.body, new RegExp(`Compatibility result: ${status}`))
    assert.match(ticket.body, /Server software: Paper/)
    assert.match(ticket.body, /Minecraft version: 1\.21\.4/)
  }

  const feature = await worker.fetch(request('/reports', {
    type: 'feature',
    title: 'Add a market history export',
    plugin: 'LumenAuction',
    description: 'Let administrators export transaction history.',
  }, { authorization: token }), env)
  assert.equal(feature.status, 201)
  const featureTicket = (await feature.json()).ticket
  assert.equal(featureTicket.type, 'feature')
  assert.equal(featureTicket.title, 'Add a market history export')
  assert.match(featureTicket.body, /transaction history/)
})

test('legacy report aliases validate types, compatibility status, and required fields', async () => {
  await database.ready
  const token = await tokenFor()
  const invalidCases = [
    { path: '/reports', payload: { type: 'other', title: 'Test', description: 'Details' } },
    { path: '/reports', payload: { type: 'compatibility', plugin: 'LumenShards', serverSoftware: 'Paper', version: '1.21.4', status: 'mostly working', description: 'Details' } },
    { path: '/reports', payload: { type: 'feature', title: 'A feature' } },
    { path: '/bug-report', payload: { plugin: 'LumenShards' } },
  ]
  for (const item of invalidCases) {
    const response = await worker.fetch(request(item.path, item.payload, { authorization: token }), env)
    assert.equal(response.status, 400)
  }

  const unapproved = await worker.fetch(request('/reports', { type: 'feature', title: 'Test', description: 'Details' }, {
    authorization: token, requestOrigin: 'https://untrusted.example',
  }), env)
  assert.equal(unapproved.status, 403)
})
