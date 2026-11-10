<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'

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

interface AdminProduct {
  productId: string
  name: string
  active: boolean
}

interface AuditEntry {
  auditId: string
  actor: string
  action: string
  entityType: string
  entityId: string
  createdAt: string
  details: Record<string, unknown>
}

interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

const endpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT as string | undefined
const query = ref('')
const customers = ref<Array<{
  discordId: string
  username: string | null
  globalName: string | null
  banned: boolean
  onHold: boolean
  verificationStatus: string
  licenseCount: number
}>>([])
const customerPage = ref(1)
const customerPageSize = 100
const customerTotal = ref(0)
const user = ref<AdminUser | null>(null)
const products = ref<AdminProduct[]>([])
const auditEntries = ref<AuditEntry[]>([])
const selectedLicense = ref<AdminLicense | null>(null)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const notice = ref('')
const reason = ref('')
const ipAddress = ref('')
const grantProductId = ref('')
const grantExpiresAt = ref('')
const licenseKey = ref('')
const maxCustomerPage = computed(() => Math.max(1, Math.ceil(customerTotal.value / customerPageSize)))

const workerBase = computed(() => {
  if (!endpoint) return ''
  const url = new URL(endpoint, window.location.origin)
  url.pathname = url.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '')
  url.search = ''
  return url.toString()
})

