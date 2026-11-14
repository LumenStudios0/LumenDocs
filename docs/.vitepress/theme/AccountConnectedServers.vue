<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { accountRequest, LicenseApiError } from './licensing-api'
import { visibleServiceError, licenseServiceNotice } from './service-errors'
import { getDiscordSession } from './discord-session'

interface ConnectedServer { id: string; name: string; address?: string; status?: string }
const servers = ref<ConnectedServer[]>([])
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const notice = ref('')
const search = ref('')
const status = ref('')
const updatedAt = ref('')
let generation = 0
let lastToken = ''
const statuses = computed(() => [...new Set(servers.value.map(server => server.status || 'Not reported'))].sort())
const visibleServers = computed(() => servers.value.filter(server =>
  (!status.value || (server.status || 'Not reported') === status.value) &&
  `${server.name} ${server.address ?? ''} ${server.id}`.toLowerCase().includes(search.value.trim().toLowerCase()),
).sort((a, b) => a.name.localeCompare(b.name)))

async function refresh() {
  const requestId = ++generation
  loading.value = true
  loaded.value = false
  error.value = ''
  servers.value = []
  updatedAt.value = ''
  try {
    lastToken = getDiscordSession()
    const result = await accountRequest<{ servers: ConnectedServer[] }>('/account/servers')
    if (requestId !== generation) return
    if (!Array.isArray(result.servers) || !result.servers.every(server => server && typeof server.id === 'string' && typeof server.name === 'string')) {
      throw new Error('The licensing service returned an invalid server list.')
    }
    servers.value = result.servers
    loaded.value = true
    updatedAt.value = new Date().toLocaleTimeString()
  } catch (requestError) {
    console.error('Unable to load connected license servers:', requestError)
    const message = await visibleServiceError(requestError instanceof Error ? requestError.message : 'Could not load connected servers.', requestError instanceof LicenseApiError ? requestError.status : 0, 'licensing')
    if (requestId === generation) error.value = message
  } finally {
    if (requestId === generation) loading.value = false
  }
}
function handleSession() {
  try {
    if (getDiscordSession() !== lastToken) {
      search.value = ''
      status.value = ''
      notice.value = ''
      void refresh()
    }
  } catch (requestError) {
    console.error('Unable to access the server account session:', requestError)
    void refresh()
  }
}
async function copyServer(server: ConnectedServer) {
  try {
    await navigator.clipboard.writeText(`Server: ${server.name}\nID: ${server.id}\nAddress: ${server.address || 'Not reported'}\nReported status: ${server.status || 'Not reported'}`)
    notice.value = 'Server details copied. No license key is included.'
  } catch (copyError) {
    console.error('Unable to copy server details:', copyError)
    notice.value = 'Clipboard access was denied. Select and copy the server details manually.'
  }
}
onMounted(() => {
  void refresh()
  window.addEventListener('lumen-discord-user', handleSession)
})
onUnmounted(() => {
  generation++
  window.removeEventListener('lumen-discord-user', handleSession)
})
</script>

