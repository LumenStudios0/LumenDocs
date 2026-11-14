import test from 'node:test'
import assert from 'node:assert/strict'
import { chunks, CHUNK_SIZE, selectJar, manifestVersion, database } from './build-plugin-downloads.mjs'

test('chunking preserves binary JAR bytes across boundaries', () => {
  for (const length of [1, CHUNK_SIZE, CHUNK_SIZE + 1, CHUNK_SIZE * 3]) {
    const bytes = Buffer.alloc(length)
    for (let i = 0; i < length; i++) bytes[i] = i % 256
    const parts = chunks(bytes)
    assert.equal(parts.length, Math.ceil(length / CHUNK_SIZE))
    assert.deepEqual(Buffer.concat(parts.map(part => Buffer.from(part, 'base64'))), bytes)
  }
})

test('selects only the final packaged plugin, never original or classifier JARs', () => {
  assert.equal(selectJar(['original-plugin.jar', 'plugin-sources.jar', 'plugin.jar'], 'plugin'), 'plugin.jar')
  for (const name of ['original-plugin', 'plugin-sources', 'plugin-javadoc', 'plugin-tests', '../plugin', '/plugin']) {
    assert.throws(() => selectJar([`${name}.jar`], name))
  }
  assert.throws(() => selectJar(['unexpected.jar'], 'plugin'))
})

test('uses resolved plugin YAML versions and rejects unresolved placeholders', () => {
  assert.equal(manifestVersion('name: Plugin\nversion: "1.2-SNAPSHOT"\n'), '1.2-SNAPSHOT')
  assert.equal(manifestVersion('version: 1.4v # release\n'), '1.4v')
  for (const text of ['version: ${project.version}', 'version: ""', 'name: Plugin']) {
    assert.throws(() => manifestVersion(text))
  }
})

test('D1 REST queries use bound object payloads rather than binding.batch arrays', async () => {
  const oldToken = process.env.CLOUDFLARE_API_TOKEN
  const oldAccount = process.env.CLOUDFLARE_ACCOUNT_ID
  process.env.CLOUDFLARE_API_TOKEN = 'test-token'
  process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account'
  const bodies = []
  try {
    const query = await database(async (_url, options) => {
      if (!options.body) return Response.json({ success: true, result: [{ name: 'lumen-community', uuid: 'existing-id' }] })
      const body = JSON.parse(options.body)
      assert.equal(Array.isArray(body), false)
      assert.equal(typeof body.sql, 'string')
      assert.ok(Array.isArray(body.params))
      bodies.push(body)
      return Response.json({ success: true, result: [{ success: true, results: [{ count: 2 }] }] })
    })
    const results = await query([{ sql: 'SELECT COUNT(*) AS count FROM studio_download_chunks WHERE download_id=?', params: ['private-id'] }])
    assert.equal(bodies.length, 4)
    assert.deepEqual(bodies.at(-1).params, ['private-id'])
    assert.equal(results[0].results[0].count, 2)
  } finally {
    if (oldToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN
    else process.env.CLOUDFLARE_API_TOKEN = oldToken
    if (oldAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID
    else process.env.CLOUDFLARE_ACCOUNT_ID = oldAccount
  }
})