async function adminRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getDiscordSession()
  if (!token || !workerBase.value) throw new Error('Sign in with an authorized Discord account to use the admin dashboard.')
  const response = await fetch(`${workerBase.value}/admin${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })
  const result = await response.json() as T & { detail?: string; error?: string }
  if (!response.ok) throw new Error(result.detail ?? result.error ?? `Admin request failed (${response.status}).`)
  return result
}

function clearMessages() {
  error.value = ''
  notice.value = ''
}

async function loadAudit(discordId: string) {
  const page = await adminRequest<Page<AuditEntry>>(`/audit?customerDiscordId=${encodeURIComponent(discordId)}&pageSize=20`)
  auditEntries.value = page.items
}

async function loadCustomers(pageNumber = 1) {
  clearMessages()
  if (query.value.trim() && query.value.trim().length < 2) {
    error.value = 'Enter at least two characters to search Discord usernames.'
    return
  }
  loading.value = true
  try {
    const search = query.value.trim()
    const params = new URLSearchParams({ page: String(pageNumber), pageSize: String(customerPageSize) })
    if (search) params.set('query', search)
    const result = await adminRequest<Page<typeof customers.value[number]>>(`/users?${params}`)
    customers.value = result.items
    customerPage.value = result.page
    customerTotal.value = result.total
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load customer accounts.'
  } finally {
    loading.value = false
  }
}

async function lookupUser(discordId: string) {
  clearMessages()
  loading.value = true
  selectedLicense.value = null
  try {
    const [profile, productsPage] = await Promise.all([
      adminRequest<AdminUser>(`/users/${encodeURIComponent(discordId)}`),
      adminRequest<Page<AdminProduct>>('/products?pageSize=100'),
    ])
    user.value = profile
    products.value = productsPage.items
    if (!grantProductId.value) grantProductId.value = productsPage.items.find(product => product.active)?.productId ?? ''
    await loadAudit(discordId)
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'Unable to load this account.'
  } finally {
    loading.value = false
  }
}

async function perform(path: string, payload?: Record<string, unknown>, success = 'Change saved.') {
  if (!user.value) return
  const discordId = user.value.discordId
  clearMessages()
  submitting.value = true
  try {
    await adminRequest(path, {
      method: 'POST',
      ...(payload ? { body: JSON.stringify(payload) } : {}),
    })
    await lookupUser(discordId)
    notice.value = success
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'The action could not be completed.'
  } finally {
    submitting.value = false
  }
}

function confirmAction(
  message: string,
  path: string,
  payload: Record<string, unknown> | undefined,
  success: string,
) {
  if (window.confirm(message)) void perform(path, payload, success)
}

async function grantLicense() {
  if (!user.value || !grantProductId.value) return
  const discordId = user.value.discordId
  clearMessages()
  submitting.value = true
  try {
    const result = await adminRequest<{ licenseKey: string }>('/licenses', {
      method: 'POST',
      body: JSON.stringify({
        productId: grantProductId.value,
        customerDiscordId: discordId,
        ...(grantExpiresAt.value ? { expiresAt: new Date(grantExpiresAt.value).toISOString() } : {}),
      }),
    })
    licenseKey.value = result.licenseKey
    grantExpiresAt.value = ''
    await lookupUser(discordId)
    notice.value = 'License created. Copy its key now; it will not be shown again.'
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'License could not be created.'
  } finally {
    submitting.value = false
  }
}

async function addIp() {
  if (!selectedLicense.value || !ipAddress.value.trim()) return
  clearMessages()
  submitting.value = true
  try {
    const licenseId = selectedLicense.value.licenseId
    const discordId = user.value?.discordId
    await adminRequest(`/licenses/${licenseId}/ips`, {
      method: 'POST',
      body: JSON.stringify({ ipAddress: ipAddress.value.trim() }),
    })
    ipAddress.value = ''
    if (discordId) await lookupUser(discordId)
    if (user.value) selectedLicense.value = user.value.licenses.find(item => item.licenseId === licenseId) ?? null
    notice.value = 'IP address added.'
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'IP address could not be added.'
  } finally {
    submitting.value = false
  }
}

async function removeIp(address: string) {
  if (!selectedLicense.value) return
  clearMessages()
  submitting.value = true
  try {
    await adminRequest(`/licenses/${selectedLicense.value.licenseId}/ips?ipAddress=${encodeURIComponent(address)}`, {
      method: 'DELETE',
    })
    const licenseId = selectedLicense.value.licenseId
    const discordId = user.value?.discordId
    if (discordId) await lookupUser(discordId)
    if (user.value) selectedLicense.value = user.value.licenses.find(item => item.licenseId === licenseId) ?? null
    notice.value = 'IP address removed.'
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'IP address could not be removed.'
  } finally {
    submitting.value = false
  }
}

async function deleteCustomerAccount() {
  if (!user.value) return
  const discordId = user.value.discordId
  const customerName = user.value.globalName || user.value.username || discordId
  if (!window.confirm(`Permanently delete ${customerName}'s account? Active licenses will be revoked and bound IP/server details erased.`)) return
  clearMessages()
  submitting.value = true
  try {
    await adminRequest(`/users/${encodeURIComponent(discordId)}`, { method: 'DELETE' })
    user.value = null
    selectedLicense.value = null
    licenseKey.value = ''
    await loadCustomers(customerPage.value)
    notice.value = 'Customer account deleted; active licenses revoked and profile details erased.'
  } catch (requestError) {
    error.value = requestError instanceof Error ? requestError.message : 'The customer account could not be deleted.'
  } finally {
    submitting.value = false
  }
}

async function copyLicenseKey() {
  try {
    await navigator.clipboard.writeText(licenseKey.value)
    notice.value = 'License key copied.'
  } catch (copyError) {
    error.value = copyError instanceof Error ? 'Clipboard access was denied. Select and copy the key manually.' : 'Could not copy the license key.'
  }
}

function formatDate(value: string | null) {
  if (!value) return 'Never'
  return new Date(value).toLocaleString()
}

onMounted(() => void loadCustomers())
</script>

