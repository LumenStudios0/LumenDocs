import test from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveLicenseStatus, licenseNeedsAttention, normalizeIpAddress,
  parseIpAllowlist, redactAuditDetails, toSafeCsv,
} from '../docs/.vitepress/theme/licensing-utils.mjs'
import { createAdminTestStore, clearAdminTestData, TEST_OWNER_ID } from '../docs/.vitepress/theme/admin-test-store.mjs'

const now = Date.parse('2026-01-01T00:00:00Z')
const license = { status: 'active', expiresAt: null, allowedIps: [], lastValidatedAt: null }

test('effective status respects expiration, invalid dates and explicit restrictions', () => {
  assert.equal(effectiveLicenseStatus(license, now), 'active')
  assert.equal(effectiveLicenseStatus({ ...license, expiresAt: new Date(now).toISOString() }, now), 'expired')
  assert.equal(effectiveLicenseStatus({ ...license, expiresAt: 'bad-date' }, now), 'unknown')
  assert.equal(effectiveLicenseStatus({ ...license, status: 'suspended', expiresAt: '2025-01-01' }, now), 'suspended')
})

test('attention queues include only active future expirations within exactly 30 days', () => {
  const expiring = { ...license, expiresAt: new Date(now + 30 * 86400000).toISOString() }
  assert.equal(licenseNeedsAttention(expiring, 'expiring', now), true)
  assert.equal(licenseNeedsAttention({ ...expiring, expiresAt: new Date(now + 30 * 86400000 + 1).toISOString() }, 'expiring', now), false)
  assert.equal(licenseNeedsAttention({ ...expiring, status: 'revoked' }, 'expiring', now), false)
  assert.equal(licenseNeedsAttention({ ...expiring, expiresAt: new Date(now).toISOString() }, 'expiring', now), false)
  assert.equal(licenseNeedsAttention(license, 'never-validated', now), true)
  assert.equal(licenseNeedsAttention(license, 'no-ips', now), true)
  assert.equal(licenseNeedsAttention({ ...license, status: 'revoked' }, 'no-ips', now), false)
})

test('allowlist parsing canonicalizes IPv6 and rejects duplicates and unsafe input', () => {
  assert.deepEqual(parseIpAllowlist('203.0.113.1,\n2001:0DB8:0:0:0:0:0:1'), ['203.0.113.1', '2001:db8::1'])
  assert.deepEqual(parseIpAllowlist(''), [])
  assert.throws(() => parseIpAllowlist('2001:db8::1,2001:0db8:0:0:0:0:0:1'), /unique/)
  assert.throws(() => parseIpAllowlist('1.1.1.1,2.2.2.2,3.3.3.3,4.4.4.4'), /three/)
  for (const invalid of ['256.1.1.1', '01.1.1.1', 'host.example', '[::1]', '::1/path', 'fe80::1%eth0', '']) {
    assert.equal(normalizeIpAddress(invalid), null)
  }
})

test('audit inspection recursively redacts credentials without altering the source', () => {
  const details = { reason: 'Support request', nested: [{ licenseKey: 'secret', access_token: 'token', allowedIps: ['203.0.113.1'] }] }
  assert.deepEqual(redactAuditDetails(details), {
    reason: 'Support request', nested: [{ licenseKey: '[redacted]', access_token: '[redacted]', allowedIps: ['203.0.113.1'] }],
  })
  assert.equal(details.nested[0].licenseKey, 'secret')
})

test('CSV export quotes embedded punctuation and neutralizes spreadsheet formulas', () => {
  assert.equal(toSafeCsv([['=HYPERLINK("x")', 'hello,\nworld', null, ' @SUM(A1)']]),
    '"\'=HYPERLINK(""x"")","hello,\nworld","","\' @SUM(A1)"')
})

function testStorage() {
  const items = new Map()
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => { items.set(key, value) },
    removeItem: key => { items.delete(key) },
  }
}
const testOwner = { id: TEST_OWNER_ID, role: 'owner', username: 'owner-fixture' }
const mutateTest = (store, path, body, method = 'POST') => store.request(path, {
  method, ...(body ? { body: JSON.stringify(body) } : {}),
})

test('local practice account requires the verified owner identity, not just a role or ID', () => {
  const storage = testStorage()
  assert.throws(() => createAdminTestStore(storage, { id: '12345', role: 'owner' }), /only/)
  assert.throws(() => createAdminTestStore(storage, { id: TEST_OWNER_ID, role: null }), /only/)
  const store = createAdminTestStore(storage, testOwner)
  assert.equal(store.request('/users').items[0].discordId, TEST_OWNER_ID)
  assert.throws(() => store.request('/users/12345'), /not supported/)
  assert.throws(() => mutateTest(store, '/users/12345/ban', {}), /not supported/)
})

