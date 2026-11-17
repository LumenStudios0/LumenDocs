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

test('loyalty unlocks at 3, 6 and 9 products, with Elite taking precedence for the complete registry', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const env = { LICENSE_API_URL: 'https://licenses.example', LICENSE_ADMIN_API_TOKEN: 'test-token' }
  const products = Array.from({ length: 12 }, (_, i) => ({ productId: `p${i}`, name: `P${i}`, active: true, plugins: [`plugin${i}`] }))
  let owned = 0, registry = products
  globalThis.fetch = async url => String(url).includes('/customers/')
    ? Response.json({ customerDiscordId: '123456789', status: 'active', verificationRequired: false,
      products: products.slice(0, owned).map(product => ({ productId: product.productId, productActive: true, status: 'active', expiresAt: null })) })
    : Response.json({ items: registry, total: registry.length })
  for (const [count, id, ips] of [
    [0, undefined, undefined], [1, undefined, undefined], [2, undefined, undefined],
    [3, 'spark', 4], [5, 'spark', 4], [6, 'radiance', 5], [8, 'radiance', 5],
    [9, 'nova', 7], [11, 'nova', 7], [12, 'elite', 10],
  ]) {
    owned = count
    const status = await loyaltyStatus(env, '123456789')
    assert.equal(status.tier?.id, id, `${count} products`)
    assert.equal(status.tier?.ips, ips, `${count} products`)
  }
  registry = products.slice(0, 2)
  owned = 2
  assert.equal((await loyaltyStatus(env, '123456789')).tier.id, 'elite')
  registry = []
  assert.equal((await loyaltyStatus(env, '123456789')).tier, null)
})
