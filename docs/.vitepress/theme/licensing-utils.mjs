/**
 * @template T
 * @param {(path: string) => Promise<{items: T[], total: number, page: number, pageSize: number}>} request
 * @param {'/plugins' | '/products'} path
 * @returns {Promise<T[]>}
 */
export async function fetchRegistryItems(request, path) {
  const items = []
  for (let page = 1; ; page++) {
    const result = await request(`${path}?page=${page}&pageSize=100`)
    if (!result || !Array.isArray(result.items) || result.page !== page || !Number.isInteger(result.total) || result.total < 0 ||
      !Number.isInteger(result.pageSize) || result.pageSize < 1 || result.pageSize > 100 || result.items.length > result.pageSize ||
      (!result.items.length && items.length < result.total)) {
      throw new Error('The licensing service returned an invalid registry page.')
    }
    items.push(...result.items)
    if (items.length >= result.total) return items
    if (result.items.length !== result.pageSize) throw new Error('The licensing service returned an incomplete registry page.')
  }
}

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

/** @param {{username?: string | null, deleted?: boolean}} customer */
export function hasConnectedAccount(customer) {
  return !customer.deleted && typeof customer.username === 'string' && customer.username.trim().length > 0
}

/**
 * Match documented plugins only to unambiguous active registry products that
 * have at least one plugin association. Never invent backend product IDs.
 * @param {{id: string, name: string, status: string}[]} plugins
 * @param {{productId: string, name: string, active: boolean, plugins?: string[]}[]} products
 */
export function documentedGrantOptions(plugins, products) {
  const normalize = value => value.toLowerCase().replace(/[^a-z0-9]/g, '')
  return plugins.map(plugin => {
    const names = new Set([normalize(plugin.id), normalize(plugin.name)])
    const matches = products.filter(product => names.has(normalize(product.productId)) || names.has(normalize(product.name)))
    const product = matches.length === 1 ? matches[0] : null
    const reason = plugin.status !== 'available' ? 'Coming soon'
      : matches.length > 1 ? 'Ambiguous registry match'
        : !product ? 'Not registered in licensing'
          : !product.active ? 'Inactive in licensing'
            : !Array.isArray(product.plugins) || !product.plugins.length ? 'No plugin linked in licensing'
              : ''
    return { id: plugin.id, name: plugin.name, productId: reason ? '' : product.productId, reason }
  })
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
