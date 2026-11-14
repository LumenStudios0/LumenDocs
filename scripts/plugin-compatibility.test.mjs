import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const data = JSON.parse(await readFile(new URL('../docs/.vitepress/theme/plugin-compatibility-data.json', import.meta.url), 'utf8'))

test('compatibility data covers the identified plugins without duplicates', () => {
  const expected = [
    'gladiator', 'lumen-spoofer', 'lumen-economy', 'lumen-shards', 'lumen-spawners',
    'lumen-order', 'lumen-auction', 'lumen-essentials', 'astrosmp-servercore',
    'lumen-duels-premium', 'lumen-cosmetics', 'lumen-duels', 'lumen-bounty',
    'lumen-donut-core', 'lumen-team', 'lumen-intellegance', 'sentinel',
  ]
  const ids = data.plugins.map(plugin => plugin.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.deepEqual([...ids].sort(), expected.sort())
  assert.match(data.checkedAt, /^\d{4}-\d{2}-\d{2}/)

  for (const plugin of data.plugins) {
    assert.ok(plugin.name && plugin.docs.startsWith('/'))
    assert.ok(['available', 'coming-soon'].includes(plugin.status))
    assert.ok(plugin.repo === null || /^LumenStudios0\/[^/]+$/.test(plugin.repo))
    assert.ok(plugin.apiVersion === null || typeof plugin.apiVersion === 'string')
    assert.ok(plugin.java === null || Number.isInteger(plugin.java))
    for (const key of ['software', 'dependencies', 'optionalDependencies', 'notes', 'sources']) {
      assert.ok(Array.isArray(plugin[key]), `${plugin.id}: ${key}`)
    }
    assert.ok(plugin.sources.length, `${plugin.id}: sources`)
    for (const source of plugin.sources) {
      assert.ok(source.path && source.evidence)
      assert.match(source.ref, /^[a-f0-9]{40}$/)
    }
  }
  for (const id of ['lumen-bounty', 'lumen-donut-core', 'lumen-team', 'lumen-intellegance', 'sentinel']) {
    assert.equal(data.plugins.find(plugin => plugin.id === id).status, 'coming-soon')
  }
})

test('error guides reference known products and literal matches', () => {
  const ids = new Set(data.plugins.map(plugin => plugin.id))
  assert.equal(new Set(data.errors.map(error => error.id)).size, data.errors.length)
  for (const error of data.errors) {
    assert.ok(error.title && error.cause && error.docs.startsWith('/'))
    assert.ok(error.match.length && error.match.every(Boolean))
    assert.ok(error.steps.length && error.steps.every(Boolean))
    assert.ok(error.productIds.length && error.productIds.every(id => ids.has(id)))
  }
})