<template>
  <main class="admin-dashboard">
    <header class="admin-hero">
      <div class="admin-orb" aria-hidden="true"></div>
      <p class="admin-eyebrow">LUMEN STUDIOS · STAFF ONLY</p>
      <h1>Admin dashboard</h1>
      <p>Manage customer accounts, licenses, and access from one place.</p>
    </header>

    <form class="admin-search" @submit.prevent="loadCustomers(1)">
      <label for="admin-customer-search">Find a customer</label>
      <div class="admin-search-row">
        <input id="admin-customer-search" v-model="query" maxlength="32" autocomplete="off" placeholder="Search Discord username">
        <button type="submit" :disabled="loading">{{ loading ? 'Searching…' : 'Search users' }}</button>
      </div>
      <small>{{ customerTotal }} active customer accounts. Usernames sync when customers visit Account Settings.</small>
    </form>

    <p v-if="error" class="admin-message is-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="admin-message is-success" role="status">{{ notice }}</p>
    <div v-if="licenseKey" class="admin-key">
      <strong>New license key — copy it now</strong>
      <code>{{ licenseKey }}</code>
      <button type="button" @click="copyLicenseKey">Copy key</button>
    </div>

    <section v-if="!user" class="admin-card admin-customer-directory">
      <div class="admin-card-heading">
        <div><p class="admin-eyebrow">CUSTOMER DIRECTORY</p><h2>Active accounts</h2></div>
        <span>{{ customerTotal }} total</span>
      </div>
      <p v-if="!loading && !customers.length" class="admin-empty">No active customer accounts matched this search.</p>
      <div v-else class="admin-customer-list">
        <button
          v-for="customer in customers"
          :key="customer.discordId"
          type="button"
          class="admin-customer-row"
          :disabled="loading"
          @click="lookupUser(customer.discordId)"
        >
          <span class="admin-customer-name">
            <strong>{{ customer.globalName || (customer.username ? `@${customer.username}` : 'Discord name not synced') }}</strong>
            <small>{{ customer.username ? `@${customer.username} · ` : '' }}{{ customer.discordId }}</small>
          </span>
          <span class="admin-customer-state">
            <small>{{ customer.licenseCount }} license{{ customer.licenseCount === 1 ? '' : 's' }}</small>
            <b v-if="customer.banned" class="status-revoked">Banned</b>
            <b v-else-if="customer.onHold" class="status-suspended">On hold</b>
          </span>
        </button>
      </div>
      <div v-if="maxCustomerPage > 1" class="admin-pagination">
        <button type="button" :disabled="loading || customerPage <= 1" @click="loadCustomers(customerPage - 1)">Previous</button>
        <span>Page {{ customerPage }} of {{ maxCustomerPage }}</span>
        <button type="button" :disabled="loading || customerPage >= maxCustomerPage" @click="loadCustomers(customerPage + 1)">Next</button>
      </div>
    </section>

    <section v-if="user" class="admin-content" aria-live="polite">
      <div class="admin-profile-card">
        <div>
          <p class="admin-eyebrow">CUSTOMER PROFILE</p>
          <h2>{{ user.discordId }}</h2>
          <p>{{ user.licenseCount }} license{{ user.licenseCount === 1 ? '' : 's' }} · Verification: <strong>{{ user.verificationStatus.replaceAll('_', ' ') }}</strong></p>
        </div>
        <div class="admin-badges">
          <span :class="{ 'is-danger': user.banned }">{{ user.banned ? 'Banned' : 'Not banned' }}</span>
          <span :class="{ 'is-warning': user.onHold }">{{ user.onHold ? 'On hold' : 'No hold' }}</span>
        </div>
      </div>

      <div class="admin-grid">
        <section class="admin-card">
          <div class="admin-card-heading"><div><p class="admin-eyebrow">ACCOUNT CONTROLS</p><h2>Access & safety</h2></div></div>
          <label class="admin-field">Reason <input v-model="reason" maxlength="500" placeholder="Optional reason for audit history"></label>
          <div class="admin-actions">
            <button type="button" :class="{ 'is-danger-button': !user.banned }" :disabled="submitting" @click="user.banned ? perform(`/users/${user.discordId}/unban`, undefined, 'Account unbanned.') : confirmAction('Ban this customer account? Future license validation will be blocked.', `/users/${user.discordId}/ban`, { reason: reason || undefined }, 'Account banned.')">{{ user.banned ? 'Remove ban' : 'Ban account' }}</button>
            <button type="button" :disabled="submitting" @click="perform(`/users/${user.discordId}/${user.onHold ? 'release' : 'hold'}`, user.onHold ? undefined : { reason: reason || undefined }, user.onHold ? 'Account hold released.' : 'Account placed on hold.')">{{ user.onHold ? 'Release hold' : 'Place on hold' }}</button>
            <button type="button" :disabled="submitting" @click="perform(`/users/${user.discordId}/verification-request`, { reason: reason || undefined }, 'Verification request recorded.')">Request verification</button>
            <button type="button" :disabled="submitting || user.verificationStatus === 'verified'" @click="perform(`/users/${user.discordId}/verify`, undefined, 'Account marked as verified.')">Mark verified</button>
          </div>
          <p class="admin-note">Bans and holds prevent license validation. These actions do not delete customer or license records.</p>
          <button type="button" class="is-danger-button" :disabled="submitting" @click="deleteCustomerAccount">Delete customer account</button>
        </section>

        <section class="admin-card">
          <p class="admin-eyebrow">GRANT ACCESS</p>
          <h2>New license</h2>
          <label class="admin-field">Product
            <select v-model="grantProductId">
              <option disabled value="">Select a product</option>
              <option v-for="product in products.filter(item => item.active)" :key="product.productId" :value="product.productId">{{ product.name }}</option>
            </select>
          </label>
          <label class="admin-field">Expires at <small>Leave blank for lifetime</small><input v-model="grantExpiresAt" type="datetime-local"></label>
          <button type="button" :disabled="submitting || !grantProductId" @click="grantLicense">Create license</button>
        </section>
      </div>

      <section class="admin-card">
        <div class="admin-card-heading"><div><p class="admin-eyebrow">ENTITLEMENTS</p><h2>Licenses</h2></div><span>{{ user.licenses.length }} shown</span></div>
        <p v-if="!user.licenses.length" class="admin-empty">No licenses are linked to this Discord account yet.</p>
        <div v-else class="admin-license-list">
          <article v-for="license in user.licenses" :key="license.licenseId" class="admin-license" :class="{ 'is-selected': selectedLicense?.licenseId === license.licenseId }">
            <button class="admin-license-select" type="button" @click="selectedLicense = selectedLicense?.licenseId === license.licenseId ? null : license">
              <span><strong>{{ license.productId }}</strong><small>{{ license.licenseId }}</small></span>
              <span class="admin-license-meta"><b :class="`status-${license.status}`">{{ license.status }}</b><small>{{ license.expiresAt ? `Expires ${formatDate(license.expiresAt)}` : 'Lifetime' }}</small></span>
            </button>
            <div class="admin-actions admin-license-actions">
              <button v-if="license.status === 'active'" type="button" :disabled="submitting" @click="perform(`/licenses/${license.licenseId}/suspend`, { reason: reason || undefined }, 'License suspended.')">Timeout</button>
              <button v-if="license.status === 'suspended'" type="button" :disabled="submitting" @click="perform(`/licenses/${license.licenseId}/activate`, undefined, 'License reactivated.')">Reactivate</button>
              <button v-if="license.status !== 'revoked'" type="button" class="is-danger-button" :disabled="submitting" @click="confirmAction('Revoke this license? This action cannot be undone.', `/licenses/${license.licenseId}/revoke`, { reason: reason || undefined }, 'License revoked.')">Revoke</button>
            </div>
          </article>
        </div>
      </section>

      <section v-if="selectedLicense" class="admin-card">
        <div class="admin-card-heading"><div><p class="admin-eyebrow">LICENSE NETWORK</p><h2>Allowed IP addresses</h2></div><span>{{ selectedLicense.allowedIps.length }} / 3</span></div>
        <p class="admin-note">Bound server: {{ selectedLicense.serverId || 'Not bound' }} · Last validated server: {{ selectedLicense.lastValidatedServerId || 'Not reported' }} · Last validated: {{ formatDate(selectedLicense.lastValidatedAt) }}</p>
        <div v-if="selectedLicense.allowedIps.length" class="admin-ip-list">
          <div v-for="address in selectedLicense.allowedIps" :key="address"><code>{{ address }}</code><button type="button" :disabled="submitting" @click="removeIp(address)">Remove</button></div>
        </div>
        <p v-else class="admin-empty">No IP addresses are registered for this license.</p>
        <form v-if="selectedLicense.allowedIps.length < 3" class="admin-ip-form" @submit.prevent="addIp">
          <input v-model="ipAddress" maxlength="45" placeholder="IPv4 or IPv6 address">
          <button type="submit" :disabled="submitting || !ipAddress.trim()">Add IP</button>
        </form>
      </section>

      <section class="admin-card">
        <div class="admin-card-heading"><div><p class="admin-eyebrow">ACCOUNT HISTORY</p><h2>Recent audit events</h2></div></div>
        <div v-if="auditEntries.length" class="admin-audit-list">
          <article v-for="entry in auditEntries" :key="entry.auditId">
            <span><strong>{{ entry.action.replaceAll('.', ' ') }}</strong><small>{{ entry.actor }} · {{ entry.entityType }}</small></span>
            <time :datetime="entry.createdAt">{{ formatDate(entry.createdAt) }}</time>
          </article>
        </div>
        <p v-else class="admin-empty">No audit events have been recorded for this account.</p>
      </section>
    </section>
  </main>
