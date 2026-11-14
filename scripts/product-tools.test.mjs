import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import { handleProductTools, runProductChecks } from '../worker/product-tools.js'
import worker from '../worker/chat.js'

async function fixture(t) {
  const sqlite = new DatabaseSync(':memory:')
  const directory = new URL('../worker/migrations/community/', import.meta.url)
  for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
    sqlite.exec(await readFile(new URL(name, directory), 'utf8'))
  }
  t.after(() => sqlite.close())
  const state = Symbol('statement')
  const db = {
    prepare(sql) {
      let params = []
      const statement = {
        bind(...values) { params = values; return statement },
        async first() { return sqlite.prepare(sql).get(...params) || null },
        async all() { return { results: sqlite.prepare(sql).all(...params) } },
        async run() { return { meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } } },
        [state]: () => [sql, params],
      }
      return statement
    },
    async batch(statements) {
      sqlite.exec('BEGIN')
      try {
        const results = statements.map(statement => {
          const [sql, params] = statement[state]()
          return { meta: { changes: Number(sqlite.prepare(sql).run(...params).changes) } }
        })
        sqlite.exec('COMMIT')
        return results
      } catch (error) { sqlite.exec('ROLLBACK'); throw error }
    },
  }
  const owner = '1400375985211441242'
  const customer = '123456789012345678'
  const env = {
    COMMUNITY_DB: db,
    LICENSE_API_URL: 'https://licenses.example',
    LICENSE_ADMIN_API_TOKEN: 'server-secret',
    ADMIN_READ_LIMITER: { limit: async () => ({ success: true }) },
    ADMIN_WRITE_LIMITER: { limit: async () => ({ success: true }) },
    ASSISTANT_LIMITER: { limit: async () => ({ success: true }) },
  }
  const deps = {
    respond: (body, status) => Response.json(body, { status }),
    verifyLoginToken: async token => /^\d+$/.test(token) ? { id: token } : null,
  }
  const call = (path, method = 'GET', body, token = owner) => handleProductTools(new Request('https://worker.example' + path, {
    method,
    headers: { Authorization: `Bearer ${token}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }), env, 'https://lumenstudio.fyi', path.split('?')[0], deps)
  return { sqlite, env, call, owner, customer }
}

test('release manager keeps drafts private and publishes updates without exposing credentials', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const body = { productId: 'shards', version: '1.0', channel: 'stable', body: '### Update\n**New features**', published: false }
  assert.equal((await call('/studio/staff/releases', 'POST', body, customer)).status, 403)
  assert.equal((await call('/studio/staff/releases', 'POST', body, '')).status, 401)
  const created = await call('/studio/staff/releases', 'POST', body)
  assert.equal(created.status, 201)
  const { release } = await created.json()
  assert.equal((await (await call('/studio/releases')).json()).total, 0)
  assert.equal((await call('/studio/staff/releases/' + release.id, 'PUT', { ...body, published: true })).status, 200)
  assert.equal((await (await call('/studio/releases')).json()).items[0].version, '1.0')
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM community_notifications WHERE kind = 'update'").get().n, 1)
  await call('/studio/staff/releases/' + release.id, 'PUT', { ...body, published: true, body: 'Edited release notes' })
  assert.equal(sqlite.prepare('SELECT body FROM community_notifications').get().body, 'Edited release notes')
  assert.equal((await call('/studio/staff/releases', 'POST', body)).status, 409)
  assert.equal((await call('/studio/staff/releases/' + release.id, 'PUT', { ...body, published: true, productId: 'changed' })).status, 409)
  await call('/studio/staff/releases/' + release.id, 'PUT', body)
  assert.equal((await (await call('/studio/releases')).json()).total, 0)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 0)
})

test('Worker routes product tools and preflights scheduled cancellation', async t => {
  const { env } = await fixture(t)
  const origin = 'https://lumenstudio.fyi'
  env.ALLOWED_ORIGIN = origin
  for (const prefix of ['', '/api']) {
    const response = await worker.fetch(new Request(`https://worker.example${prefix}/studio/releases`, { headers: { Origin: origin } }), env)
    assert.equal(response.status, 200)
    assert.deepEqual((await response.json()).items, [])
    for (const suffix of ['', '/' + crypto.randomUUID()]) {
      const denied = await worker.fetch(new Request(`https://worker.example${prefix}/studio/downloads${suffix}`, { headers: { Origin: origin } }), env)
      assert.equal(denied.status, 401)
      assert.equal(denied.headers.get('Cache-Control'), 'no-store')
    }
  }
  for (const [path, methods] of [
    ['/studio/staff/releases', ['GET', 'POST', 'PUT']],
    ['/studio/downloads/' + crypto.randomUUID(), ['GET', 'HEAD']],
    ['/community/staff/scheduled/' + crypto.randomUUID(), ['DELETE']],
  ]) {
    const response = await worker.fetch(new Request('https://worker.example' + path, { method: 'OPTIONS', headers: { Origin: origin } }), env)
    assert.equal(response.status, 204)
    for (const method of methods) assert.ok(response.headers.get('Access-Control-Allow-Methods').includes(method))
  }
})

test('bulk grants preserve existing access, notify recipients and never repeat a submitted batch', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const other = '223456789012345678'
  let grants = 0
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    assert.equal(options.headers.Authorization, 'Bearer server-secret')
    if (url.pathname.endsWith('/products')) return Response.json({ items: [{ productId: 'shards', active: true, plugins: ['shards'] }], total: 1 })
    if (url.pathname.endsWith('/customers/' + customer)) return Response.json({ customerDiscordId: customer, status: 'active', products: [{ productId: 'shards', status: 'active', expiresAt: null }] })
    if (url.pathname.includes('/customers/')) return Response.json({ detail: 'Not found' }, { status: 404 })
    assert.equal(url.pathname, '/v1/admin/licenses')
    grants++
    return Response.json({ licenseKey: 'must-not-be-returned', licenseId: crypto.randomUUID() })
  }
  const body = { requestId: crypto.randomUUID(), productId: 'shards', customerIds: [customer, other] }
  const response = await call('/studio/bulk-grants', 'POST', body)
  assert.equal(response.status, 200)
  const raw = await response.text()
  assert.equal(raw.includes('must-not-be-returned'), false)
  assert.deepEqual(JSON.parse(raw).results.map(row => row.state), ['skipped', 'granted'])
  assert.equal(grants, 1)
  const notes = sqlite.prepare('SELECT recipient_id FROM community_notifications').all()
  assert.deepEqual(notes.map(row => row.recipient_id), [other])
  await call('/studio/bulk-grants', 'POST', body)
  assert.equal(grants, 1)
  assert.equal((await call('/studio/bulk-grants', 'POST', { ...body, expiresAt: new Date(Date.now() + 86400000).toISOString() })).status, 409)
  assert.equal((await call('/studio/bulk-grants', 'POST', { ...body, requestId: crypto.randomUUID(), customerIds: [customer, customer] })).status, 400)
  assert.equal((await call('/studio/bulk-grants', 'POST', body, customer)).status, 403)
})

