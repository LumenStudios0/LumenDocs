import test from 'node:test'
import assert from 'node:assert/strict'
import { extractUpdateEntries } from './refresh-changelogs.mjs'

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
