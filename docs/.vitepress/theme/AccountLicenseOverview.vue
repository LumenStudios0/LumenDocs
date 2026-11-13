<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { accountRequest, LicenseApiError } from './licensing-api'
import { effectiveLicenseStatus } from './licensing-utils.mjs'

interface LicenseInfo {
  licenseKey?: string
  license?: { productIds?: string[]; status?: string; expiresAt?: string | null }
}

const loading = ref(false)
const hasKey = ref<boolean | null>(null)
const productIds = ref<string[]>([])
const status = ref('unknown')
const ipCount = ref<number | null>(null)
const licenseError = ref('')
const ipError = ref('')
const notice = ref('')
const updatedAt = ref('')
let generation = 0
let lastToken = ''
const ready = computed(() => hasKey.value === true && status.value === 'active' && (ipCount.value ?? 0) > 0)
const headline = computed(() => loading.value ? 'Checking your license…'
  : ready.value ? 'License and server IPs configured'
    : hasKey.value === false ? 'Start with your first purchase'
      : hasKey.value === null ? 'Your account needs a connection'
        : status.value !== 'active' ? 'Review your license status' : 'Add an IP to enable validation')

async function refresh() {
  const requestId = ++generation
  loading.value = true
  hasKey.value = null
  ipCount.value = null
  productIds.value = []
  status.value = 'unknown'
  licenseError.value = ''
  ipError.value = ''
  notice.value = ''
  updatedAt.value = ''
  try {
    lastToken = getDiscordSession()
    await Promise.all([
      (async () => {
        try {
          const result = await accountRequest<LicenseInfo>('/account/license-key')
          if (requestId !== generation) return
          if (typeof result.licenseKey !== 'string' || !result.licenseKey) throw new Error('The license service returned an invalid key response.')
          hasKey.value = true
          productIds.value = result.license?.productIds ?? []
          status.value = effectiveLicenseStatus({ status: result.license?.status ?? 'unknown', expiresAt: result.license?.expiresAt })
        } catch (error) {
          if (requestId !== generation) return
          if (error instanceof LicenseApiError && error.status === 404) {
            hasKey.value = false
            status.value = 'unclaimed'
          } else {
            console.error('Unable to load license health:', error)
            licenseError.value = error instanceof Error ? error.message : 'Could not load license information.'
          }
        }
      })(),
      (async () => {
        try {
          const result = await accountRequest<{ addresses: string[] }>('/account/license-ips')
          if (requestId !== generation) return
          if (!Array.isArray(result.addresses) || !result.addresses.every(address => typeof address === 'string')) {
            throw new Error('The license service returned an invalid IP allowlist.')
          }
          ipCount.value = result.addresses.length
        } catch (error) {
          if (requestId !== generation) return
          console.error('Unable to load license IP usage:', error)
          ipError.value = error instanceof LicenseApiError && error.status === 404
            ? 'Claim a license before adding IP addresses.' : error instanceof Error ? error.message : 'Could not load IP usage.'
        }
      })(),
    ])
    if (requestId === generation && !licenseError.value && !ipError.value) updatedAt.value = new Date().toLocaleTimeString()
  } catch (error) {
    console.error('Unable to access the license session:', error)
    if (requestId === generation) licenseError.value = 'This browser could not access your sign-in session.'
  } finally {
    if (requestId === generation) loading.value = false
  }
}

function handleIpUpdate(event: Event) {
  const addresses = (event as CustomEvent<{ addresses?: string[] }>).detail?.addresses
  if (Array.isArray(addresses)) {
    ipCount.value = addresses.length
    ipError.value = ''
  } else void refresh()
}

function handleSession() {
  try {
    if (getDiscordSession() !== lastToken) void refresh()
  } catch (error) {
    console.error('Unable to refresh the license session:', error)
    void refresh()
  }
}

