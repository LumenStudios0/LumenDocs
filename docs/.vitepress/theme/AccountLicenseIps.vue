<script setup lang="ts">
import { onMounted, ref } from 'vue'

const storageKey = 'lumen-account-license-ips'
const addresses = ref<string[]>([])
const newAddress = ref('')
const notice = ref('')
const noticeIsError = ref(false)

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

onMounted(() => {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return
    const parsed: unknown = JSON.parse(saved)
    if (Array.isArray(parsed) && parsed.length <= 3 && parsed.every(value => typeof value === 'string')) {
      addresses.value = parsed
    }
  } catch (error) {
    console.error('Unable to load saved license IP addresses:', error)
    notice.value = 'Could not load the saved addresses from this browser.'
    noticeIsError.value = true
  }
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

  addresses.value.push(address)
  newAddress.value = ''
  saveAddresses()
}

function removeAddress(index: number) {
  addresses.value.splice(index, 1)
  saveAddresses()
}

function saveAddresses() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(addresses.value))
    window.dispatchEvent(new Event('lumen-license-preview-updated'))
    notice.value = 'Saved in this browser.'
    noticeIsError.value = false
  } catch (error) {
    console.error('Unable to save license IP addresses:', error)
    notice.value = 'Could not save addresses in this browser.'
    noticeIsError.value = true
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
      This preview saves addresses only in this browser. It is not connected to a live license yet.
    </p>

    <ul v-if="addresses.length" class="license-ip-list">
      <li v-for="(address, index) in addresses" :key="`${address}-${index}`">
        <code>{{ address }}</code>
        <button type="button" :aria-label="`Remove ${address}`" @click="removeAddress(index)">
          Remove
        </button>
      </li>
    </ul>
    <p v-else class="license-ip-empty">No IP addresses added yet.</p>

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
          :disabled="addresses.length >= 3"
        >
        <button type="submit" :disabled="addresses.length >= 3">Add IP</button>
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