test('test controls persist locally, record changes, and never require a license API', () => {
  const storage = testStorage()
  const store = createAdminTestStore(storage, testOwner)
  mutateTest(store, `/users/${TEST_OWNER_ID}/ban`, { reason: 'Testing access' })
  mutateTest(store, `/users/${TEST_OWNER_ID}/hold`, { reason: 'Testing hold' })
  mutateTest(store, `/users/${TEST_OWNER_ID}/verification-request`, { reason: 'Testing verification' })
  mutateTest(store, `/users/${TEST_OWNER_ID}/verify`)
  const restored = createAdminTestStore(storage, testOwner)
  const profile = restored.request(`/users/${TEST_OWNER_ID}`)
  assert.equal(profile.banned, true)
  assert.equal(profile.banReason, 'Testing access')
  assert.equal(profile.onHold, true)
  assert.equal(profile.verificationStatus, 'verified')
  assert.equal(restored.request('/audit').total, 4)
  mutateTest(restored, `/users/${TEST_OWNER_ID}/unban`)
  mutateTest(restored, `/users/${TEST_OWNER_ID}/release`)
  assert.equal(restored.request(`/users/${TEST_OWNER_ID}`).banned, false)
  profile.licenses[0].status = 'revoked'
  assert.equal(restored.request('/licenses').items[0].status, 'active')
})

test('test grants, IP edits and status changes preserve validation limits and mark keys invalid', () => {
  const store = createAdminTestStore(testStorage(), testOwner)
  const result = mutateTest(store, '/licenses', { productId: 'test-premium', customerDiscordId: TEST_OWNER_ID })
  assert.match(result.licenseKey, /^TEST-ONLY-NOT-VALID-/)
  const license = store.request('/licenses').items[1]
  const path = `/licenses/${license.licenseId}`
  mutateTest(store, `${path}/ips`, { ipAddress: '2001:0db8:0:0:0:0:0:1' })
  assert.throws(() => mutateTest(store, `${path}/ips`, { ipAddress: '2001:db8::1' }), /unique/)
  mutateTest(store, `${path}/ips`, { ipAddress: '203.0.113.1' })
  mutateTest(store, `${path}/ips`, { ipAddress: '203.0.113.2' })
  assert.throws(() => mutateTest(store, `${path}/ips`, { ipAddress: '203.0.113.3' }), /three/)
  mutateTest(store, `${path}/ips?ipAddress=203.0.113.2`, undefined, 'DELETE')
  mutateTest(store, `${path}/suspend`)
  assert.equal(store.request('/licenses').items[1].status, 'suspended')
  mutateTest(store, `${path}/activate`)
  mutateTest(store, `${path}/revoke`)
  assert.throws(() => mutateTest(store, `${path}/activate`), /revoked/)
  assert.equal(store.request('/licenses').items[1].allowedIps.length, 2)
  assert.throws(() => mutateTest(store, '/licenses', { productId: 'real-product', customerDiscordId: TEST_OWNER_ID }), /test product/)
  assert.throws(() => mutateTest(store, '/licenses', { productId: 'test-plugin', customerDiscordId: '12345' }), /test account/)
})

test('test deletion and reset never modify unrelated browser storage', () => {
  const storage = testStorage()
  storage.setItem('lumen-discord-session', 'fixture-session')
  const store = createAdminTestStore(storage, testOwner)
  mutateTest(store, `/users/${TEST_OWNER_ID}`, undefined, 'DELETE')
  assert.equal(store.request('/users').total, 0)
  assert.equal(store.request('/licenses').items[0].status, 'revoked')
  assert.deepEqual(store.request('/licenses').items[0].allowedIps, [])
  assert.throws(() => mutateTest(store, `/users/${TEST_OWNER_ID}/verify`), /deleted/)
  store.reset()
  assert.equal(store.request('/users').total, 1)
  assert.equal(store.request('/audit').total, 0)
  clearAdminTestData(storage)
  assert.equal(storage.getItem('lumen-discord-session'), 'fixture-session')
  assert.equal(createAdminTestStore(storage, testOwner).request('/licenses').items.length, 1)
})

test('failed local persistence reports an error and rolls back edits instead of pretending success', () => {
  const storage = testStorage()
  const store = createAdminTestStore(storage, testOwner)
  storage.setItem = () => { throw new Error('Storage quota reached') }
  assert.throws(() => mutateTest(store, `/users/${TEST_OWNER_ID}/ban`, {}), /quota/)
  assert.equal(store.request(`/users/${TEST_OWNER_ID}`).banned, false)
  assert.equal(store.request('/audit').total, 0)
  const brokenStorage = { ...storage, getItem: () => '{bad-json' }
  assert.throws(() => createAdminTestStore(brokenStorage, testOwner), /Reset test data/)
})
