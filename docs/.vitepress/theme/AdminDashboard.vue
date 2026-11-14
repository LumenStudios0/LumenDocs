<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { documentedGrantOptions, effectiveLicenseStatus, hasConnectedAccount, licenseNeedsAttention, normalizeIpAddress, redactAuditDetails, toSafeCsv } from './licensing-utils.mjs'
import pluginData from './plugin-compatibility-data.json'
import { clearAdminTestData, createAdminTestStore, TEST_OWNER_ID } from './admin-test-store.mjs'
import StaffCommunity from './StaffCommunity.vue'

interface AdminLicense {
  licenseId: string
  productId: string
  customerDiscordId: string
  status: string
  expiresAt: string | null
  allowedIps: string[]
  serverId: string | null
  lastValidatedAt: string | null
  lastValidatedServerId: string | null
}
interface AdminUser {
  discordId: string
  username: string | null
  globalName: string | null
  deleted: boolean
  banned: boolean
  banReason: string | null
  onHold: boolean
  holdReason: string | null
  verificationStatus: string
  verificationReason: string | null
  verificationRequestedAt: string | null
  licenseCount: number
  licenses: AdminLicense[]
}
type Customer = Pick<AdminUser, 'discordId' | 'username' | 'globalName' | 'banned' | 'onHold' | 'verificationStatus' | 'licenseCount'>
interface AdminProduct { productId: string; name: string; active: boolean; plugins?: string[] }
interface AuditEntry {
  auditId: string
  actor: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  details: Record<string, unknown>
}
interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
type View = 'customers' | 'licenses' | 'audit' | 'products'
const views: { id: View; label: string; number: string }[] = [
  { id: 'customers', label: 'Customers', number: '01' },
  { id: 'audit', label: 'Audit trail', number: '02' }, { id: 'products', label: 'Product registry', number: '03' },
]
const pageSize = 50
const view = ref<View>('customers')
const websiteOperations = ref(false)
const pages = reactive<Record<View, number>>({ customers: 1, licenses: 1, audit: 1, products: 1 })
const totals = reactive<Record<View, number>>({ customers: 0, licenses: 0, audit: 0, products: 0 })
const customers = ref<Customer[]>([])
const inventory = ref<AdminLicense[]>([])
const products = ref<AdminProduct[]>([])
const auditEntries = ref<AuditEntry[]>([])
const user = ref<AdminUser | null>(null)
const selectedLicenseId = ref('')
const selectedLicense = computed(() => user.value?.licenses.find(license => license.licenseId === selectedLicenseId.value) ?? null)
const profileAuditPage = ref(1)
const profileAuditTotal = ref(0)
const query = ref('')
const appliedQuery = ref('')
const customerFilter = ref('all')
const customerSort = ref('name')
const licenseSearch = ref('')
const licenseFilter = ref('all')
const productFilter = ref('')
const licenseSort = ref('product')
const auditSearch = ref('')
const productSearch = ref('')
const productState = ref('all')
const loading = ref(false)
const submitting = ref(false)
const loaded = ref(false)
const error = ref('')
const notice = ref('')
const reason = ref('')
const ipAddress = ref('')
const grantProductId = ref('')
const grantExpiresAt = ref('')
const licenseKey = ref('')
const licenseKeyOwner = ref('')
const keyVisible = ref(false)
const lastUpdated = ref('')
const clock = ref(Date.now())
const testMode = ref(false)
const ownerVerified = ref(false)
const verifyingOwner = ref(false)
const testError = ref('')
let verifiedToken = ''
let identityGeneration = 0
let testStore: ReturnType<typeof createAdminTestStore> | null = null
let generation = 0
let lastToken = ''
let clockTimer: ReturnType<typeof setInterval> | undefined
const busy = computed(() => loading.value || submitting.value || verifyingOwner.value)
const maxPage = computed(() => Math.max(1, Math.ceil(totals[view.value] / pageSize)))
const sourceLicenses = computed(() => user.value?.licenses ?? [])
const grantOptions = computed(() => testMode.value
  ? products.value.filter(product => product.active).map(product => ({ id: product.productId, name: product.name, productId: product.productId, reason: '' }))
  : documentedGrantOptions(pluginData.plugins, products.value))
const filteredCustomers = computed(() => customers.value.filter(customer =>
  hasConnectedAccount(customer) && (customerFilter.value === 'all' ||
  (customerFilter.value === 'restricted' && (customer.banned || customer.onHold)) ||
  (customerFilter.value === 'unverified' && customer.verificationStatus !== 'verified')),
).sort((a, b) => customerSort.value === 'licenses' ? b.licenseCount - a.licenseCount
  : (a.globalName || a.username || a.discordId).localeCompare(b.globalName || b.username || b.discordId)))
const licenseProducts = computed(() => [...new Set(sourceLicenses.value.map(license => license.productId))].sort())
const filteredLicenses = computed(() => sourceLicenses.value.filter(license => {
  const text = `${license.licenseId} ${license.productId} ${productName(license.productId)} ${user.value?.username ?? ''} ${license.customerDiscordId} ${license.allowedIps.join(' ')} ${license.serverId ?? ''} ${license.lastValidatedServerId ?? ''}`.toLowerCase()
  return text.includes(licenseSearch.value.trim().toLowerCase()) &&
    (!productFilter.value || license.productId === productFilter.value) &&
    licenseNeedsAttention(license, licenseFilter.value, clock.value)
}).sort((a, b) => licenseSort.value === 'expiry'
  ? expiryTime(a) - expiryTime(b)
  : licenseSort.value === 'validation'
    ? (Date.parse(b.lastValidatedAt ?? '') || 0) - (Date.parse(a.lastValidatedAt ?? '') || 0)
    : productName(a.productId).localeCompare(productName(b.productId))))
const licenseStats = computed(() => ({
  active: sourceLicenses.value.filter(license => effectiveLicenseStatus(license, clock.value) === 'active').length,
  expiring: sourceLicenses.value.filter(license => licenseNeedsAttention(license, 'expiring', clock.value)).length,
  noIps: sourceLicenses.value.filter(license => licenseNeedsAttention(license, 'no-ips', clock.value)).length,
  neverValidated: sourceLicenses.value.filter(license => licenseNeedsAttention(license, 'never-validated', clock.value)).length,
}))
const filteredAudit = computed(() => auditEntries.value.filter(entry =>
  `${entry.action} ${entry.actor} ${entry.entityType} ${entry.entityId}`.toLowerCase().includes(auditSearch.value.trim().toLowerCase())))
const filteredProducts = computed(() => products.value.filter(product =>
  `${product.name} ${product.productId}`.toLowerCase().includes(productSearch.value.trim().toLowerCase()) &&
  (productState.value === 'all' || product.active === (productState.value === 'active'))))
const auditCurrentPage = computed(() => user.value ? profileAuditPage.value : pages.audit)
const auditMaxPage = computed(() => Math.max(1, Math.ceil((user.value ? profileAuditTotal.value : totals.audit) / pageSize)))