test('concurrent bulk submissions reserve the batch before granting and uncertain results are not retried', async t => {
  const { call, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let grants = 0
  globalThis.fetch = async input => {
    const url = new URL(input)
    if (url.pathname.endsWith('/products')) return Response.json({ items: [{ productId: 'shards', active: true, plugins: ['s'] }], total: 1 })
    if (url.pathname.includes('/customers/')) return Response.json({}, { status: 404 })
    grants++
    throw new Error('Connection closed after submission')
  }
  const body = { requestId: crypto.randomUUID(), productId: 'shards', customerIds: [customer] }
  const results = await Promise.allSettled([call('/studio/bulk-grants', 'POST', body), call('/studio/bulk-grants', 'POST', body)])
  assert.ok(results.some(result => result.status === 'fulfilled'))
  assert.equal(grants, 1)
  const retry = await call('/studio/bulk-grants', 'POST', body)
  assert.equal((await retry.json()).results[0].state, 'uncertain')
  assert.equal(grants, 1)
})

test('expiry reminders use canonical active entitlements, paginate, and deduplicate each expiry window', async t => {
  const { env, sqlite, customer } = await fixture(t)
  const originalFetch = globalThis.fetch
  const originalNow = Date.now
  t.after(() => { globalThis.fetch = originalFetch; Date.now = originalNow })
  const started = Date.now()
  const expiry = new Date(started + 3 * 86400000).toISOString()
  const product = { productId: 'shards', productName: 'LumenShards', status: 'active', productActive: true, expiresAt: expiry }
  const pages = []
  globalThis.fetch = async input => {
    const url = new URL(input)
    pages.push(url.searchParams.get('page'))
    return Response.json({ items: [{
      customerDiscordId: customer, status: 'active',
      products: [product, { ...product, productId: 'paid', expiresAt: null }, { ...product, productId: 'revoked', status: 'revoked' }],
    }], total: 26 })
  }
  await runProductChecks(env)
  await runProductChecks(env)
  assert.deepEqual(pages, ['1', '2', '1', '2'])
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 1)
  const row = sqlite.prepare('SELECT * FROM community_notifications').get()
  assert.equal(row.recipient_id, customer)
  assert.equal(row.kind, 'license')
  assert.equal(row.product_id, 'shards')
  Date.now = () => started + 2.5 * 86400000
  await runProductChecks(env)
  await runProductChecks(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 2)
  Date.now = () => started + 4 * 86400000
  await runProductChecks(env)
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM community_notifications').get().n, 2)
})

async function seedDownload(sqlite, productId = '1', published = 1) {
  const bytes = Buffer.concat([Buffer.from('PK'), Buffer.alloc(65536 * 17 + 25, 42)])
  const id = crypto.randomUUID()
  const sha256 = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex')
  const chunks = Math.ceil(bytes.length / 65536)
  sqlite.prepare(`INSERT INTO studio_downloads
    (id,product_id,product_key,name,version,filename,sha256,size,chunk_count,source_commit,created_at,published)
    VALUES (?,?,?,'LumenShards','1.2','LumenShards-1.2.jar',?,?,?,'test-commit',?,?)`)
    .run(id, productId, 'lumenshards', sha256, bytes.length, chunks, new Date().toISOString(), published)
  const insert = sqlite.prepare('INSERT INTO studio_download_chunks (download_id,chunk_index,data) VALUES (?,?,?)')
  for (let index = 0; index < chunks; index++) insert.run(id, index, bytes.subarray(index * 65536, (index + 1) * 65536).toString('base64'))
  return { id, bytes, sha256 }
}

