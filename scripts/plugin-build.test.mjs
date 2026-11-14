import test from 'node:test'
import assert from 'node:assert/strict'
import { chunks, CHUNK_SIZE, selectJar, manifestVersion } from './build-plugin-downloads.mjs'

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
