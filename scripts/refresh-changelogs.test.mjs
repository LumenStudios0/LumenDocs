import test from 'node:test'
import assert from 'node:assert/strict'
import { extractUpdateEntries, fetchCreatorUpdates, fetchProductUpdates } from './refresh-changelogs.mjs'

test('extracts dated BuiltByBit resource updates and their official links', () => {
  const html = `
    <div class="resourceUpdate">
      <header class="resourceUpdate-header">
        <h2>Version 1.4 &amp; fixes</h2>
        <time datetime="2026-11-08">November 8, 2026</time>
      </header>
      <div class="resourceUpdate-body"><div class="bbWrapper">Fixed auction listing persistence and added a reload option.</div></div>
      <a href="/resources/lumenauction.132967/updates/123">View update</a>
    </div>
  `

  assert.deepEqual(
    extractUpdateEntries(html, 'https://builtbybit.com/resources/lumenauction.132967/'),
    [{
      title: 'Version 1.4 & fixes',
      date: '2026-11-08',
      text: 'Fixed auction listing persistence and added a reload option.',
      url: 'https://builtbybit.com/resources/lumenauction.132967/updates/123',
      source: 'builtbybit',
    }],
  )
})

test('ignores undated or unstructured page content instead of inventing update notes', () => {
  assert.deepEqual(
    extractUpdateEntries('<div class="resourceUpdate"><h2>Latest</h2><p>No update date or entry text.</p></div>', 'https://builtbybit.com/resources/example.1/'),
    [],
  )
})

test('only treats generic forum messages as release entries on the official updates page', () => {
  const message = `
    <article class="message">
      <h2 class="structItem-title">Release 2.0</h2>
      <time datetime="2026-11-08">November 8, 2026</time>
      <div class="bbWrapper">Improved compatibility and fixed a configuration issue.</div>
    </article>
  `
  const productUrl = 'https://builtbybit.com/resources/example.1/'

  assert.equal(extractUpdateEntries(message, productUrl).length, 0)
  assert.equal(extractUpdateEntries(message, productUrl, `${productUrl}updates/`).length, 1)
})

test('stops retrying a product when BuiltByBit blocks automation', async () => {
  const originalFetch = globalThis.fetch
  const requestedUrls = []
  globalThis.fetch = async url => {
    requestedUrls.push(url)
    return new Response('Forbidden', { status: 403 })
  }

  try {
    const entries = await fetchProductUpdates({
      name: 'Example',
      url: 'https://builtbybit.com/resources/example.1/',
    })
    assert.deepEqual(entries, [])
    assert.equal(requestedUrls.length, 1)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('reads creator updates from every API page with descriptions and a server-only token', async () => {
  const originalFetch = globalThis.fetch
  const requests = []
  globalThis.fetch = async (input, options) => {
    const url = new URL(input)
    requests.push(url)
    assert.equal(url.origin + url.pathname, 'https://api.builtbybit.com/v2/resources/creator/updates')
    assert.equal(url.searchParams.get('resource_ids'), '132519')
    assert.equal(url.searchParams.get('with'), 'Description')
    assert.equal(options.headers.Authorization, 'Token synthetic-updates-token')
    const page = Number(url.searchParams.get('page'))
    return Response.json({
      result: 'success',
      data: {
        updates: [{ update_id: page, resource_id: 132519, created_at: 1700000000 + page, title: `Release ${page}`, Description: { html: '<p>Fixed &amp; improved <strong>features</strong>.</p>' } }],
        stats: { total: 2, page, per_page: 1, max_page: 2 },
      },
    })
  }
  try {
    const entries = await fetchCreatorUpdates({ name: 'Gladiator', url: 'https://builtbybit.com/resources/gladiator.132519/' }, 'Token synthetic-updates-token')
    assert.equal(requests.length, 2)
    assert.deepEqual(entries.map(entry => entry.title), ['Release 1', 'Release 2'])
    assert.equal(entries[0].text, 'Fixed & improved features .')
    assert.equal(entries[0].url, 'https://builtbybit.com/resources/gladiator.132519/updates/')
    assert.equal(entries[0].source, 'builtbybit')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('discards incomplete creator API results rather than publishing partial updates', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => Response.json({
    result: 'success',
    data: {
      updates: [{ update_id: 1, resource_id: 123, created_at: 1700000000, title: 'Release', Description: { html: '<p>Fix</p>' } }],
      stats: { total: 2, page: 1, per_page: 100, max_page: 1 },
    },
  })
  try {
    assert.deepEqual(await fetchCreatorUpdates({ name: 'Example', url: 'https://builtbybit.com/resources/example.123/' }, 'Token synthetic-updates-token'), [])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('rejects creator updates for a different resource and upstream permission failures', async () => {
  const originalFetch = globalThis.fetch
  const product = { name: 'Example', url: 'https://builtbybit.com/resources/example.123/' }
  try {
    globalThis.fetch = async () => Response.json({
      result: 'success',
      data: {
        updates: [{ update_id: 1, resource_id: 456, created_at: 1700000000, title: 'Release', Description: { html: '<p>Fix</p>' } }],
        stats: { total: 1, page: 1, per_page: 100, max_page: 1 },
      },
    })
    assert.deepEqual(await fetchCreatorUpdates(product, 'Token synthetic-updates-token'), [])
    globalThis.fetch = async () => new Response('Forbidden', { status: 403 })
    assert.deepEqual(await fetchCreatorUpdates(product, 'Token synthetic-updates-token'), [])
  } finally {
    globalThis.fetch = originalFetch
  }
})