</template>

<style scoped>
.admin-dashboard{max-width:1080px;margin:0 auto;padding:32px 24px 80px;color:var(--vp-c-text-1)}
.admin-hero{position:relative;overflow:hidden;padding:44px 40px;border:1px solid rgba(123,63,242,.24);border-radius:26px;background:radial-gradient(ellipse at 90% 15%,rgba(123,63,242,.22),transparent 38%),linear-gradient(135deg,#171020,#100c17);box-shadow:0 24px 80px #08050d55}
.admin-hero h1{position:relative;margin:8px 0;font-size:clamp(2rem,5vw,3rem);letter-spacing:-.04em}
.admin-hero>p:last-child{position:relative;margin:0;color:var(--vp-c-text-2)}
.admin-eyebrow{margin:0;color:#b89aff;font-size:.7rem;font-weight:800;letter-spacing:.16em}
.admin-orb{position:absolute;right:9%;top:-90px;width:240px;height:240px;border-radius:50%;background:#7b3ff2;filter:blur(110px);opacity:.28;pointer-events:none}
.admin-search,.admin-card,.admin-profile-card{margin-top:20px;padding:24px;border:1px solid var(--vp-c-divider);border-radius:20px;background:var(--vp-c-bg-soft)}
.admin-search label,.admin-field{display:grid;gap:8px;font-size:.86rem;font-weight:700}
.admin-search-row{display:flex;gap:10px;margin-top:8px}
.admin-search input,.admin-field input,.admin-field select,.admin-ip-form input{min-width:0;padding:12px 14px;border:1px solid var(--vp-c-divider);border-radius:12px;background:var(--vp-c-bg);color:var(--vp-c-text-1);font:inherit}
.admin-search-row input{flex:1}
.admin-search small,.admin-field small{color:var(--vp-c-text-2);font-weight:400}
.admin-dashboard button{padding:10px 14px;border:1px solid rgba(123,63,242,.42);border-radius:11px;background:rgba(123,63,242,.13);color:var(--vp-c-text-1);font:inherit;font-size:.83rem;font-weight:700;cursor:pointer;transition:transform .18s ease,background .18s ease}
.admin-dashboard button:hover:not(:disabled){transform:translateY(-1px);background:rgba(123,63,242,.25)}
.admin-dashboard button:disabled{cursor:not-allowed;opacity:.5}
.admin-search-row button,.admin-card>button,.admin-ip-form button{background:#7b3ff2;color:white}
.admin-search>small{display:block;margin-top:9px}
.admin-message{padding:13px 16px;border-radius:12px}
.is-error{border:1px solid #f87171;background:#ef44441a;color:#fecaca}
.is-success{border:1px solid #34d399;background:#10b9811a;color:#a7f3d0}
.admin-key{display:grid;gap:10px;margin-top:16px;padding:18px;border:1px solid #a78bfa;border-radius:16px;background:#7b3ff21a}
.admin-key code{overflow-wrap:anywhere;padding:12px;border-radius:9px;background:#09070d}
.admin-key button{justify-self:start}
.admin-profile-card{display:flex;align-items:center;justify-content:space-between;gap:20px}
.admin-profile-card h2,.admin-card h2{margin:5px 0 8px;font-size:1.3rem}
.admin-profile-card p:last-child{margin:0;color:var(--vp-c-text-2)}
.admin-badges{display:flex;flex-wrap:wrap;gap:8px}
.admin-badges span{padding:7px 10px;border:1px solid var(--vp-c-divider);border-radius:999px;font-size:.76rem}
.admin-badges .is-danger{border-color:#f87171;color:#fca5a5}
.admin-badges .is-warning{border-color:#fbbf24;color:#fcd34d}
.admin-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:18px}
.admin-grid .admin-card{margin-top:18px}
.admin-card-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}
.admin-card-heading>span{color:var(--vp-c-text-2);font-size:.8rem}
.admin-customer-list{display:grid;gap:8px}
.admin-customer-row{display:flex;width:100%;align-items:center;justify-content:space-between;gap:14px;padding:13px 15px!important;border-color:var(--vp-c-divider)!important;background:var(--vp-c-bg)!important;text-align:left}
.admin-customer-name,.admin-customer-state{display:grid;gap:5px}
.admin-customer-name small,.admin-customer-state small{color:var(--vp-c-text-2);font-size:.74rem;overflow-wrap:anywhere}
.admin-customer-state{text-align:right}
.admin-pagination{display:flex;align-items:center;justify-content:center;gap:14px;margin-top:16px}
.admin-pagination span{color:var(--vp-c-text-2);font-size:.8rem}
.admin-field{margin:14px 0}
.admin-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}
.admin-dashboard .is-danger-button{border-color:#ef444477;background:#ef44441a;color:#fca5a5}
.admin-note,.admin-empty{color:var(--vp-c-text-2);font-size:.83rem;line-height:1.6}
.admin-license-list{display:grid;gap:10px}
.admin-license{padding:14px;border:1px solid var(--vp-c-divider);border-radius:14px}
.admin-license.is-selected{border-color:#7b3ff2;box-shadow:0 0 0 1px #7b3ff255}
.admin-license-select{display:flex;width:100%;justify-content:space-between;gap:14px;padding:0!important;border:0!important;background:transparent!important;text-align:left}
.admin-license-select span,.admin-license-meta{display:grid;gap:5px}
.admin-license small,.admin-audit-list small{color:var(--vp-c-text-2);font-size:.75rem;overflow-wrap:anywhere}
.admin-license-meta{text-align:right}
.admin-license-meta b{font-size:.8rem;text-transform:capitalize}
.status-active{color:#34d399}.status-suspended{color:#fbbf24}.status-revoked,.status-expired{color:#f87171}
.admin-license-actions{margin-top:12px}
.admin-ip-list{display:grid;gap:8px;margin:15px 0}
.admin-ip-list>div,.admin-audit-list article{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid var(--vp-c-divider);border-radius:12px}
.admin-ip-list code{overflow-wrap:anywhere}
.admin-ip-list button{padding:7px 10px}
.admin-ip-form{display:flex;gap:9px;margin-top:14px}
.admin-ip-form input{flex:1}
.admin-audit-list{display:grid;gap:8px}
.admin-audit-list article>span{display:grid;gap:4px}
.admin-audit-list time{color:var(--vp-c-text-2);font-size:.75rem;text-align:right}
@media(max-width:700px){.admin-dashboard{padding:20px 16px 56px}.admin-hero{padding:30px 24px;border-radius:20px}.admin-search,.admin-card,.admin-profile-card{padding:18px}.admin-grid{grid-template-columns:1fr}.admin-profile-card{align-items:flex-start;flex-direction:column}.admin-search-row,.admin-ip-form{flex-direction:column}.admin-search-row button,.admin-ip-form button{width:100%}.admin-audit-list article{align-items:flex-start;flex-direction:column}.admin-audit-list time{text-align:left}.admin-customer-row{align-items:flex-start;flex-direction:column}.admin-customer-state{text-align:left}}
@media(prefers-reduced-motion:reduce){.admin-dashboard button{transition:none}}
</style>
