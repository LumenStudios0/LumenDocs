import test from 'node:test'
import assert from 'node:assert/strict'
import { loyaltyStatus } from '../worker/loyalty.js'

test('missing licensing customers have no loyalty tier; other upstream failures remain errors', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let customerResponse = Response.json({ detail: 'Customer account not found' }, { status: 404 })
  globalThis.fetch = async url => String(url).includes('/customers/')
    ? customerResponse.clone()
    : Response.json({ items: [{ productId: 'p', name: 'P', active: true, plugins: ['plugin'] }], total: 1 })
  const env = { LICENSE_API_URL: 'https://licenses.example', LICENSE_ADMIN_API_TOKEN: 'test-token' }
  assert.deepEqual(await loyaltyStatus(env, '123456789'), { tier: null, count: 0, total: 1, products: [] })
  customerResponse = Response.json({ detail: 'Not Found' }, { status: 404 })
  await assert.rejects(loyaltyStatus(env, '123456789'), /Invalid customer access response/)
  customerResponse = Response.json({ detail: 'Unavailable' }, { status: 503 })
  await assert.rejects(loyaltyStatus(env, '123456789'), /Invalid customer access response/)
})
