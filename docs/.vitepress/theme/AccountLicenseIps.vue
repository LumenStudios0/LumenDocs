<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { accountRequest, LicenseApiError } from './licensing-api'
import { visibleServiceError, licenseServiceNotice } from './service-errors'
import { getDiscordSession } from './discord-session'
import { normalizeIpAddress, parseIpAllowlist } from './licensing-utils.mjs'

const addresses = ref<string[]>([])
const newAddress = ref('')
const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const notice = ref('')
const noticeIsError = ref(false)
const editing = ref(false)
const draft = ref('')
let generation = 0
let lastToken = ''
const draftResult = computed(() => {
  try { return { addresses: parseIpAllowlist(draft.value), error: '' } }
  catch (error) { return { addresses: null, error: error instanceof Error ? error.message : 'Invalid allowlist.' } }
})

async function loadAddresses() {
  const requestId = ++generation
  addresses.value = []
  loaded.value = false
  loading.value = true
  editing.value = false
  newAddress.value = ''
  notice.value = ''
  noticeIsError.value = false
  try {
    lastToken = getDiscordSession()
    const result = await accountRequest<{ addresses: string[] }>('/account/license-ips')
    if (requestId !== generation) return
    if (!Array.isArray(result.addresses) || !result.addresses.every(address => typeof address === 'string')) throw new Error('The license service returned an invalid IP allowlist.')
    addresses.value = result.addresses
    loaded.value = true
  } catch (error) {
    console.error('Unable to load license IP addresses:', error)
    const message = await visibleServiceError(error instanceof Error ? error.message : 'Could not load your saved IP addresses.', error instanceof LicenseApiError ? error.status : 0, 'licensing')
    if (requestId === generation) {
      notice.value = message
      noticeIsError.value = message !== licenseServiceNotice
    }
  } finally {
    if (requestId === generation) loading.value = false
  }
}

function handleSession() {
  try {
    if (getDiscordSession() !== lastToken) void loadAddresses()
  } catch (error) {
    console.error('Unable to access the allowlist session:', error)
    void loadAddresses()
  }
}

function addAddress() {
  const address = normalizeIpAddress(newAddress.value)
  noticeIsError.value = true
  if (!address) { notice.value = 'Enter a valid IPv4 or IPv6 address, without a port.'; return }
  if (addresses.value.some(existing => normalizeIpAddress(existing) === address)) {
    notice.value = 'That IP address is already allowed.'
    return
  }
  void saveAddresses([...addresses.value, address])
}

async function saveAddresses(next: string[]) {
  if (!loaded.value || loading.value || saving.value) return
  if (!next.length && !window.confirm('Remove all allowed IPs? Your plugins will no longer be able to validate this license.')) return
  const requestId = generation
  saving.value = true
  notice.value = ''
  noticeIsError.value = false
  try {
    const nextAddresses = parseIpAllowlist(next.join('\n'))
    const result = await accountRequest<{ addresses: string[] }>('/account/license-ips', {
      method: 'PUT', body: JSON.stringify({ addresses: nextAddresses }),
    })
    if (requestId !== generation) return
    if (!Array.isArray(result.addresses) || !result.addresses.every(address => typeof address === 'string')) throw new Error('The license service returned an invalid saved allowlist. Refresh before making another change.')
    addresses.value = result.addresses
    editing.value = false
    newAddress.value = ''
    window.dispatchEvent(new CustomEvent('lumen-license-ips-updated', { detail: { addresses: result.addresses } }))
    notice.value = 'Your server IP allowlist has been saved.'
  } catch (error) {
    console.error('Unable to save license IP addresses:', error)
    const message = await visibleServiceError(error instanceof Error ? error.message : 'Could not save your IP addresses.', error instanceof LicenseApiError ? error.status : 0, 'licensing')
    if (requestId === generation) {
      notice.value = message
      noticeIsError.value = message !== licenseServiceNotice
    }
  } finally {
    saving.value = false
  }
}

function startEditing() {
  draft.value = addresses.value.join('\n')
  editing.value = true
}
onMounted(() => {
  void loadAddresses()
  window.addEventListener('lumen-license-claimed', loadAddresses)
  window.addEventListener('lumen-discord-user', handleSession)
})
onUnmounted(() => {
  generation++
  window.removeEventListener('lumen-license-claimed', loadAddresses)
  window.removeEventListener('lumen-discord-user', handleSession)
})
</script>