async function copyDiagnostics() {
  try {
    await navigator.clipboard.writeText([
      'Lumen Studios — license diagnostics (no license key)',
      `Status: ${status.value}`,
      `Eligible product IDs: ${productIds.value.join(', ') || 'None reported'}`,
      `Allowed IP slots: ${ipCount.value === null ? 'Unavailable' : `${ipCount.value}/3`}`,
      `License error: ${licenseError.value || 'None'}`,
      `Allowlist error: ${ipError.value || 'None'}`,
      `Captured: ${new Date().toISOString()}`,
    ].join('\n'))
    notice.value = 'Diagnostics copied. Your license key and IP addresses are not included.'
  } catch (error) {
    console.error('Unable to copy license diagnostics:', error)
    notice.value = 'Clipboard access was denied. Please allow it and try again.'
  }
}

onMounted(() => {
  void refresh()
  window.addEventListener('lumen-license-ips-updated', handleIpUpdate)
  window.addEventListener('lumen-license-claimed', refresh)
  window.addEventListener('lumen-discord-user', handleSession)
})
onUnmounted(() => {
  generation++
  window.removeEventListener('lumen-license-ips-updated', handleIpUpdate)
  window.removeEventListener('lumen-license-claimed', refresh)
  window.removeEventListener('lumen-discord-user', handleSession)
})
</script>

<template>
  <section class="license-health" aria-labelledby="license-health-title" :aria-busy="loading">
    <header>
      <div>
        <p class="health-eyebrow">YOUR LICENSE WORKSPACE</p>
        <h2 id="license-health-title">{{ headline }}</h2>
        <p>One shared key. Your eligible plugins. Server access you control.</p>
      </div>
      <button type="button" :disabled="loading" @click="refresh">{{ loading ? 'Refreshing…' : 'Refresh account' }}</button>
    </header>
    <div class="health-metrics">
      <article><span>LICENSE STATUS</span><strong :class="{ 'health-ready': ready }">{{ loading ? 'Checking…' : status.replaceAll('_', ' ') }}</strong><small>{{ hasKey === false ? 'Connect BuiltByBit to claim a key' : 'Reported by the licensing service' }}</small></article>
      <article><span>ELIGIBLE PRODUCTS</span><strong>{{ hasKey === null ? '—' : productIds.length }}</strong><small>Verified entitlements on your shared license</small></article>
      <article><span>SERVER IP SLOTS</span><strong>{{ ipCount === null ? '—' : ipCount }} <em>/ 3</em></strong><progress :value="ipCount ?? 0" max="3" aria-label="Used IP address slots" /><small>{{ ipCount === null ? 'Usage unavailable' : `${3 - ipCount} ${ipCount === 2 ? 'slot' : 'slots'} available` }}</small></article>
    </div>
    <p v-if="licenseError" class="health-error" role="alert">{{ licenseError }}</p>
    <p v-if="ipError" class="health-error" role="alert">{{ ipError }}</p>
    <div class="health-bottom">
      <div class="health-checklist">
        <p class="health-eyebrow">SETUP CHECKLIST</p>
        <a href="/account/licenses#builtbybit-claim-title"><b>{{ hasKey ? '✓' : '01' }}</b><span>Verify your purchases<small>{{ hasKey ? 'Shared key available' : 'Connect your BuiltByBit buyer account' }}</small></span><span aria-hidden="true">↗</span></a>
        <a href="/account/licenses#manage-server-ips"><b>{{ ipCount ? '✓' : '02' }}</b><span>Allow your server IPs<small>A key without an IP cannot validate</small></span><span aria-hidden="true">↗</span></a>
        <a href="/account/licenses#connected-servers"><b>03</b><span>Check your installations<small>Confirm activity after configuring your plugins</small></span><span aria-hidden="true">↗</span></a>
      </div>
      <div class="health-products">
        <p class="health-eyebrow">VERIFIED PRODUCT IDS</p>
        <div v-if="productIds.length" class="health-tags"><code v-for="id in productIds" :key="id">{{ id }}</code></div>
        <p v-else>{{ hasKey === null ? 'Connect to the licensing service to see your products.' : 'No product IDs reported. Reconnect BuiltByBit to check eligible purchases.' }}</p>
        <a href="/account/licenses#builtbybit-claim-title">Manage purchases &amp; key →</a>
        <p class="health-hint">New purchase? Reconnect BuiltByBit to refresh your entitlements. Purchases are not synced automatically.</p>
      </div>
    </div>
    <footer><span>{{ updatedAt ? `Checked at ${updatedAt}` : 'Unavailable values are not counted as zero.' }}</span><button type="button" :disabled="loading" @click="copyDiagnostics">Copy safe diagnostics</button></footer>
    <p v-if="notice" role="status" class="health-hint">{{ notice }}</p>
  </section>
