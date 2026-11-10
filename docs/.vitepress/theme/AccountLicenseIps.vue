<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'

const addresses = ref<string[]>([])
const newAddress = ref('')
const notice = ref('')
const noticeIsError = ref(false)
const loading = ref(true)
const saving = ref(false)

function endpointFor(path: string) {
  const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + path
  endpoint.search = ''
  return endpoint.toString()
}

function errorText(result: { error?: string; detail?: string }) {
  return result.error ?? result.detail ?? 'The license service could not complete this request.'
}

function isIpAddress(value: string) {
  if (value.includes(':')) {
    try {
      return new URL(`http://[${value}]/`).hostname.startsWith('[')
    } catch {
      return false
    }
  }

  const octets = value.split('.')
  return octets.length === 4 && octets.every(octet =>
    /^\d{1,3}$/.test(octet) && Number(octet) >= 0 && Number(octet) <= 255,
  )
}

onMounted(async () => {
  let token = ''
  try {
    token = getDiscordSession()
  } catch (error) {
    console.error('Unable to access the Discord sign-in session:', error)
    notice.value = 'This browser could not access your sign-in session.'
    noticeIsError.value = true
  }
  const endpoint = endpointFor('/account/license-ips')
  if (!token) {
    notice.value = 'Sign in with Discord to manage your license IP addresses.'
    noticeIsError.value = true
  } else if (!endpoint) {
    notice.value = 'The customer licensing service is not connected yet.'
    noticeIsError.value = true
  } else {
    try {
      const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json() as { addresses?: unknown; error?: string; detail?: string }
      if (!response.ok || !Array.isArray(result.addresses) || !result.addresses.every(value => typeof value === 'string')) {
        notice.value = errorText(result)
        noticeIsError.value = true
      } else {
        addresses.value = result.addresses
        window.dispatchEvent(new Event('lumen-license-ips-updated'))
      }
    } catch (error) {
      console.error('Unable to load license IP addresses:', error)
      notice.value = 'Could not load your license IP addresses. Please try again later.'
      noticeIsError.value = true
    }
  }
  loading.value = false
})

function addAddress() {
  const address = newAddress.value.trim()
  notice.value = ''
  noticeIsError.value = false
  if (addresses.value.length >= 3) {
    notice.value = 'A license can have up to 3 IP addresses.'
    noticeIsError.value = true
    return
  }
  if (!isIpAddress(address)) {
    notice.value = 'Enter a valid IPv4 or IPv6 address.'
    noticeIsError.value = true
    return
  }
  if (addresses.value.includes(address)) {
    notice.value = 'That IP address is already in the list.'
    noticeIsError.value = true
    return
  }

  const nextAddresses = [...addresses.value, address]
  newAddress.value = ''
  void saveAddresses(nextAddresses)
}

function removeAddress(index: number) {
  void saveAddresses(addresses.value.filter((_, addressIndex) => addressIndex !== index))
}