test('plugin downloads require current canonical entitlements and stream the exact private artifact', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const artifact = await seedDownload(sqlite)
  await seedDownload(sqlite, 'other-product')
  await seedDownload(sqlite, '1', 0)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  let state = 'active'
  globalThis.fetch = async input => {
    assert.equal(new URL(input).pathname, '/v1/admin/customers/' + customer)
    return Response.json({
      customerDiscordId: customer, status: state, verificationRequired: false,
      products: [{ productId: '1', productActive: true, status: 'active', expiresAt: null }],
    })
  }
  assert.equal((await call('/studio/downloads', 'GET', undefined, '')).status, 401)
  const list = await call('/studio/downloads', 'GET', undefined, customer)
  assert.equal(list.status, 200)
  assert.deepEqual((await list.json()).items.map(item => item.id), [artifact.id])
  const response = await call('/studio/downloads/' + artifact.id, 'GET', undefined, customer)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Content-Type'), 'application/java-archive')
  assert.equal(response.headers.get('Content-Length'), String(artifact.bytes.length))
  assert.equal(response.headers.get('X-Checksum-Sha256'), artifact.sha256)
  assert.match(response.headers.get('Content-Disposition'), /attachment; filename="LumenShards-1.2.jar"/)
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), artifact.bytes)
  state = 'banned'
  assert.equal((await call('/studio/downloads/' + artifact.id, 'GET', undefined, customer)).status, 403)
})

test('plugin downloads fail closed on expired, revoked, mismatched and unavailable licensing responses', async t => {
  const { call, sqlite, customer } = await fixture(t)
  const { id } = await seedDownload(sqlite)
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  const profile = {
    customerDiscordId: customer, status: 'active', verificationRequired: false,
    products: [{ productId: '1', productActive: true, status: 'active', expiresAt: null }],
  }
  for (const [data, status, expected] of [
    [{ ...profile, products: [{ ...profile.products[0], expiresAt: new Date(Date.now() - 1000).toISOString() }] }, 200, 404],
    [{ ...profile, products: [{ ...profile.products[0], status: 'revoked' }] }, 200, 404],
    [{ ...profile, products: [{ ...profile.products[0], productActive: false }] }, 200, 404],
    [{ ...profile, products: [{ ...profile.products[0], expiresAt: 'invalid' }] }, 200, 503],
    [{ ...profile, customerDiscordId: '223456789012345678' }, 200, 503],
    [{ ...profile, verificationRequired: undefined }, 200, 503],
    [{ ...profile, verificationRequired: true }, 200, 403],
    [{}, 503, 503],
    [{}, 404, 403],
  ]) {
    globalThis.fetch = async () => Response.json(data, { status })
    const response = await call('/studio/downloads/' + id, 'GET', undefined, customer)
    assert.equal(response.status, expected)
    assert.equal(response.headers.has('Content-Disposition'), false)
  }
})

test('download staff access is permission checked and broken artifacts are never silently truncated', async t => {
  const { call, sqlite, env, customer } = await fixture(t)
  const { id } = await seedDownload(sqlite)
  const catalog = await (await call('/studio/downloads')).json()
  assert.equal(catalog.items[0].id, id)
  assert.deepEqual(catalog.builds, [])
  const originalFetch = globalThis.fetch
  t.after(() => { globalThis.fetch = originalFetch })
  globalThis.fetch = async () => Response.json({
    customerDiscordId: customer, status: 'active', verificationRequired: false, products: [],
  })
  const customerCatalog = await (await call('/studio/downloads', 'GET', undefined, customer)).json()
  assert.equal(customerCatalog.total, 0)
  assert.equal('builds' in customerCatalog, false)
  assert.equal((await call('/studio/downloads/' + id, 'GET', undefined, customer)).status, 404)
  const head = await call('/studio/downloads/' + id, 'HEAD')
  assert.equal(head.status, 200)
  assert.equal(await head.text(), '')
  env.ASSISTANT_LIMITER = { limit: async () => ({ success: false }) }
  assert.equal((await call('/studio/downloads/' + id)).status, 429)
  env.ASSISTANT_LIMITER = { limit: async () => ({ success: true }) }
  sqlite.prepare('DELETE FROM studio_download_chunks WHERE download_id = ? AND chunk_index = 16').run(id)
  const response = await call('/studio/downloads/' + id)
  await assert.rejects(response.arrayBuffer(), /could not be completed/)
  sqlite.prepare("UPDATE studio_downloads SET filename = '../not-a-safe-file.jar' WHERE id = ?").run(id)
  assert.equal((await call('/studio/downloads/' + id)).status, 503)
})
