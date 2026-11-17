import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { parse, compileScript } from '@vue/compiler-sfc'
import { transform } from 'esbuild'
import { checkCompatibility, compareVersions, versionParts } from '../docs/.vitepress/theme/compatibility-utils.mjs'
import { clearBookmarks, readBookmarks, toggleBookmark, validBookmarkPath } from '../docs/.vitepress/theme/doc-bookmarks.mjs'
import { communityAvailabilityError, CommunityUnavailableError } from '../docs/.vitepress/theme/community-errors.mjs'
import { clearStaffPreferences, readStaffPreferences, toggleStaffPreference, readStaffWidgets, setStaffWidget, clearStaffWidgets } from '../docs/.vitepress/theme/staff-preferences.mjs'
import { mergeStaffDrafts } from '../docs/.vitepress/theme/staff-operation-drafts.mjs'

test('notification bell exposes mark-all to the template, persists reads, and preserves unread state on failure', async () => {
  const source = await readFile(new URL('../docs/.vitepress/theme/NotificationBell.vue', import.meta.url), 'utf8')
  const script = compileScript(parse(source).descriptor, { id: 'notification-bell-test' })
  const { code } = await transform(script.content, { loader: 'ts', format: 'cjs' })
  let rejected = false, remoteUnread = 2, posts = 0, events = 0
  const module = { exports: {} }
  const modules = {
    vue: { defineComponent: value => value, ref: value => ({ value }), computed: read => ({ get value() { return read() } }),
      onMounted() {}, onUnmounted() {}, watch() {} },
    vitepress: { useRoute: () => ({ path: '/account/' }), useRouter: () => ({ go() {} }), withBase: value => value },
    './discord-session': { getDiscordSession: () => 'verified-test-session' },
    './community-api': { communityDate: value => value, communityRequest: async (path, init) => {
      if (init?.method === 'POST') {
        assert.equal(path, '/notifications/read-all')
        posts++
        if (rejected) throw new Error('Read update was rejected.')
        remoteUnread = 0
        return { ok: true, marked: 2 }
      }
      return { unreadTotal: remoteUnread, items: [{ id: 'test-notification', read: remoteUnread === 0 }] }
    } },
  }
  runInNewContext(code, { module, exports: module.exports, require: name => {
    if (!(name in modules)) throw new Error(`Unexpected dependency: ${name}`)
    return modules[name]
  }, document: { hidden: false }, window: { dispatchEvent() { events++ } }, Event, Error })
  const bell = module.exports.default.setup({ open: true }, { expose() {}, emit() {} })
  assert.equal(typeof bell.markAllRead, 'function', 'The template must receive the click handler, not a nested function')
  bell.unread.value = 2
  bell.items.value = [{ id: 'test-notification', read: false }]
  await bell.markAllRead()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(posts, 1)
  assert.equal(events, 1)
  assert.equal(bell.unread.value, 0)
  assert.equal(bell.items.value[0].read, true)
  rejected = true
  bell.unread.value = 2
  bell.items.value[0].read = false
  await bell.markAllRead()
  assert.equal(posts, 2)
  assert.equal(bell.unread.value, 2)
  assert.equal(bell.items.value[0].read, false)
  assert.match(bell.error.value, /rejected/)
})

test('missing Worker routes are connection failures, not missing user tickets', () => {
  for (const path of ['/status', '/tickets', '/staff/tickets', '/issues', '/preferences']) {
    const error = communityAvailabilityError(path, 404, { error: 'Not found' })
    assert.ok(error instanceof CommunityUnavailableError)
    assert.match(error.message, /updated Worker and its database/)
  }
  const id = '12345678-1234-1234-1234-123456789012'
  assert.equal(communityAvailabilityError(`/tickets/${id}`, 404, { error: 'Ticket not found' }), null)
  assert.ok(communityAvailabilityError(`/tickets/${id}`, 404, { error: 'Not found' }) instanceof CommunityUnavailableError)
  assert.equal(communityAvailabilityError(`/forum/${id}`, 404, { error: 'Thread not found' }), null)
  assert.ok(communityAvailabilityError(`/forum/${id}`, 404, { error: 'Not found' }) instanceof CommunityUnavailableError)
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

test('staff guide preferences persist only IDs and stay separate for each verified actor', () => {
  const browser = storage()
  const first = '223456789012345698'
  const second = '323456789012345698'
  toggleStaffPreference(browser, first, 'saved', 'plugin-lumenshards')
  toggleStaffPreference(browser, first, 'read', 'integration')
  assert.deepEqual(readStaffPreferences(browser, first), { saved: ['plugin-lumenshards'], read: ['integration'] })
  assert.deepEqual(readStaffPreferences(browser, second), { saved: [], read: [] })
  assert.equal(browser.getItem(`lumen-staff-guides-v1:${first}`), '{"saved":["plugin-lumenshards"],"read":["integration"]}')
  toggleStaffPreference(browser, first, 'saved', 'plugin-lumenshards')
  assert.deepEqual(readStaffPreferences(browser, first).saved, [])
  clearStaffPreferences(browser, second)
  assert.deepEqual(readStaffPreferences(browser, first).read, ['integration'])
  clearStaffPreferences(browser, first)
  assert.deepEqual(readStaffPreferences(browser, first), { saved: [], read: [] })
})

test('staff guide preference corruption and persistence errors are surfaced without changing prior state', () => {
  const browser = storage()
  const id = '223456789012345698'
  assert.throws(() => readStaffPreferences(browser, 'unverified'), /identity/)
  assert.throws(() => toggleStaffPreference(browser, id, 'saved', 'Internal guide body with secrets'), /valid/)
  browser.setItem(`lumen-staff-guides-v1:${id}`, '{"saved": ["bad/path"], "read": []}')
  assert.throws(() => readStaffPreferences(browser, id), /invalid/)
  clearStaffPreferences(browser, id)
  toggleStaffPreference(browser, id, 'saved', 'integration')
  browser.setItem = () => { throw new Error('Storage blocked') }
  assert.throws(() => toggleStaffPreference(browser, id, 'read', 'integration'), /blocked/)
  assert.deepEqual(readStaffPreferences(browser, id), { saved: ['integration'], read: [] })
})

test('staff widget preferences are actor-scoped and reject invalid or corrupt values', () => {
  const browser = storage(), first = '223456789012345698', second = '323456789012345698'
  assert.throws(() => readStaffWidgets(browser, 'unverified'), /identity/)
  setStaffWidget(browser, first, 'handover', false)
  assert.equal(readStaffWidgets(browser, first).includes('handover'), false)
  assert.equal(readStaffWidgets(browser, second).includes('handover'), true)
  assert.throws(() => setStaffWidget(browser, first, 'private guide body', true), /valid/)
  browser.setItem(`lumen-staff-guides-v1:${first}:widgets`, '["progress","progress"]')
  assert.throws(() => readStaffWidgets(browser, first), /invalid/)
  clearStaffWidgets(browser, first)
  assert.equal(readStaffWidgets(browser, first).length, 4)
})

test('refresh retains unsaved staff drafts and their stale revisions', () => {
  const drafts = { one: { id: 'one', title: 'Unsaved', revision: 1 } }
  const merged = mergeStaffDrafts(drafts, [{ id: 'one', title: 'Remote edit', revision: 2 }, { id: 'two', title: 'New', revision: 0 }], 'id', item => ({ ...item }))
  assert.deepEqual(merged.one, { id: 'one', title: 'Unsaved', revision: 1 })
  assert.deepEqual(merged.two, { id: 'two', title: 'New', revision: 0 })
  assert.equal(Object.hasOwn(drafts, 'two'), false)
})