async function saveAddresses(nextAddresses: string[]) {
  notice.value = ''
  noticeIsError.value = false
  const token = getDiscordSession()
  const endpoint = endpointFor('/account/license-ips')
  if (!token || !endpoint) {
    notice.value = 'Sign in and connect the customer licensing service before saving.'
    noticeIsError.value = true
    return
  }
  saving.value = true
  try {
    const response = await fetch(endpoint, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ addresses: nextAddresses }),
    })
    const result = await response.json() as { addresses?: unknown; error?: string; detail?: string }
    if (!response.ok || !Array.isArray(result.addresses) || !result.addresses.every(value => typeof value === 'string')) {
      notice.value = errorText(result)
      noticeIsError.value = true
      return
    }
    addresses.value = result.addresses
    window.dispatchEvent(new Event('lumen-license-ips-updated'))
    notice.value = 'Your server IP allowlist has been saved.'
  } catch (error) {
    console.error('Unable to update license IP addresses:', error)
    notice.value = 'Could not save your IP addresses. Please try again later.'
    noticeIsError.value = true
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <section class="license-ip-card" aria-labelledby="license-ip-title">
    <div class="license-ip-heading">
      <div>
        <p class="license-ip-eyebrow">License IP allowlist</p>
        <h2 id="license-ip-title">Allowed server IPs</h2>
      </div>
      <span class="license-ip-count">{{ addresses.length }} / 3</span>
    </div>
    <p class="license-ip-note">
      Add the public IP address of each server using your shared Lumen license. Up to three addresses are supported.
    </p>

    <p v-if="loading" class="license-ip-empty">Loading your saved IP addresses…</p>
    <ul v-else-if="addresses.length" class="license-ip-list">
      <li v-for="(address, index) in addresses" :key="`${address}-${index}`">
        <code>{{ address }}</code>
        <button type="button" :disabled="saving" :aria-label="`Remove ${address}`" @click="removeAddress(index)">
          Remove
        </button>
      </li>
    </ul>
    <p v-else-if="!noticeIsError" class="license-ip-empty">No IP addresses added yet.</p>

    <form class="license-ip-add" @submit.prevent="addAddress">
      <label for="license-ip-input">Add an IP address</label>
      <div class="license-ip-input-row">
        <input
          id="license-ip-input"
          v-model="newAddress"
          type="text"
          inputmode="url"
          autocomplete="off"
          placeholder="Example: 203.0.113.10"
          :disabled="loading || saving || addresses.length >= 3"
        >
        <button type="submit" :disabled="loading || saving || addresses.length >= 3">{{ saving ? 'Saving…' : 'Add IP' }}</button>
      </div>
    </form>

    <p v-if="notice" class="license-ip-notice" :class="{ 'is-error': noticeIsError }" role="status">
      {{ notice }}
    </p>
    <p v-if="addresses.length >= 3" class="license-ip-limit">
      Maximum reached. Remove an address before adding another.
    </p>
  </section>
</template>

<style scoped>
.license-ip-card {
  margin: 24px 0;
  padding: 22px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 16px;
  background: var(--lumen-card-bg, var(--vp-c-bg-soft));
}

.license-ip-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.license-ip-heading h2 {
  margin: 2px 0 0;
  border: 0;
  font-size: 1.15rem;
}

.license-ip-eyebrow {
  margin: 0;
  color: var(--vp-c-brand-1);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.license-ip-count {
  padding: 5px 9px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 650;
  white-space: nowrap;
}

.license-ip-note,
.license-ip-empty,
.license-ip-limit {
  color: var(--vp-c-text-2);
  font-size: 0.86rem;
}

.license-ip-list {
  display: grid;
  gap: 8px;
  margin: 18px 0;
  padding: 0;
  list-style: none;
}

.license-ip-list li,
.license-ip-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.license-ip-list li {
  justify-content: space-between;
  padding: 9px 11px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 9px;
}

.license-ip-list button,
.license-ip-input-row button {
  padding: 7px 11px;
  border: 1px solid var(--vp-c-brand-1);
  border-radius: 8px;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font: inherit;
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
}

.license-ip-add label {
  display: block;
  margin-bottom: 7px;
  font-size: 0.85rem;
  font-weight: 650;
}

.license-ip-input-row input {
  min-width: 0;
  flex: 1;
  padding: 10px 12px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 8px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
}

.license-ip-list button:hover,
.license-ip-input-row button:not(:disabled):hover {
  background: var(--vp-c-brand-1);
  color: white;
}

.license-ip-list button:focus-visible,
.license-ip-input-row button:focus-visible,
.license-ip-input-row input:focus-visible {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 2px;
}

.license-ip-input-row button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.license-ip-notice,
.license-ip-limit {
  margin: 10px 0 0;
  color: var(--vp-c-brand-1);
  font-size: 0.82rem;
}

.license-ip-notice.is-error {
  color: var(--vp-c-danger-1, #e5484d);
}

@media (max-width: 560px) {
  .license-ip-card {
    padding: 16px;
  }
}
</style>