<template>
  <section class="server-workspace" aria-labelledby="connected-servers-title" :aria-busy="loading">
    <header><div><p class="server-eyebrow">INSTALLATIONS / REPORTED ACTIVITY</p><h2 id="connected-servers-title">Your connected servers</h2></div><button type="button" :disabled="loading" @click="refresh">{{ loading ? 'Refreshing…' : 'Refresh servers' }}</button></header>
    <p class="server-note">Installations returned by your license service, not a live uptime check. An allowed IP alone does not mean a server has connected.</p>
    <div v-if="loaded && servers.length" class="server-toolbar">
      <label>Find an installation<input v-model="search" type="search" placeholder="Name, ID, or address"></label>
      <label>Reported status<select v-model="status"><option value="">All statuses</option><option v-for="value in statuses" :key="value">{{ value }}</option></select></label>
      <span>{{ visibleServers.length }} / {{ servers.length }}</span>
    </div>
    <p v-if="loading" class="server-empty" role="status">Loading your installations…</p>
    <p v-else-if="error" :class="error === licenseServiceNotice ? 'server-empty' : 'server-error'" :role="error === licenseServiceNotice ? 'status' : 'alert'">{{ error }}</p>
    <div v-else-if="visibleServers.length" class="server-list">
      <article v-for="server in visibleServers" :key="server.id">
        <span class="server-mark" aria-hidden="true">▤</span>
        <div><strong>{{ server.name }}</strong><code>{{ server.address || 'Address not reported' }}</code><small>ID: {{ server.id }}</small></div>
        <span class="server-status">{{ server.status || 'Status not reported' }}</span>
        <button type="button" :aria-label="`Copy details for ${server.name}`" @click="copyServer(server)">Copy details</button>
      </article>
    </div>
    <p v-else-if="loaded" class="server-empty">{{ servers.length ? 'No installations match these filters.' : 'No installations reported yet. Configure a plugin with your shared key and allow its public IP to get started.' }}</p>
    <p v-if="updatedAt" class="server-note">Last checked {{ updatedAt }}</p>
    <p v-if="notice" class="server-note" role="status">{{ notice }}</p>
  </section>
</template>

<style scoped>
.server-workspace { margin: 24px 0; padding: clamp(18px, 3vw, 28px); border: 1px solid var(--vp-c-divider); border-radius: 20px; background: var(--vp-c-bg-soft); }
.server-workspace header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.server-eyebrow { margin: 0 0 7px; color: var(--vp-c-brand-1); font-size: .6rem; font-weight: 750; letter-spacing: .1em; }
.server-workspace h2 { margin: 0; padding: 0; border: 0; font-size: 1.35rem; letter-spacing: -.03em; }
.server-note, .server-empty { color: var(--vp-c-text-2); font-size: .8rem; line-height: 1.7; }
.server-toolbar { display: flex; align-items: flex-end; gap: 12px; margin: 20px 0; }
.server-toolbar label { display: grid; flex: 1; gap: 6px; color: var(--vp-c-text-2); font-size: .7rem; }
.server-toolbar span { padding-bottom: 10px; white-space: nowrap; color: var(--vp-c-text-3); font-size: .7rem; }
.server-workspace :is(input, select) { width: 100%; min-width: 0; padding: 9px 10px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; }
.server-workspace button { flex-shrink: 0; padding: 8px 11px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); cursor: pointer; font-size: .73rem; }
.server-workspace button:disabled { opacity: .5; cursor: wait; }
.server-workspace :is(button, input, select):focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
.server-list { display: grid; gap: 10px; }
.server-list article { display: flex; align-items: center; gap: 14px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg); }
.server-mark { display: grid; width: 38px; height: 38px; flex-shrink: 0; place-items: center; border: 1px solid #9a6bf344; border-radius: 10px; color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft); }
.server-list article > div { display: grid; flex: 1; min-width: 0; gap: 3px; }
.server-list strong { font-size: .85rem; overflow-wrap: anywhere; }
.server-list code, .server-list small { font-size: .7rem; color: var(--vp-c-text-2); overflow-wrap: anywhere; }
.server-status { max-width: 140px; padding: 4px 8px; border: 1px solid var(--vp-c-divider); border-radius: 6px; color: var(--vp-c-text-2); font-size: .67rem; overflow-wrap: anywhere; }
.server-error { padding: 12px; border: 1px solid var(--vp-c-danger-2); border-radius: 10px; color: var(--vp-c-danger-1); font-size: .85rem; }
@media (max-width: 640px) { .server-workspace header { align-items: flex-start; flex-direction: column; } .server-toolbar { flex-wrap: wrap; } .server-toolbar label { flex-basis: 100%; } .server-list article { flex-wrap: wrap; } .server-list article > div { flex-basis: calc(100% - 60px); } .server-status { margin-left: 52px; } }
</style>
