import { normalizeIpAddress, parseIpAllowlist } from './licensing-utils.mjs'

export const TEST_OWNER_ID = '1400375985211441242'
const storageKey = 'lumen-admin-test-workspace-v1'

/**
 * Browser-only practice data. This adapter never calls the licensing service.
 * The caller must obtain identity from the Worker's authenticated /auth/me response.
 * @param {Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>} storage
 * @param {{id: string, role: string | null, username?: string, globalName?: string}} identity
 */
export function createAdminTestStore(storage, identity) {
  if (identity.id !== TEST_OWNER_ID || identity.role !== 'owner') {
    throw new Error('Test mode is available only to the signed-in studio owner.')
  }
  const seed = () => ({
    version: 1,
    user: {
      discordId: TEST_OWNER_ID, username: identity.username || null, globalName: identity.globalName || 'Owner test account',
      deleted: false, banned: false, banReason: null, onHold: false, holdReason: null,
      verificationStatus: 'unverified', verificationReason: null, verificationRequestedAt: null,
    },
    products: [
      { productId: 'test-plugin', name: 'Test Plugin (not a real entitlement)', active: true },
      { productId: 'test-premium', name: 'Test Premium (not a real entitlement)', active: true },
    ],
    licenses: [{
      licenseId: crypto.randomUUID(), productId: 'test-plugin', customerDiscordId: TEST_OWNER_ID,
      status: 'active', expiresAt: null, allowedIps: ['203.0.113.10'], serverId: 'test-server',
      lastValidatedAt: null, lastValidatedServerId: null,
    }],
    audit: [],
  })
  let state = seed()
  const saved = storage.getItem(storageKey)
  if (saved) {
    try { state = JSON.parse(saved) }
    catch { throw new Error('Saved test data is invalid. Use Reset test data to start again.') }
    if (state?.version !== 1 || state?.user?.discordId !== TEST_OWNER_ID ||
      !Array.isArray(state.licenses) || !Array.isArray(state.products) || !Array.isArray(state.audit)) {
      throw new Error('Saved test data is invalid. Use Reset test data to start again.')
    }
  }
  const persist = () => storage.setItem(storageKey, JSON.stringify(state))
  const clone = value => JSON.parse(JSON.stringify(value))
  const profile = () => ({ ...state.user, licenses: state.licenses, licenseCount: state.licenses.length })
  const record = (action, entityType, entityId, details) => {
    state.audit.unshift({
      auditId: crypto.randomUUID(), actor: `${TEST_OWNER_ID}:owner:test`, action, entityType, entityId,
      createdAt: new Date().toISOString(), details,
    })
  }
  persist()
  return {
    reset() {
      const previous = state
      state = seed()
      try { persist() }
      catch (error) { state = previous; throw error }
    },
    request(path, init = {}) {
      const url = new URL(path, 'https://test.invalid')
      const method = init.method || 'GET'
      const page = (items) => {
        const pageNumber = Math.max(1, Number(url.searchParams.get('page')) || 1)
        const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize')) || 50))
        return { items: items.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), total: items.length, page: pageNumber, pageSize }
      }
      const route = url.pathname
      if (method === 'GET') {
        if (route === '/users') {
          const query = (url.searchParams.get('query') || '').toLowerCase()
          const matches = `${state.user.discordId} ${state.user.username || ''} ${state.user.globalName || ''}`.toLowerCase().includes(query)
          return clone(page(!state.user.deleted && matches ? [profile()] : []))
        }
        if (route === `/users/${TEST_OWNER_ID}`) return clone(profile())
        if (route === '/licenses') return clone(page(state.licenses))
        if (route === '/products') return clone(page(state.products))
        if (route === '/audit') return clone(page(state.audit))
        throw new Error('That read is not supported in the local test workspace.')
      }
      const previous = clone(state)
      try {
        const body = init.body ? JSON.parse(String(init.body)) : {}
        let result = {}
        if (route === `/users/${TEST_OWNER_ID}` && method === 'DELETE') {
          for (const license of state.licenses) {
            license.status = 'revoked'
            license.allowedIps = []
            license.serverId = null
            license.lastValidatedServerId = null
          }
          state.user.deleted = true
          state.user.username = null
          state.user.globalName = null
          record('test.account.deleted', 'customer', TEST_OWNER_ID, {})
        } else {
          if (state.user.deleted) throw new Error('This test account is deleted. Reset test data to restore it.')
          const action = route.match(new RegExp(`^/users/${TEST_OWNER_ID}/(ban|unban|hold|release|verification-request|verify)$`))?.[1]
          const licenseRoute = route.match(/^\/licenses\/([0-9a-f-]{36})\/(suspend|activate|revoke|ips)$/)
          if (action && method === 'POST') {
            if (action === 'ban' || action === 'unban') {
              state.user.banned = action === 'ban'
              state.user.banReason = action === 'ban' ? body.reason || null : null
            } else if (action === 'hold' || action === 'release') {
              state.user.onHold = action === 'hold'
              state.user.holdReason = action === 'hold' ? body.reason || null : null
            } else {
              state.user.verificationStatus = action === 'verify' ? 'verified' : 'requested'
              if (action === 'verification-request') {
                state.user.verificationReason = body.reason || null
                state.user.verificationRequestedAt = new Date().toISOString()
              }
            }
            record(`test.account.${action}`, 'customer', TEST_OWNER_ID, body)
          } else if (route === '/licenses' && method === 'POST') {
            if (body.customerDiscordId !== TEST_OWNER_ID || !state.products.some(product => product.productId === body.productId && product.active)) {
              throw new Error('Choose a test product and the owner test account.')
            }
            if (body.expiresAt && (!Number.isFinite(Date.parse(body.expiresAt)) || Date.parse(body.expiresAt) <= Date.now())) {
              throw new Error('Test license expiry must be in the future.')
            }
            const license = {
              licenseId: crypto.randomUUID(), productId: body.productId, customerDiscordId: TEST_OWNER_ID,
              status: 'active', expiresAt: body.expiresAt || null, allowedIps: [], serverId: null,
              lastValidatedAt: null, lastValidatedServerId: null,
            }
            state.licenses.push(license)
            result = { licenseKey: `TEST-ONLY-NOT-VALID-${crypto.randomUUID()}` }
            record('test.license.created', 'license', license.licenseId, body)
          } else if (licenseRoute) {
            const license = state.licenses.find(item => item.licenseId === licenseRoute[1])
            if (!license) throw new Error('Test license not found.')
            if (license.status === 'revoked') throw new Error('A revoked test license cannot be edited.')
            const operation = licenseRoute[2]
            if (operation === 'ips' && (method === 'POST' || method === 'DELETE')) {
              if (method === 'POST') {
                const ip = normalizeIpAddress(body.ipAddress || '')
                if (!ip) throw new Error('Enter a valid test IP address.')
                license.allowedIps = parseIpAllowlist([...license.allowedIps, ip].join('\n'))
              } else {
                const ip = url.searchParams.get('ipAddress')
                if (!license.allowedIps.includes(ip)) throw new Error('Test IP address not found.')
                license.allowedIps = license.allowedIps.filter(address => address !== ip)
              }
            } else if (method === 'POST' && ['suspend', 'activate', 'revoke'].includes(operation)) {
              if ((operation === 'suspend' && license.status !== 'active') || (operation === 'activate' && license.status !== 'suspended')) {
                throw new Error('That test license status change is not available.')
              }
              license.status = { suspend: 'suspended', activate: 'active', revoke: 'revoked' }[operation]
            } else throw new Error('That mutation is not supported in the local test workspace.')
            record(`test.license.${operation}`, 'license', license.licenseId, { ...body, method })
          } else throw new Error('That mutation is not supported in the local test workspace.')
        }
        persist()
        return clone(result)
      } catch (error) {
        state = previous
        throw error
      }
    },
  }
}

/** @param {Pick<Storage, 'removeItem'>} storage */
export function clearAdminTestData(storage) {
  storage.removeItem(storageKey)
}
