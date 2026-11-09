import test from 'node:test'
import assert from 'node:assert/strict'
import worker from '../worker/chat.js'

const origin = 'https://lumenstudio.fyi'

function request(path, method = 'GET', body) {
  return new Request(`https://worker.example${path}`, {
    method,
    headers: {
      Origin: origin,
      'CF-Connecting-IP': '203.0.113.10',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}

function env(database) {
  return {
    ALLOWED_ORIGIN: origin,
    ASSISTANT_LIMITER: { limit: async () => ({ success: true }) },
    DINO_DISCOVERIES: database,
  }
}

function createCounterDatabase() {
  const hashes = new Set()
  return {
    hashes,
    prepare(query) {
      let parameters = []
      const statement = {
        bind(...values) {
          parameters = values
          return statement
        },
        run: async () => {
          if (!query.startsWith('INSERT')) throw new Error('Unexpected query')
          hashes.add(parameters[0])
        },
        first: async () => ({ count: hashes.size }),
      }
      return statement
    },
  }
}

test('dinosaur counter reports when its database is not configured', async () => {
  const response = await worker.fetch(request('/dinosaur-discoveries'), env(undefined))
  assert.equal(response.status, 503)
})

test('dinosaur counter hashes browser IDs and counts each visitor once', async () => {
  const database = createCounterDatabase()
  const visitorId = 'c41bd3de-d326-4cb0-9bb4-090aa596802b'

  const first = await worker.fetch(
    request('/dinosaur-discoveries', 'POST', { visitorId }),
    env(database),
  )
  const repeat = await worker.fetch(
    request('/dinosaur-discoveries', 'POST', { visitorId }),
    env(database),
  )
  const total = await worker.fetch(request('/dinosaur-discoveries'), env(database))

  assert.equal(first.status, 200)
  assert.deepEqual(await total.json(), { count: 1 })
  assert.equal(repeat.status, 200)
  assert.equal(database.hashes.has(visitorId), false)
  assert.equal(database.hashes.size, 1)
})

test('dinosaur counter rejects malformed browser IDs', async () => {
  const response = await worker.fetch(
    request('/dinosaur-discoveries', 'POST', { visitorId: 'not-a-uuid' }),
    env(createCounterDatabase()),
  )
  assert.equal(response.status, 400)
})