function expiryTime(license: AdminLicense) { return license.expiresAt ? Date.parse(license.expiresAt) || Infinity : Infinity }
function productName(id: string) { return products.value.find(product => product.productId === id)?.name || id }
function messageOf(value: unknown) { return value instanceof Error ? value.message : 'The admin request could not be completed.' }
function clearMessages() { error.value = ''; notice.value = '' }
function clearKey() { licenseKey.value = ''; licenseKeyOwner.value = ''; keyVisible.value = false }
function resetLicenseFilters() { licenseSearch.value = ''; licenseFilter.value = 'all'; productFilter.value = '' }
function formatDate(value: string | null, empty = 'Never') {
  if (!value) return empty
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Invalid date reported'
}

function workerBase() {
  const configured = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!configured) throw new Error('The admin API must be configured.')
  const url = new URL(configured, window.location.origin)
  url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '')
  url.search = ''
  return url.toString()
}

async function verifyTestOwner() {
  const requestId = ++identityGeneration
  ownerVerified.value = false
  verifiedToken = ''
  verifyingOwner.value = true
  testError.value = ''
  try {
    const token = getDiscordSession()
    if (!token) throw new Error('Sign in with the owner Discord account to enable local test mode.')
    const response = await fetch(`${workerBase()}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
    const result = await response.json() as { user?: { id: string; role: string | null; username?: string; globalName?: string }; error?: string }
    if (requestId !== identityGeneration || token !== getDiscordSession()) return null
    if (!response.ok || !result.user) throw new Error(result.error || 'Could not verify the owner session.')
    if (result.user.id !== TEST_OWNER_ID || result.user.role !== 'owner') throw new Error('Local test mode is only available to the studio owner.')
    verifiedToken = token
    ownerVerified.value = true
    return result.user
  } catch (verificationError) {
    if (requestId === identityGeneration) testError.value = messageOf(verificationError)
    return null
  } finally { if (requestId === identityGeneration) verifyingOwner.value = false }
}

function clearWorkspace() {
  generation++
  user.value = null
  customers.value = []
  inventory.value = []
  products.value = []
  auditEntries.value = []
  selectedLicenseId.value = ''
  clearKey()
  loaded.value = false
  loading.value = false
  lastUpdated.value = ''
}

async function enterTestMode(reset = false) {
  if (busy.value || verifyingOwner.value) return
  const identity = await verifyTestOwner()
  if (!identity) return
  try {
    if (reset) clearAdminTestData(localStorage)
    testStore = createAdminTestStore(localStorage, identity)
    clearWorkspace()
    testMode.value = true
    view.value = 'customers'
    for (const tab of views) pages[tab.id] = 1
    query.value = ''
    appliedQuery.value = ''
    await lookupUser(TEST_OWNER_ID)
  } catch (storageError) { testError.value = `Local test data could not be opened or saved. ${messageOf(storageError)}` }
}

function exitTestMode() {
  if (busy.value) return
  testMode.value = false
  testStore = null
  clearWorkspace()
  view.value = 'customers'
  void loadView(1)
}

async function resetTestMode() {
  if (!window.confirm('Reset all local test changes and restore the owner test account? Real customer data is not affected.')) return
  await enterTestMode(true)
}

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getDiscordSession()
  if (testMode.value) {
    if (!ownerVerified.value || !token || token !== verifiedToken || !testStore) throw new Error('Reverify the owner account before using local test mode.')
    return testStore.request(path, init) as T
  }
  if (!token) throw new Error('Sign in with an authorized Discord account. The admin API must be configured.')
  let response: Response
  try {
    response = await fetch(`${workerBase()}/admin${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch (requestError) {
    console.error('Unable to reach the admin API:', requestError)
    throw new Error('The admin API could not be reached. Check the connection and try again.')
  }
  let result: T & { detail?: string; error?: string }
  try { result = await response.json() }
  catch (parseError) {
    console.error('Invalid admin API response:', parseError)
    throw new Error(`The admin API returned a non-JSON response (${response.status}).`)
  }
  if (!response.ok) {
    if (response.status === 404 && /^\/users(?:\/|\?|$)/.test(path)) {
      throw new Error('The licensing server does not support customer accounts yet. Update the VPS licensing API before using the customer directory.')
    }
    throw new Error(typeof result?.detail === 'string' ? result.detail : result?.error ?? `Admin request failed (${response.status}).`)
  }
  return result
}
function validatePage<T>(result: Page<T>) {
  if (!result || !Array.isArray(result.items) || !Number.isInteger(result.total) || !Number.isInteger(result.page) || result.page < 1) {
    throw new Error('The admin service returned an invalid paginated response.')
  }
  return result
}

async function loadView(page = pages[view.value]) {
  const target = view.value
  const requestId = ++generation
  clearMessages()
  loaded.value = false
  loading.value = true
  lastUpdated.value = ''
  try {
    lastToken = getDiscordSession()
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (target === 'customers' && appliedQuery.value) params.set('query', appliedQuery.value)
    const result = validatePage(await adminRequest<Page<Customer | AdminLicense | AuditEntry | AdminProduct>>(
      `/${target === 'customers' ? 'users' : target}?${params}`,
    ))
    if (requestId !== generation) return
    // Each tab maps to one fixed, server-authorized list endpoint.
    if (target === 'customers') customers.value = result.items as Customer[]
    if (target === 'licenses') inventory.value = result.items as AdminLicense[]
    if (target === 'audit') auditEntries.value = result.items as AuditEntry[]
    if (target === 'products') products.value = result.items as AdminProduct[]
    pages[target] = result.page
    totals[target] = result.total
    loaded.value = true
    lastUpdated.value = new Date().toLocaleTimeString()
  } catch (requestError) {
    if (requestId === generation) error.value = messageOf(requestError)
  } finally {
    if (requestId === generation) loading.value = false
  }
}

function switchView(target: View) {
  if (submitting.value) return
  websiteOperations.value = false
  user.value = null
  selectedLicenseId.value = ''
  clearKey()
  view.value = target
  void loadView()
}
function searchCustomers() {
  const text = query.value.trim()
  if (/^\d{5,22}$/.test(text)) { void lookupUser(text); return }
  if (text && text.length < 2) { error.value = 'Enter at least two characters, or a full Discord ID.'; return }
  appliedQuery.value = text
  void loadView(1)
}

async function fetchProfile(discordId: string) {
  if (!/^\d{5,22}$/.test(discordId)) throw new Error('Enter a valid Discord customer ID.')
  const requestId = ++generation
  const sameCustomer = user.value?.discordId === discordId
  if (!sameCustomer) {
    clearKey()
    selectedLicenseId.value = ''
    reason.value = ''
    grantProductId.value = ''
    grantExpiresAt.value = ''
    ipAddress.value = ''
    resetLicenseFilters()
  }
  user.value = null
  loaded.value = false
  loading.value = true
  lastUpdated.value = ''
  try {
    const profile = await adminRequest<AdminUser>(`/users/${encodeURIComponent(discordId)}`)
    if (requestId !== generation) return
    if (profile.discordId !== discordId || !Array.isArray(profile.licenses)) throw new Error('The admin API returned an invalid customer profile.')
    if (!hasConnectedAccount(profile)) throw new Error('This Discord user has not created a connected website account yet.')
    const [registry, history] = await Promise.all([
      adminRequest<Page<AdminProduct>>('/products?pageSize=100'),
      adminRequest<Page<AuditEntry>>(`/audit?customerDiscordId=${encodeURIComponent(discordId)}&pageSize=${pageSize}&page=1`),
    ])
    if (requestId !== generation) return
    validatePage(registry)
    validatePage(history)
    user.value = profile
    products.value = registry.items
    if (!grantOptions.value.some(option => option.productId && option.productId === grantProductId.value)) grantProductId.value = ''
    auditEntries.value = history.items
    profileAuditPage.value = history.page
    profileAuditTotal.value = history.total
    auditSearch.value = ''
    loaded.value = true
    lastUpdated.value = new Date().toLocaleTimeString()
  } catch (requestError) {
    if (requestId === generation) throw requestError
  } finally {
    if (requestId === generation) loading.value = false
  }
}
async function lookupUser(discordId: string) {
  clearMessages()
  try { await fetchProfile(discordId) }
  catch (requestError) { error.value = messageOf(requestError) }
}
async function inspectLicense(license: AdminLicense) {
  if (!user.value || user.value.discordId !== license.customerDiscordId) await lookupUser(license.customerDiscordId)
  if (!user.value || user.value.discordId !== license.customerDiscordId) return
  selectedLicenseId.value = license.licenseId
  ipAddress.value = ''
  await nextTick()
  document.getElementById('license-inspector')?.focus()
}

async function mutate<T>(path: string, init: RequestInit, success: string, accept?: (result: T) => void) {
  if (!user.value || busy.value) return
  const discordId = user.value.discordId
  const session = getDiscordSession()
  const operationId = generation
  clearMessages()
  submitting.value = true
  let committed = false
  try {
    const result = await adminRequest<T>(path, init)
    committed = true
    if (session !== getDiscordSession() || operationId !== generation) return
    accept?.(result)
    await fetchProfile(discordId)
    if (session === getDiscordSession() && user.value?.discordId === discordId) notice.value = success
  } catch (requestError) {
    if (session === getDiscordSession()) error.value = `${committed ? 'Change saved, but the refreshed profile could not be loaded. Do not repeat the action. ' : ''}${messageOf(requestError)}`
  } finally {
    submitting.value = false
  }
}
function perform(path: string, payload: Record<string, unknown> | undefined, success: string) {
  return mutate(path, { method: 'POST', ...(payload ? { body: JSON.stringify(payload) } : {}) }, success)
}
function confirmAction(message: string, path: string, success: string) {
  if (window.confirm(message)) void perform(path, { reason: reason.value.trim() || undefined }, success)
}
async function grantLicense() {
  if (!user.value || !grantProductId.value) return
  const selectedProduct = grantOptions.value.find(option => option.productId === grantProductId.value && !option.reason)
  if (!selectedProduct) { error.value = 'Select an available, registered plugin before granting a license.'; return }
  const discordId = user.value.discordId
  if (licenseKey.value && !window.confirm('Another one-time key is still displayed. Have you saved it? Creating another license will replace the displayed key.')) return
  const expiry = grantExpiresAt.value ? new Date(grantExpiresAt.value) : null
  if (expiry && (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now())) {
    error.value = 'Choose a future expiry date, or leave it blank for a lifetime license.'
    return
  }
  if (!window.confirm(`Grant ${selectedProduct.name} to ${user.value.globalName || user.value.username} (${user.value.discordId})${expiry ? ` until ${expiry.toLocaleString()}` : ' with lifetime access'}?`)) return
  await mutate<{ licenseKey: string }>('/licenses', {
    method: 'POST', body: JSON.stringify({
      productId: grantProductId.value, customerDiscordId: user.value.discordId,
      ...(expiry ? { expiresAt: expiry.toISOString() } : {}),
    }),
  }, 'License created. Save the one-time key before leaving this customer.', result => {
    if (typeof result.licenseKey !== 'string' || !result.licenseKey) throw new Error('The service did not return the issued key. Check audit history before retrying.')
    licenseKey.value = result.licenseKey
    licenseKeyOwner.value = discordId
    keyVisible.value = false
    grantExpiresAt.value = ''
  })
}
function addIp() {
  if (!selectedLicense.value) return
  const address = normalizeIpAddress(ipAddress.value)
  if (!address) { error.value = 'Enter a valid numeric IPv4 or IPv6 address, without a port.'; return }
  if (selectedLicense.value.allowedIps.some(existing => normalizeIpAddress(existing) === address)) {
    error.value = 'That address is already allowed.'
    return
  }
  void mutate(`/licenses/${selectedLicense.value.licenseId}/ips`, {
    method: 'POST', body: JSON.stringify({ ipAddress: address }),
  }, 'IP address added.', () => { ipAddress.value = '' })
}
function removeIp(address: string) {
  if (!selectedLicense.value || !window.confirm(`Remove ${address}? Servers using this address may lose license validation.`)) return
  void mutate(`/licenses/${selectedLicense.value.licenseId}/ips?ipAddress=${encodeURIComponent(address)}`, { method: 'DELETE' }, 'IP address removed.')
}
async function deleteCustomer() {
  if (!user.value || busy.value) return
  const discordId = user.value.discordId
  if (window.prompt(`Permanently delete this account, revoke active licenses, and erase its IP/server bindings? Type ${discordId} to confirm.`) !== discordId) return
  clearMessages()
  submitting.value = true
  let committed = false
  const session = getDiscordSession()
  try {
    await adminRequest(`/users/${discordId}`, { method: 'DELETE' })
    committed = true
    if (session !== getDiscordSession()) return
    user.value = null
    selectedLicenseId.value = ''
    clearKey()
    view.value = 'customers'
    await loadView(1)
    if (error.value) error.value = `Account deleted, but the directory could not be refreshed. ${error.value}`
    else notice.value = 'Customer deleted. Active licenses revoked; personal profile and bindings erased.'
  } catch (requestError) {
    if (session === getDiscordSession()) error.value = `${committed ? 'Account deleted. ' : ''}${messageOf(requestError)}`
  } finally { submitting.value = false }
}
async function loadAuditPage(page: number) {
  if (!user.value) { void loadView(page); return }
  const discordId = user.value.discordId
  const requestId = ++generation
  loading.value = true
  clearMessages()
  try {
    const result = validatePage(await adminRequest<Page<AuditEntry>>(`/audit?customerDiscordId=${discordId}&pageSize=${pageSize}&page=${page}`))
    if (requestId !== generation) return
    auditEntries.value = result.items
    profileAuditPage.value = result.page
    profileAuditTotal.value = result.total
  } catch (requestError) {
    if (requestId === generation) error.value = `Audit history could not be refreshed. Showing the previous page. ${messageOf(requestError)}`
  } finally { if (requestId === generation) loading.value = false }
}
async function copyText(value: string, label: string) {
  clearMessages()
  try { await navigator.clipboard.writeText(value); notice.value = `${label} copied.` }
  catch (copyError) {
    console.error('Admin clipboard access denied:', copyError)
    error.value = 'Clipboard access was denied. Reveal/select the value and copy it manually.'
  }
}
function exportLicenses() {
  const rows = [
    ['License ID', 'Product ID', 'Customer Discord ID', 'Effective status', 'Expires at', 'IP count', 'Last validated at'],
    ...filteredLicenses.value.map(license => [
      license.licenseId, license.productId, license.customerDiscordId, effectiveLicenseStatus(license, clock.value),
      license.expiresAt ?? 'Lifetime', String(license.allowedIps.length), license.lastValidatedAt ?? 'Never',
    ]),
  ]
  const blob = new Blob(['\uFEFF', toSafeCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `lumen-${testMode.value ? 'TEST-ONLY-' : ''}licenses-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
  notice.value = `${filteredLicenses.value.length} displayed licenses exported. Keys and IP addresses are excluded.`
}
function handleSession() {
  try {
    if (lastToken === getDiscordSession()) return
    testMode.value = false
    testStore = null
    ownerVerified.value = false
    verifiedToken = ''
    generation++
    user.value = null
    customers.value = []
    inventory.value = []
    products.value = []
    auditEntries.value = []
    selectedLicenseId.value = ''
    clearKey()
    void verifyTestOwner()
    void loadView()
  } catch (sessionError) {
    generation++
    identityGeneration++
    testMode.value = false
    testStore = null
    ownerVerified.value = false
    verifiedToken = ''
    user.value = null
    loaded.value = false
    loading.value = false
    clearKey()
    error.value = messageOf(sessionError)
  }
}
onMounted(() => {
  if (/^[0-9a-f-]{36}$/i.test(new URLSearchParams(window.location.search).get('ticket') || '')) websiteOperations.value = true
  void verifyTestOwner()
  void loadView()
  clockTimer = setInterval(() => { clock.value = Date.now() }, 60000)
  window.addEventListener('lumen-discord-user', handleSession)
})
onUnmounted(() => {
  identityGeneration++
  generation++
  clearInterval(clockTimer)
  clearKey()
  window.removeEventListener('lumen-discord-user', handleSession)
})
</script>

<template>
  <main id="admin-dashboard" class="admin-workspace">
    <header class="staff-hero">
      <div><p class="staff-eyebrow">LUMEN STUDIOS / STAFF OPERATIONS</p><h1>Staff Dashboard<span>.</span></h1><p>Website tickets, updates, service health, and customer access.</p></div>
      <span class="staff-access">Authorized staff only</span>
    </header>
    <nav class="staff-navigation" aria-label="Staff dashboard areas"><button type="button" :aria-pressed="!websiteOperations" @click="websiteOperations = false">Licenses &amp; accounts</button><button type="button" :aria-pressed="websiteOperations" :disabled="submitting" @click="websiteOperations = true">Tickets, updates &amp; status</button></nav>
    <StaffCommunity v-if="websiteOperations" />
    <template v-else>
    <aside class="staff-test-mode" :class="{ 'is-testing': testMode }" aria-label="Owner local test mode">
      <div><strong>{{ testMode ? 'LOCAL TEST MODE — NOT LIVE DATA' : 'Licensing API offline? Try the controls safely.' }}</strong><p>{{ testMode ? 'Editing your owner test account only. Changes stay in this browser; test keys never validate plugins. Nothing here changes real licenses.' : 'The owner account can practice grants, bans, holds, verification, IP edits, and deletion without the licensing backend. Discord sign-in must still work.' }}</p></div>
      <div class="staff-actions">
        <button v-if="!testMode && ownerVerified" type="button" :disabled="busy || verifyingOwner" @click="enterTestMode()">Open my editable test account</button>
        <button v-if="!ownerVerified" type="button" :disabled="busy || verifyingOwner" @click="verifyTestOwner">{{ verifyingOwner ? 'Verifying owner…' : 'Verify owner access' }}</button>
        <button v-if="testMode" type="button" :disabled="busy || verifyingOwner" @click="exitTestMode">Exit test mode · return to live</button>
        <button v-if="ownerVerified" type="button" :disabled="busy || verifyingOwner" @click="resetTestMode">Reset test data</button>
      </div>
      <p v-if="testError" class="staff-error" role="alert">{{ testError }}</p>
    </aside>
    <nav class="staff-navigation" aria-label="Administration workspaces">
      <button v-for="tab in views" :key="tab.id" type="button" :aria-current="view === tab.id && !user ? 'page' : undefined" :disabled="submitting" @click="switchView(tab.id)"><small>{{ tab.number }}</small>{{ tab.label }}</button>
    </nav>
    <div class="staff-context"><span>{{ user ? `Customers / ${user.globalName || user.username || user.discordId}` : views.find(tab => tab.id === view)?.label }}</span><div><span v-if="lastUpdated">Updated {{ lastUpdated }}</span><button type="button" :disabled="busy" @click="user ? lookupUser(user.discordId) : loadView()">{{ loading ? 'Loading…' : 'Refresh view' }}</button></div></div>
    <p v-if="error" class="staff-message staff-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="staff-message" role="status">{{ notice }}</p>
    <section v-if="licenseKey" class="staff-key" aria-label="New one-time license key">
      <div><strong>{{ testMode ? 'TEST-ONLY key' : 'One-time key' }} for {{ licenseKeyOwner }} — save it before leaving</strong><p>{{ testMode ? 'This simulated key cannot validate plugins.' : 'Issued keys are not included in exports or audit detail previews.' }}</p></div>
      <label>Issued license key<input :type="keyVisible ? 'text' : 'password'" :value="licenseKey" readonly autocomplete="off"></label>
      <div class="staff-actions"><button type="button" @click="keyVisible = !keyVisible">{{ keyVisible ? 'Hide key' : 'Reveal key' }}</button><button type="button" @click="copyText(licenseKey, 'License key')">Copy key</button><button type="button" @click="clearKey">Dismiss key</button></div>
    </section>
    <p v-if="loading && !loaded" class="staff-loading" role="status">Loading authorized workspace data…</p>

    <section v-if="!user && view === 'customers'" class="staff-panel">
      <header><div><p class="staff-eyebrow">CUSTOMER DIRECTORY</p><h2>Find the right account.</h2></div><span v-if="loaded" class="staff-badge">{{ filteredCustomers.length }} connected on this page</span></header>
      <form class="staff-search" @submit.prevent="searchCustomers"><label for="customer-search">Search usernames or open a Discord ID</label><div><input id="customer-search" v-model="query" maxlength="32" autocomplete="off" placeholder="Username, display name, or full Discord ID"><button class="staff-primary" type="submit" :disabled="busy">Find customer</button></div></form>
      <div v-if="loaded" class="staff-toolbar"><label>Filter loaded page<select v-model="customerFilter"><option value="all">All accounts</option><option value="restricted">Banned or on hold</option><option value="unverified">Not verified</option></select></label><label>Sort this page<select v-model="customerSort"><option value="name">Name A–Z</option><option value="licenses">Most licenses</option></select></label><span>{{ filteredCustomers.length }} / {{ customers.length }} on this page</span></div>
      <div v-if="loaded && filteredCustomers.length" class="staff-customers">
        <button v-for="customer in filteredCustomers" :key="customer.discordId" type="button" :disabled="busy" @click="lookupUser(customer.discordId)">
          <span class="staff-avatar" aria-hidden="true">{{ (customer.globalName || customer.username || '#').slice(0, 2).toUpperCase() }}</span>
          <span class="staff-customer-name"><strong>{{ customer.globalName || customer.username || 'Discord name not synced' }}</strong><small>{{ customer.username ? `@${customer.username} / ` : '' }}{{ customer.discordId }}</small></span>
          <span class="staff-customer-status"><b v-if="customer.banned" class="staff-badge">Banned</b><b v-if="customer.onHold" class="staff-badge">On hold</b><small>{{ customer.verificationStatus.replaceAll('_', ' ') }}</small></span>
          <span class="staff-license-count">{{ customer.licenseCount }}<small>licenses →</small></span>
        </button>
      </div>
      <p v-else-if="loaded" class="staff-empty">No connected website accounts match this search and page filter. Check other pages or ask the customer to sign in.</p>
      <p class="staff-note">Only customers who have connected their Discord account to the website are shown. Filters and sorting apply to the loaded page; the page count also includes unconnected licensing records.</p>
    </section>

    <template v-if="user && loaded">
      <button class="staff-back" type="button" :disabled="busy" @click="switchView('customers')">← Back to customers</button>
      <section class="staff-profile">
        <span class="staff-avatar" aria-hidden="true">{{ (user.globalName || user.username || '#').slice(0, 2).toUpperCase() }}</span>
        <div><p class="staff-eyebrow">CUSTOMER PROFILE</p><h2>{{ user.globalName || user.username || 'Discord customer' }}</h2><p>{{ user.username ? `@${user.username} / ` : '' }}{{ user.discordId }}</p><button type="button" :disabled="busy" @click="copyText(user.discordId, 'Discord ID')">Copy Discord ID</button></div>
        <div class="staff-profile-state"><span class="staff-badge">{{ user.deleted ? 'Deleted account' : user.banned ? 'Banned' : user.onHold ? 'On hold' : 'No account restriction' }}</span><span class="staff-badge">{{ user.verificationStatus.replaceAll('_', ' ') }}</span></div>
      </section>
      <div class="staff-columns">
        <section class="staff-panel">
          <p class="staff-eyebrow">ACCOUNT CONTROLS</p><h2>Access &amp; verification</h2>
          <dl class="staff-facts"><div><dt>Ban reason</dt><dd>{{ user.banReason || 'None recorded' }}</dd></div><div><dt>Hold reason</dt><dd>{{ user.holdReason || 'None recorded' }}</dd></div><div><dt>Verification</dt><dd>{{ user.verificationReason || 'No reason recorded' }}<small>{{ formatDate(user.verificationRequestedAt, 'No request recorded') }}</small></dd></div></dl>
          <label class="staff-field">Reason for next action<input v-model="reason" maxlength="500" placeholder="Reason recorded in audit history" :disabled="busy"></label>
          <div class="staff-actions">
            <button type="button" :disabled="busy || user.deleted" :class="{ 'staff-danger': !user.banned }" @click="user.banned ? perform(`/users/${user.discordId}/unban`, undefined, 'Account unbanned.') : confirmAction('Ban this customer? Future license validation will be blocked.', `/users/${user.discordId}/ban`, 'Account banned.')">{{ user.banned ? 'Remove ban' : 'Ban account' }}</button>
            <button type="button" :disabled="busy || user.deleted" @click="user.onHold ? perform(`/users/${user.discordId}/release`, undefined, 'Hold released.') : confirmAction('Place this customer on hold? Future license validation will be blocked.', `/users/${user.discordId}/hold`, 'Customer placed on hold.')">{{ user.onHold ? 'Release hold' : 'Place on hold' }}</button>
            <button type="button" :disabled="busy || user.deleted" @click="perform(`/users/${user.discordId}/verification-request`, { reason: reason.trim() || undefined }, 'Verification request recorded; no automatic notification was sent.')">Request verification</button>
            <button type="button" :disabled="busy || user.deleted || user.verificationStatus === 'verified'" @click="perform(`/users/${user.discordId}/verify`, undefined, 'Account marked verified.')">Mark verified</button>
          </div>
          <p class="staff-note">Bans and holds block future validation, not existing sessions. Verification requests are recorded only; contact the customer separately.</p>
          <details class="staff-danger-zone"><summary>Danger zone</summary><p>Deletion revokes active licenses, clears IP/server bindings, and erases profile details. Minimal audit history is retained.</p><button class="staff-danger" type="button" :disabled="busy || user.deleted" @click="deleteCustomer">Permanently delete customer</button></details>
        </section>
        <section class="staff-panel">
          <p class="staff-eyebrow">ISSUE AN ENTITLEMENT</p><h2>Grant a license</h2>
          <p class="staff-note">Creates a license in the same service used by the Discord bot and returns a one-time key. This does not notify the customer, refresh BuiltByBit purchases, or rotate their shared key.</p>
          <form @submit.prevent="grantLicense">
            <label class="staff-field">Plugin<select v-model="grantProductId" :disabled="busy || user.deleted"><option disabled value="">Select a plugin</option><option v-for="option in grantOptions" :key="option.id" :value="option.productId" :disabled="!!option.reason">{{ option.name }}{{ option.reason ? ` — ${option.reason}` : '' }}</option></select></label>
            <label class="staff-field">Expires at · local time<input v-model="grantExpiresAt" type="datetime-local" :disabled="busy || user.deleted"><small>Leave blank for a lifetime license. Expiry must be in the future.</small></label>
            <button class="staff-primary" type="submit" :disabled="busy || user.deleted || !grantProductId">Review &amp; create license</button>
          </form>
          <p class="staff-note">Only documented plugins matched to an active licensing product with a linked plugin can be selected. Unavailable entries need setup in the licensing service; coming-soon plugins cannot be granted.</p>
        </section>
      </div>
    </template>

    <section v-if="loaded && user" class="staff-panel">
      <header><div><p class="staff-eyebrow">CUSTOMER ENTITLEMENTS</p><h2>Licenses &amp; server access</h2></div><button type="button" :disabled="busy || !filteredLicenses.length" @click="exportLicenses">Export displayed CSV</button></header>
      <p class="staff-note">Metrics cover the licenses returned on this customer profile. Expiring means active and due within 30 days.</p>
      <div class="staff-metrics">
        <button type="button" :disabled="busy" @click="licenseFilter = 'active'"><small>ACTIVE</small><strong>{{ licenseStats.active }}</strong></button>
        <button type="button" :disabled="busy" @click="licenseFilter = 'expiring'"><small>EXPIRING / 30D</small><strong>{{ licenseStats.expiring }}</strong></button>
        <button type="button" :disabled="busy" @click="licenseFilter = 'no-ips'"><small>NO ALLOWED IP</small><strong>{{ licenseStats.noIps }}</strong></button>
        <button type="button" :disabled="busy" @click="licenseFilter = 'never-validated'"><small>NEVER VALIDATED</small><strong>{{ licenseStats.neverValidated }}</strong></button>
      </div>
      <div class="staff-toolbar">
        <label class="staff-grow">Search loaded licenses<input v-model="licenseSearch" type="search" placeholder="License, owner, IP, or server ID"></label>
        <label>Status / attention<select v-model="licenseFilter"><option value="all">All licenses</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option><option value="expired">Expired</option><option value="unknown">Unknown status</option><option value="expiring">Expiring in 30 days</option><option value="no-ips">No allowed IP</option><option value="never-validated">Never validated</option></select></label>
        <label>Product<select v-model="productFilter"><option value="">All products</option><option v-for="id in licenseProducts" :key="id" :value="id">{{ productName(id) }}</option></select></label>
        <label>Sort<select v-model="licenseSort"><option value="product">Product A–Z</option><option value="expiry">Nearest expiry</option><option value="validation">Latest validation</option></select></label>
      </div>
      <div class="staff-results"><span>{{ filteredLicenses.length }} / {{ sourceLicenses.length }} licenses shown</span><button type="button" @click="resetLicenseFilters">Clear filters</button></div>
      <div v-if="filteredLicenses.length" class="staff-table-scroll" tabindex="0" aria-label="License inventory table">
        <table class="staff-table"><thead><tr><th>Product / license</th><th>Customer</th><th>Status</th><th>Expiry</th><th>IPs</th><th>Last validation</th><th><span class="staff-sr-only">Actions</span></th></tr></thead><tbody>
          <tr v-for="license in filteredLicenses" :key="license.licenseId" :class="{ 'staff-selected': selectedLicenseId === license.licenseId }"><td><strong>{{ productName(license.productId) }}</strong><small>{{ license.licenseId }}</small></td><td><strong>{{ user.globalName || user.username }}</strong><small>@{{ user.username }}</small></td><td><span class="staff-badge" :data-status="effectiveLicenseStatus(license, clock)">{{ effectiveLicenseStatus(license, clock) }}</span></td><td>{{ formatDate(license.expiresAt, 'Lifetime') }}</td><td>{{ license.allowedIps.length }} / 3</td><td>{{ formatDate(license.lastValidatedAt) }}</td><td><button type="button" :disabled="busy" @click="inspectLicense(license)">Inspect →</button></td></tr>
        </tbody></table>
      </div>
      <p v-else class="staff-empty">No licenses match these filters.</p>
    </section>

    <section v-if="loaded && selectedLicense" id="license-inspector" class="staff-panel staff-inspector" tabindex="-1">
      <header><div><p class="staff-eyebrow">LICENSE INSPECTOR / {{ productName(selectedLicense.productId) }}</p><h2>Network &amp; validation</h2></div><button type="button" :disabled="busy" @click="selectedLicenseId = ''">Close inspector</button></header>
      <p class="staff-license-id">{{ selectedLicense.licenseId }} <button type="button" @click="copyText(selectedLicense.licenseId, 'License ID')">Copy ID</button></p>
      <dl class="staff-facts staff-network-facts"><div><dt>API status</dt><dd>{{ selectedLicense.status }}</dd></div><div><dt>Expires</dt><dd>{{ formatDate(selectedLicense.expiresAt, 'Lifetime') }}</dd></div><div><dt>Bound server</dt><dd>{{ selectedLicense.serverId || 'Not bound' }}</dd></div><div><dt>Last validated server</dt><dd>{{ selectedLicense.lastValidatedServerId || 'Not reported' }}</dd></div><div><dt>Last validated</dt><dd>{{ formatDate(selectedLicense.lastValidatedAt) }}</dd></div></dl>
      <div class="staff-actions">
        <button v-if="selectedLicense.status === 'active'" type="button" :disabled="busy || user?.deleted" @click="confirmAction('Suspend this license? It will stop validating until reactivated.', `/licenses/${selectedLicense.licenseId}/suspend`, 'License suspended.')">Suspend license</button>
        <button v-if="selectedLicense.status === 'suspended'" type="button" :disabled="busy || user?.deleted" @click="perform(`/licenses/${selectedLicense.licenseId}/activate`, undefined, 'License reactivated.')">Reactivate license</button>
        <button v-if="selectedLicense.status !== 'revoked'" class="staff-danger" type="button" :disabled="busy || user?.deleted" @click="confirmAction('Permanently revoke this license? This cannot be undone.', `/licenses/${selectedLicense.licenseId}/revoke`, 'License revoked.')">Revoke permanently</button>
      </div>
      <p class="staff-note">The account reason field above is recorded for suspension/revocation. Reactivation does not change expiry or override an account ban/hold.</p>
      <h3>Allowed IPs <span class="staff-badge">{{ selectedLicense.allowedIps.length }} / 3</span></h3>
      <div class="staff-ip-list"><div v-for="address in selectedLicense.allowedIps" :key="address"><code>{{ address }}</code><button type="button" :disabled="busy || user?.deleted || selectedLicense.status === 'revoked'" @click="removeIp(address)">Remove</button></div></div>
      <p v-if="!selectedLicense.allowedIps.length" class="staff-note">No allowed IPs. This license cannot validate.</p>
      <form v-if="selectedLicense.allowedIps.length < 3 && selectedLicense.status !== 'revoked'" class="staff-inline-form" @submit.prevent="addIp"><label class="staff-grow">New allowed IP<input v-model="ipAddress" maxlength="45" placeholder="Public IPv4 or IPv6" :disabled="busy || user?.deleted"></label><button class="staff-primary" type="submit" :disabled="busy || user?.deleted || !ipAddress.trim()">Add allowed IP</button></form>
    </section>

    <section v-if="loaded && (user || view === 'audit')" class="staff-panel">
      <header><div><p class="staff-eyebrow">{{ user ? 'CUSTOMER HISTORY' : 'GLOBAL AUDIT TRAIL' }}</p><h2>Every action, traceable.</h2></div><span class="staff-badge">{{ user ? profileAuditTotal : totals.audit }} events</span></header>
      <label class="staff-field">Filter loaded events<input v-model="auditSearch" type="search" placeholder="Action, actor, entity type, or entity ID"></label>
      <p class="staff-note">{{ filteredAudit.length }} / {{ auditEntries.length }} events on this page. Credential-named fields are redacted from details.</p>
      <div class="staff-audit"><details v-for="entry in filteredAudit" :key="entry.auditId"><summary><span><strong>{{ entry.action.replaceAll('.', ' ') }}</strong><small>{{ entry.actor }} / {{ entry.entityType }}</small></span><time :datetime="entry.createdAt">{{ formatDate(entry.createdAt) }}</time></summary><dl class="staff-facts"><div><dt>Event ID</dt><dd>{{ entry.auditId }}</dd></div><div><dt>Entity ID</dt><dd>{{ entry.entityId }}</dd></div></dl><pre>{{ JSON.stringify(redactAuditDetails(entry.details), null, 2) }}</pre></details></div>
      <p v-if="!filteredAudit.length" class="staff-empty">No audit events match this page filter.</p>
      <div v-if="auditMaxPage > 1" class="staff-pagination"><button type="button" :disabled="busy || auditCurrentPage <= 1" @click="loadAuditPage(auditCurrentPage - 1)">Previous events</button><span>Page {{ auditCurrentPage }} / {{ auditMaxPage }}</span><button type="button" :disabled="busy || auditCurrentPage >= auditMaxPage" @click="loadAuditPage(auditCurrentPage + 1)">Next events</button></div>
    </section>

    <section v-if="loaded && !user && view === 'products'" class="staff-panel">
      <header><div><p class="staff-eyebrow">LICENSING PRODUCT REGISTRY</p><h2>Products the service recognizes.</h2></div><span class="staff-badge">{{ totals.products }} products</span></header>
      <div class="staff-toolbar"><label class="staff-grow">Search this page<input v-model="productSearch" type="search" placeholder="Product name or ID"></label><label>Availability<select v-model="productState"><option value="all">All products</option><option value="active">Active products</option><option value="inactive">Inactive products</option></select></label></div>
      <div class="staff-products"><article v-for="product in filteredProducts" :key="product.productId"><span class="staff-avatar" aria-hidden="true">{{ product.name.slice(0, 1) }}</span><div><h3>{{ product.name }}</h3><code>{{ product.productId }}</code></div><span class="staff-badge">{{ product.active ? 'Active' : 'Inactive' }}</span><button type="button" @click="copyText(product.productId, 'Product ID')">Copy ID</button></article></div>
      <p v-if="!filteredProducts.length" class="staff-empty">No products match this page filter.</p>
      <p class="staff-note">This is the live licensing registry, not the public shop. Product creation and editing are not exposed by the connected admin API.</p>
    </section>
    <div v-if="loaded && !user && view !== 'audit'" class="staff-pagination"><button type="button" :disabled="busy || pages[view] <= 1" @click="loadView(pages[view] - 1)">Previous page</button><span>Page {{ pages[view] }} / {{ maxPage }} · {{ totals[view] }} total</span><button type="button" :disabled="busy || pages[view] >= maxPage" @click="loadView(pages[view] + 1)">Next page</button></div>
    <footer class="staff-footer">{{ testMode ? 'Local simulation only. Reset to undo all test edits; exit to return to the real API.' : 'Access is checked by the Worker on every live request. Administrator credentials never reach this page.' }}</footer>
    </template>
  </main>
</template>

<style scoped>
.admin-workspace { max-width: 1280px; margin: 0 auto; padding: 32px clamp(16px, 3vw, 40px) 70px; color: var(--vp-c-text-1); }
.staff-hero { position: relative; display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; overflow: hidden; padding: clamp(24px, 4vw, 42px); border: 1px solid #9a6bf344; border-radius: 22px; background: radial-gradient(ellipse at 100% 0, #7b3ff22a, transparent 60%), var(--vp-c-bg-soft); }
.staff-eyebrow { margin: 0 0 8px; color: var(--vp-c-brand-1); font-size: .62rem; font-weight: 750; letter-spacing: .12em; }
.staff-hero h1 { margin: 15px 0 12px; font-size: clamp(1.9rem, 4vw, 3.2rem); line-height: 1.05; letter-spacing: -.055em; }
.staff-hero h1 span { color: var(--vp-c-brand-1); }
.staff-hero p:last-child { max-width: 500px; margin: 0; color: var(--vp-c-text-2); font-size: .9rem; line-height: 1.7; }
.staff-access { flex-shrink: 0; padding: 7px 10px; border: 1px solid #9a6bf344; border-radius: 7px; color: var(--vp-c-brand-1); font-size: .65rem; }
.staff-test-mode { margin: 18px 0; padding: 18px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); }
.staff-test-mode.is-testing { border: 2px solid var(--vp-c-warning-1); background: var(--vp-c-warning-soft); }
.staff-test-mode strong { font-size: .82rem; }
.staff-test-mode p { margin: 7px 0; color: var(--vp-c-text-2); font-size: .76rem; line-height: 1.7; }
.staff-navigation { display: flex; gap: 5px; margin: 22px 0; padding: 5px; overflow-x: auto; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); }
.admin-workspace button { padding: 8px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); cursor: pointer; font: inherit; font-size: .76rem; font-weight: 600; transition: background .16s, border-color .16s; }
.admin-workspace button:hover:not(:disabled) { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.admin-workspace button:disabled { opacity: .5; cursor: not-allowed; }
.admin-workspace :is(button, input, select, summary):focus-visible, .staff-table-scroll:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
.staff-navigation button { display: flex; flex: 1; align-items: center; justify-content: center; gap: 12px; white-space: nowrap; border: 0; background: transparent; padding: 12px 16px; }
.staff-navigation small { font: .65rem var(--vp-font-family-mono); color: var(--vp-c-text-3); }
.staff-navigation button[aria-current=page] { background: var(--vp-c-bg); color: var(--vp-c-brand-1); box-shadow: 0 2px 6px #0000000a; }
.staff-context { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; margin: 18px 0; color: var(--vp-c-text-2); font-size: .73rem; }
.staff-context > div { display: flex; align-items: center; gap: 12px; }
.staff-panel, .staff-profile { margin: 18px 0; padding: clamp(18px, 2.5vw, 28px); border: 1px solid var(--vp-c-divider); border-radius: 17px; background: var(--vp-c-bg-soft); }
.staff-panel > header { display: flex; align-items: center; justify-content: space-between; gap: 15px; flex-wrap: wrap; }
.admin-workspace h2 { margin: 0 0 8px; padding: 0; border: 0; font-size: clamp(1.1rem, 2vw, 1.5rem); line-height: 1.3; letter-spacing: -.035em; }
.admin-workspace h3 { margin: 20px 0 12px; font-size: 1rem; }
.staff-search { margin: 24px 0 18px; }
.staff-search label, .staff-field, .staff-inline-form label, .staff-key label { display: grid; gap: 7px; font-size: .77rem; font-weight: 600; }
.staff-search > div, .staff-inline-form { display: flex; align-items: flex-end; gap: 10px; margin-top: 8px; }
.staff-search input { flex: 1; }
.admin-workspace :is(input, select) { display: block; width: 100%; min-width: 0; padding: 10px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; font-size: .8rem; }
.staff-field { margin: 18px 0; }
.staff-field small { color: var(--vp-c-text-2); font-size: .7rem; font-weight: 400; line-height: 1.6; }
.staff-toolbar { display: flex; align-items: flex-end; flex-wrap: wrap; gap: 12px; margin: 22px 0 18px; }
.staff-toolbar label { display: grid; flex: 1; min-width: 135px; gap: 6px; color: var(--vp-c-text-2); font-size: .7rem; }
.staff-toolbar > span { margin-left: auto; padding-bottom: 10px; color: var(--vp-c-text-3); font-size: .7rem; }
.staff-toolbar .staff-grow { flex: 2; min-width: 190px; }
.staff-grow { flex: 1; min-width: 0; }
.admin-workspace .staff-primary { padding: 10px 15px; border-color: #7b3ff2; background: #7b3ff2; color: white; }
.admin-workspace .staff-primary:hover:not(:disabled) { background: #6830cf; color: white; }
.staff-customers { display: grid; gap: 8px; }
.staff-customers > button { display: flex; align-items: center; gap: 16px; width: 100%; padding: 16px; text-align: left; }
.staff-avatar { display: grid; flex-shrink: 0; width: 40px; height: 40px; place-items: center; border: 1px solid #9a6bf333; border-radius: 12px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); font-size: .8rem; font-weight: 750; }
.staff-customer-name { display: grid; flex: 1; min-width: 0; gap: 3px; }
.staff-customer-name strong { font-size: .83rem; overflow-wrap: anywhere; }
.staff-customer-name small, .staff-customer-status small { color: var(--vp-c-text-2); font-size: .68rem; overflow-wrap: anywhere; }
.staff-customer-status { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 7px; max-width: 200px; }
.staff-license-count { display: grid; min-width: 58px; gap: 3px; text-align: right; font-size: 1.15rem; }
.staff-license-count small { color: var(--vp-c-text-3); font-size: .65rem; }
.staff-badge { display: inline-block; padding: 4px 8px; border: 1px solid var(--vp-c-divider); border-radius: 6px; color: var(--vp-c-text-2); font-size: .65rem; font-weight: 600; line-height: 1.6; text-transform: capitalize; }
.staff-badge[data-status=active] { border-color: var(--vp-c-brand-2); color: var(--vp-c-brand-1); }
.staff-badge:is([data-status=revoked], [data-status=expired]) { border-color: var(--vp-c-danger-2); color: var(--vp-c-danger-1); }
.staff-badge[data-status=suspended] { border-color: var(--vp-c-warning-2); color: var(--vp-c-warning-1); }
.staff-note, .staff-empty, .staff-footer { color: var(--vp-c-text-2); font-size: .76rem; line-height: 1.7; }
.staff-empty { padding: 30px 16px; border: 1px dashed var(--vp-c-divider); border-radius: 10px; text-align: center; }
.staff-message, .staff-loading { padding: 13px 16px; border: 1px solid var(--vp-c-brand-2); border-radius: 10px; background: var(--vp-c-brand-soft); color: var(--vp-c-text-1); font-size: .85rem; line-height: 1.6; overflow-wrap: anywhere; }
.staff-loading { border-color: var(--vp-c-divider); background: var(--vp-c-bg-soft); }
.staff-error { border-color: var(--vp-c-danger-2); background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
.staff-key { display: grid; gap: 12px; padding: 22px; border: 1px solid var(--vp-c-brand-1); border-radius: 15px; background: var(--vp-c-brand-soft); }
.staff-key strong { font-size: .85rem; }
.staff-key p { margin: 5px 0 0; color: var(--vp-c-text-2); font-size: .75rem; }
.staff-key input { font-family: var(--vp-font-family-mono); }
.staff-profile { display: flex; align-items: flex-start; gap: 18px; }
.staff-profile > div:nth-child(2) { flex: 1; min-width: 0; }
.staff-profile p:not(.staff-eyebrow) { margin: 4px 0 12px; color: var(--vp-c-text-2); font: .75rem var(--vp-font-family-mono); overflow-wrap: anywhere; }
.staff-profile-state { display: flex; flex-direction: column; align-items: flex-end; gap: 7px; }
.staff-back { margin-top: 6px; }
.staff-columns { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }
.staff-columns .staff-panel { margin: 0; }
.staff-facts { margin: 18px 0; font-size: .76rem; }
.staff-facts > div { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--vp-c-divider); }
.staff-facts dt { color: var(--vp-c-text-2); }
.staff-facts dd { margin: 0; overflow-wrap: anywhere; }
.staff-facts small { display: block; margin-top: 5px; color: var(--vp-c-text-3); font-size: .68rem; }
.staff-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 14px; }
.admin-workspace .staff-danger { border-color: var(--vp-c-danger-2); background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
.staff-danger-zone { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--vp-c-divider); color: var(--vp-c-danger-1); font-size: .75rem; }
.staff-danger-zone summary { cursor: pointer; }
.staff-danger-zone p { color: var(--vp-c-text-2); line-height: 1.6; }
.staff-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 22px 0; }
.staff-metrics button { display: grid; justify-items: start; gap: 10px; padding: 18px; text-align: left; }
.staff-metrics small { color: var(--vp-c-text-2); font-size: .6rem; letter-spacing: .08em; }
.staff-metrics strong { font-size: 1.65rem; font-weight: 650; }
.staff-results { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 12px; color: var(--vp-c-text-2); font-size: .7rem; }
.staff-table-scroll { width: 100%; overflow-x: auto; border: 1px solid var(--vp-c-divider); border-radius: 10px; }
.staff-table { width: 100%; border-collapse: collapse; text-align: left; font-size: .72rem; white-space: nowrap; }
.staff-table th { padding: 12px; background: var(--vp-c-bg-alt); color: var(--vp-c-text-2); font-size: .64rem; font-weight: 600; }
.staff-table td { padding: 13px 12px; border-top: 1px solid var(--vp-c-divider); background: var(--vp-c-bg); }
.staff-table td:first-child { white-space: normal; min-width: 190px; }
.staff-table strong { display: block; font-size: .78rem; }
.staff-table small { display: block; margin-top: 5px; color: var(--vp-c-text-3); font: .63rem var(--vp-font-family-mono); overflow-wrap: anywhere; }
.staff-table .staff-selected td { background: var(--vp-c-brand-soft); }
.staff-table button { font-size: .68rem; }
.staff-inspector { border-color: var(--vp-c-brand-2); scroll-margin-top: 85px; }
.staff-license-id { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; overflow-wrap: anywhere; font: .75rem var(--vp-font-family-mono); }
.staff-network-facts { display: grid; grid-template-columns: 1fr 1fr; gap: 0 22px; }
.staff-ip-list { display: grid; gap: 8px; }
.staff-ip-list > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); }
.staff-ip-list code { overflow-wrap: anywhere; font: .75rem var(--vp-font-family-mono); }
.staff-audit { display: grid; gap: 8px; }
.staff-audit details { padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 10px; background: var(--vp-c-bg); }
.staff-audit summary { display: flex; justify-content: space-between; gap: 16px; cursor: pointer; }
.staff-audit summary > span { display: grid; gap: 5px; min-width: 0; }
.staff-audit strong { font-size: .8rem; overflow-wrap: anywhere; }
.staff-audit small, .staff-audit time { color: var(--vp-c-text-2); font-size: .68rem; overflow-wrap: anywhere; }
.staff-audit time { flex-shrink: 0; }
.staff-audit pre { max-height: 300px; margin: 16px 0 0; padding: 14px; overflow: auto; border-radius: 8px; background: var(--vp-c-bg-soft); font: .7rem/1.7 var(--vp-font-family-mono); }
.staff-products { display: grid; gap: 10px; }
.staff-products article { display: flex; align-items: center; gap: 14px; padding: 18px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg); }
.staff-products article > div { flex: 1; min-width: 0; }
.staff-products h3 { margin: 0 0 5px; font-size: .9rem; overflow-wrap: anywhere; }
.staff-products code { color: var(--vp-c-text-2); font-size: .7rem; overflow-wrap: anywhere; }
.staff-pagination { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 15px; margin: 24px 0 0; font-size: .75rem; color: var(--vp-c-text-2); }
.staff-footer { margin-top: 30px; text-align: center; font-size: .65rem; }
.staff-sr-only { position: absolute; left: 0; top: 0; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 900px) { .staff-columns { grid-template-columns: 1fr; } .staff-hero { flex-direction: column; } .staff-network-facts { grid-template-columns: 1fr; } }
@media (max-width: 600px) {
  .staff-navigation { gap: 2px; } .staff-navigation button { min-width: 145px; padding: 11px; }
  .staff-customers > button { flex-wrap: wrap; gap: 12px; } .staff-customer-name { flex-basis: calc(100% - 60px); } .staff-customer-status { flex: 1; max-width: none; justify-content: flex-start; margin-left: 52px; }
  .staff-search > div, .staff-inline-form { flex-direction: column; align-items: stretch; } .staff-search input { width: 100%; }
  .staff-profile { flex-wrap: wrap; } .staff-profile-state { flex-basis: 100%; align-items: flex-start; flex-direction: row; flex-wrap: wrap; margin-left: 58px; }
  .staff-metrics { grid-template-columns: 1fr 1fr; } .staff-metrics button { padding: 13px; }
  .staff-audit summary { flex-direction: column; gap: 8px; } .staff-products article { flex-wrap: wrap; } .staff-products article > div { flex-basis: calc(100% - 60px); }
}
@media (prefers-reduced-motion: reduce) { .admin-workspace button { transition: none; } }
</style>