</template>

<style scoped>
.license-health { margin: 24px 0; padding: clamp(18px, 3vw, 30px); border: 1px solid var(--vp-c-divider); border-radius: 22px; background: radial-gradient(ellipse at 100% 0, #7b3ff21c, transparent 55%), var(--vp-c-bg-soft); }
.license-health header, .license-health footer { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.health-eyebrow { margin: 0 0 8px; color: var(--vp-c-brand-1); font-size: .65rem; font-weight: 750; letter-spacing: .12em; }
.license-health h2 { margin: 0; padding: 0; border: 0; font-size: clamp(1.25rem, 3vw, 1.8rem); line-height: 1.2; letter-spacing: -.04em; }
.license-health header p:last-child, .health-products p, .health-hint { color: var(--vp-c-text-2); font-size: .83rem; line-height: 1.6; }
.license-health button { flex-shrink: 0; padding: 9px 13px; border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font-size: .75rem; cursor: pointer; }
.license-health button:disabled { opacity: .5; cursor: wait; }
.license-health :is(a, button):focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
.health-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 20px 0; border: 1px solid var(--vp-c-divider); border-radius: 14px; background: var(--vp-c-bg); }
.health-metrics article { display: grid; align-content: start; gap: 10px; padding: 20px; }
.health-metrics article + article { border-left: 1px solid var(--vp-c-divider); }
.health-metrics article > span { color: var(--vp-c-text-2); font-size: .6rem; font-weight: 750; letter-spacing: .1em; }
.health-metrics strong { font-size: 1.65rem; line-height: 1.2; text-transform: capitalize; letter-spacing: -.03em; overflow-wrap: anywhere; }
.health-metrics small { color: var(--vp-c-text-2); font-size: .7rem; line-height: 1.5; }
.health-metrics em { color: var(--vp-c-text-3); font-size: 1rem; font-style: normal; }
.health-metrics progress { width: 100%; height: 6px; accent-color: var(--vp-c-brand-1); }
.health-ready { color: var(--vp-c-brand-1); }
.health-bottom { display: grid; grid-template-columns: 1.2fr 1fr; gap: 28px; }
.health-checklist a { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--vp-c-divider); color: var(--vp-c-text-1); font-size: .85rem; text-decoration: none; }
.health-checklist b { display: grid; width: 28px; height: 28px; flex-shrink: 0; place-items: center; border-radius: 8px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); font-size: .7rem; }
.health-checklist a > span:nth-child(2) { flex: 1; }
.health-checklist small { display: block; color: var(--vp-c-text-2); font-size: .7rem; font-weight: 400; }
.health-products > a { font-size: .8rem; }
.health-tags { display: flex; flex-wrap: wrap; gap: 7px; margin: 16px 0; }
.health-tags code { padding: 5px 9px; overflow-wrap: anywhere; }
.license-health footer { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--vp-c-divider); color: var(--vp-c-text-3); font-size: .7rem; }
.health-error { padding: 10px 12px; border: 1px solid var(--vp-c-danger-2); border-radius: 8px; color: var(--vp-c-danger-1); font-size: .85rem; }
@media (max-width: 640px) { .license-health header, .license-health footer { align-items: flex-start; flex-direction: column; } .health-bottom { grid-template-columns: 1fr; } .health-metrics article { padding: 12px 8px; } .health-metrics strong { font-size: 1.12rem; } .health-metrics small { font-size: .65rem; } }
@media (max-width: 420px) { .health-metrics { grid-template-columns: 1fr; } .health-metrics article { grid-template-columns: 1fr auto; padding: 16px; } .health-metrics article + article { border-left: 0; border-top: 1px solid var(--vp-c-divider); } .health-metrics strong { grid-column: 2; grid-row: 1 / 3; align-self: center; max-width: 100px; text-align: right; } .health-metrics small { font-size: .7rem; } .health-metrics progress { grid-column: 1 / -1; } }
</style>
