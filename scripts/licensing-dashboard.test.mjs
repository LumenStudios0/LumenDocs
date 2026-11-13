import test from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveLicenseStatus, licenseNeedsAttention, normalizeIpAddress,
  parseIpAllowlist, redactAuditDetails, toSafeCsv,
} from '../docs/.vitepress/theme/licensing-utils.mjs'

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