<template>
  <section class="license-ip-card" aria-labelledby="license-ip-title" :aria-busy="loading || saving">
    <header><div><p class="ip-eyebrow">NETWORK ACCESS / SHARED LICENSE</p><h2 id="license-ip-title">Allowed server IPs</h2></div><span class="ip-count">{{ loaded ? addresses.length : '—' }} / 3</span></header>
    <p class="ip-note">Use your server's public IP, not its domain or port. IPv4 and IPv6 are supported. These rules apply to every eligible plugin on your shared key.</p>
    <p v-if="loading" class="ip-note" role="status">Loading saved addresses…</p>
    <div v-else-if="loaded && !editing" class="ip-slots">
      <article v-for="slot in 3" :key="slot" :class="{ 'is-unused': !addresses[slot - 1] }">
        <span>{{ String(slot).padStart(2, '0') }}</span>
        <div><strong>{{ addresses[slot - 1] || 'Available slot' }}</strong><small>{{ addresses[slot - 1] ? (addresses[slot - 1].includes(':') ? 'IPv6 · Allowed' : 'IPv4 · Allowed') : 'Add a public server IP' }}</small></div>
        <button v-if="addresses[slot - 1]" type="button" :disabled="saving" :aria-label="`Remove ${addresses[slot - 1]}`" @click="saveAddresses(addresses.filter((_, index) => index !== slot - 1))">Remove</button>
      </article>
    </div>
    <form v-if="loaded && !editing && addresses.length < 3" class="ip-add" @submit.prevent="addAddress">
      <label for="license-ip-input">New public IP address</label>
      <div><input id="license-ip-input" v-model="newAddress" maxlength="45" autocomplete="off" placeholder="203.0.113.10 or 2001:db8::1" :disabled="saving"><button type="submit" :disabled="saving || !newAddress.trim()">{{ saving ? 'Saving…' : 'Allow IP address' }}</button></div>
    </form>
    <form v-if="editing" class="ip-bulk" @submit.prevent="draftResult.addresses && saveAddresses(draftResult.addresses)">
      <label for="license-ip-bulk">Replace the complete allowlist</label>
      <textarea id="license-ip-bulk" v-model="draft" rows="4" :disabled="saving" placeholder="One IP per line, or separated by commas" aria-describedby="ip-bulk-preview" />
      <p id="ip-bulk-preview" :class="{ 'ip-error': draftResult.error }">{{ draftResult.error || `${draftResult.addresses?.length} / 3 valid addresses. Saving replaces all existing entries.` }}</p>
      <div class="ip-actions"><button type="submit" :disabled="saving || !!draftResult.error">{{ saving ? 'Saving…' : 'Save complete allowlist' }}</button><button type="button" :disabled="saving" @click="editing = false">Cancel</button></div>
    </form>
    <div class="ip-actions">
      <button v-if="loaded && !editing" type="button" :disabled="saving" @click="startEditing">Bulk edit allowlist</button>
      <button v-if="!editing" type="button" :disabled="loading || saving" @click="loadAddresses">Reload saved IPs</button>
    </div>
    <p v-if="notice" class="ip-notice" :class="{ 'ip-error': noticeIsError }" :role="noticeIsError ? 'alert' : 'status'">{{ notice }}</p>
    <p v-if="loaded && !addresses.length" class="ip-warning">No IPs are allowed. Your key cannot validate until you add an address.</p>
  </section>
</template>

<style scoped>
.license-ip-card { margin: 24px 0; padding: clamp(18px, 3vw, 28px); border: 1px solid var(--vp-c-divider); border-radius: 20px; background: var(--vp-c-bg-soft); }
.license-ip-card header { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.ip-eyebrow { margin: 0 0 8px; color: var(--vp-c-brand-1); font-size: .6rem; font-weight: 750; letter-spacing: .1em; }
.license-ip-card h2 { margin: 0; padding: 0; border: 0; font-size: 1.35rem; letter-spacing: -.03em; }
.ip-count { padding: 6px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); white-space: nowrap; }
.ip-note, .ip-bulk p { color: var(--vp-c-text-2); font-size: .8rem; line-height: 1.7; }
.ip-slots { display: grid; gap: 8px; margin: 20px 0; }
.ip-slots article { display: flex; align-items: center; gap: 14px; padding: 15px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg); }
.ip-slots .is-unused { border-style: dashed; background: transparent; }
.ip-slots article > span { color: var(--vp-c-brand-1); font: .75rem var(--vp-font-family-mono); }
.ip-slots article > div { display: grid; flex: 1; min-width: 0; gap: 2px; }
.ip-slots strong { overflow-wrap: anywhere; font: .85rem var(--vp-font-family-mono); }
.ip-slots small { color: var(--vp-c-text-2); font-size: .7rem; }
.license-ip-card button { padding: 8px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); cursor: pointer; font-size: .73rem; }
.license-ip-card button:disabled { opacity: .5; cursor: not-allowed; }
.ip-add label, .ip-bulk label { display: block; margin: 10px 0 7px; font-size: .8rem; font-weight: 650; }
.ip-add > div, .ip-actions { display: flex; gap: 8px; }
.ip-actions { margin-top: 16px; flex-wrap: wrap; }
.license-ip-card :is(input, textarea) { width: 100%; min-width: 0; padding: 10px 12px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: .8rem var(--vp-font-family-mono); }
.ip-add input { flex: 1; }
.ip-add button, .ip-bulk button[type=submit] { background: #7b3ff2; color: white; }
.ip-add button { flex-shrink: 0; }
.license-ip-card textarea { resize: vertical; }
.ip-warning, .ip-notice { padding: 12px; border: 1px solid var(--vp-c-divider); border-radius: 9px; color: var(--vp-c-text-2); font-size: .8rem; }
.ip-warning { border-color: var(--vp-c-warning-2); color: var(--vp-c-warning-1); }
.license-ip-card .ip-error { color: var(--vp-c-danger-1); }
.license-ip-card :is(button, input, textarea):focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
@media (max-width: 480px) { .ip-add > div { flex-direction: column; } .ip-slots article { flex-wrap: wrap; } .ip-slots button { margin-left: 30px; } }
</style>
