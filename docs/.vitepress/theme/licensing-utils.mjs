/** @param {{status: string, expiresAt?: string | null}} license */
export function effectiveLicenseStatus(license, now = Date.now()) {
  if (license.status !== 'active') return license.status
  if (!license.expiresAt) return 'active'
  const expiry = Date.parse(license.expiresAt)
  if (!Number.isFinite(expiry)) return 'unknown'
  return expiry <= now ? 'expired' : 'active'
}

/**
 * @param {{status: string, expiresAt?: string | null, allowedIps: string[],
 * lastValidatedAt?: string | null}} license
 * @param {string} filter
 */
export function licenseNeedsAttention(license, filter, now = Date.now()) {
  if (filter === 'no-ips') return license.status !== 'revoked' && license.allowedIps.length === 0
  if (filter === 'never-validated') return license.status !== 'revoked' && !license.lastValidatedAt
  if (filter === 'expiring') {
    const expires = Date.parse(license.expiresAt ?? '')
    return effectiveLicenseStatus(license, now) === 'active' && expires <= now + 30 * 86400000
  }
  return filter === 'all' || effectiveLicenseStatus(license, now) === filter
}

/** @param {string} address */
export function normalizeIpAddress(address) {
  const value = address.trim()
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(value)) {
    const parts = value.split('.')
    return parts.every(part => Number(part) <= 255 && String(Number(part)) === part) ? value : null
  }
  if (!value.includes(':') || !/^[0-9a-f:.]+$/i.test(value)) return null
  try {
    return new URL(`http://[${value}]/`).hostname.slice(1, -1)
  } catch {
    return null
  }
}

/** @param {string} value */
export function parseIpAllowlist(value) {
  const entries = value.split(/[\n,]+/).map(entry => entry.trim()).filter(Boolean)
  if (entries.length > 3) throw new Error('Use no more than three IP addresses.')
  const addresses = entries.map(entry => {
    const address = normalizeIpAddress(entry)
    if (!address) throw new Error(`Not a valid IPv4 or IPv6 address: ${entry}`)
    return address
  })
  if (new Set(addresses).size !== addresses.length) throw new Error('Each IP address must be unique.')
  return addresses
}

/** @param {unknown} value
 * @returns {unknown}
 */
export function redactAuditDetails(value) {
  if (Array.isArray(value)) return value.map(redactAuditDetails)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key, /key|token|secret|password|authorization/i.test(key) ? '[redacted]' : redactAuditDetails(item),
    ]))
  }
  return value
}

/** @param {unknown[][]} rows */
export function toSafeCsv(rows) {
  return rows.map(row => row.map(value => {
    let text = String(value ?? '')
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}
