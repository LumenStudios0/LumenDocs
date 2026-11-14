import test from 'node:test'
import assert from 'node:assert/strict'
import { checkCompatibility, compareVersions, versionParts } from '../docs/.vitepress/theme/compatibility-utils.mjs'
import { clearBookmarks, readBookmarks, toggleBookmark, validBookmarkPath } from '../docs/.vitepress/theme/doc-bookmarks.mjs'
import { communityAvailabilityError, CommunityUnavailableError } from '../docs/.vitepress/theme/community-errors.mjs'

test('missing Worker routes are connection failures, not missing user tickets', () => {
  for (const path of ['/status', '/tickets', '/staff/tickets', '/issues', '/preferences']) {
    const error = communityAvailabilityError(path, 404, { error: 'Not found' })
    assert.ok(error instanceof CommunityUnavailableError)
    assert.match(error.message, /updated Worker and its database/)
  }
  const id = '12345678-1234-1234-1234-123456789012'
  assert.equal(communityAvailabilityError(`/tickets/${id}`, 404, { error: 'Ticket not found' }), null)
  assert.ok(communityAvailabilityError(`/tickets/${id}`, 404, { error: 'Not found' }) instanceof CommunityUnavailableError)
  assert.ok(communityAvailabilityError('/status', 503, { code: 'COMMUNITY_SERVICE_UNAVAILABLE' }) instanceof CommunityUnavailableError)
  assert.equal(communityAvailabilityError('/tickets', 400, { error: 'Invalid ticket title' }), null)
  assert.equal(communityAvailabilityError('/tickets', 401, { error: 'Sign in' }), null)
})

const plugin = { status: 'available', java: 21, apiVersion: '1.21', software: ['Paper'], dependencies: ['PacketEvents'], notes: [] }
const setup = { java: 21, version: '1.21.6', software: 'Paper', installed: ['packetevents'] }
test('checker detects old runtimes/API and missing required dependencies without declaring untested support', () => {
  assert.equal(checkCompatibility(plugin, setup).verdict, 'needs-verification')
  const result = checkCompatibility(plugin, { ...setup, java: 17, version: '1.20.6', installed: [] })
  assert.equal(result.verdict, 'blocked')
  assert.equal(result.blockers.length, 3)
  assert.match(checkCompatibility(plugin, { ...setup, software: 'Folia' }).warnings.join(' '), /region-threading/)
  assert.equal(checkCompatibility({ ...plugin, status: 'coming-soon' }, setup).verdict, 'coming-soon')
  assert.match(checkCompatibility({ ...plugin, java: null }, setup).warnings.join(' '), /not established/)
})
test('version comparison handles numeric patches and rejects invalid input', () => {
  assert.equal(compareVersions(versionParts('1.21.10'), versionParts('1.21.6')), 1)
  assert.equal(compareVersions(versionParts('1.21'), versionParts('1.21.0')), 0)
  assert.equal(versionParts('latest'), null)
  assert.equal(versionParts('1.21.6/path'), null)
  assert.equal(checkCompatibility(plugin, { ...setup, version: 'latest' }).verdict, 'blocked')
})
function storage() {
  const values = new Map()
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
}
test('bookmarks persist and toggle by internal path, including headings', () => {
  const browser = storage()
  toggleBookmark(browser, { title: 'Licensing', path: '/getting-started/licensing#setup' })
  assert.deepEqual(readBookmarks(browser), [{ title: 'Licensing', path: '/getting-started/licensing#setup' }])
  toggleBookmark(browser, { title: 'Licensing', path: '/getting-started/licensing#setup' })
  assert.equal(readBookmarks(browser).length, 0)
  toggleBookmark(browser, { title: 'Errors', path: '/error-guides' })
  clearBookmarks(browser)
  assert.equal(readBookmarks(browser).length, 0)
})
test('bookmarks reject unsafe destinations and surface storage corruption/failure', () => {
  for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/admin/', '/account/tickets', '/auth/login', '/hello\nworld']) {
    assert.equal(validBookmarkPath(path), false)
    assert.throws(() => toggleBookmark(storage(), { title: 'Unsafe', path }))
  }
  assert.throws(() => readBookmarks({ getItem: () => '{"not":"array"}' }), /invalid/)
  const browser = storage()
  browser.setItem = () => { throw new Error('Storage blocked') }
  assert.throws(() => toggleBookmark(browser, { title: 'Docs', path: '/docs/' }), /blocked/)
})
