<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { accountRequest, LicenseApiError } from './licensing-api'
import { visibleServiceError, licenseServiceNotice } from './service-errors'
import { useSiteDialog } from './site-dialog'

const { confirm: confirmSiteAction } = useSiteDialog()

interface LicenseInfo {
  licenseKey?: string
  license?: {
    productIds?: string[]
    status?: string
  }
  claimedProductIds?: string[]
  error?: string
}

const licenseKey = ref('')
const productIds = ref<string[]>([])
const keyVisible = ref(false)
const loading = ref(true)
const connecting = ref(false)
const copying = ref(false)
const message = ref('')
const errorMessage = ref('')
let lastToken = ''

function endpointFor(path: string) {
  const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + path
  endpoint.search = ''
  return endpoint.toString()
}

function readSession() {
  try {
    return getDiscordSession()
  } catch (error) {
    console.error('Unable to access the Discord sign-in session:', error)
    errorMessage.value = 'This browser could not access your sign-in session.'
    return ''
  }
}

async function loadExistingLicense(token: string) {
  const endpoint = endpointFor('/account/license-key')
  if (!endpoint) {
    errorMessage.value = 'Automatic licensing is not connected yet.'
    return
  }

  try {
    const result = await accountRequest<LicenseInfo>('/account/license-key')
    if (token !== getDiscordSession()) return
    if (typeof result.licenseKey === 'string') {
      licenseKey.value = result.licenseKey
      productIds.value = result.license?.productIds ?? []
    } else {
      errorMessage.value = await visibleServiceError(result.error ?? 'Could not load your shared license key.', 0, 'licensing')
    }
  } catch (error) {
    if (error instanceof LicenseApiError && error.status === 404) return
    console.error('Unable to load the customer license key:', error)
    errorMessage.value = error instanceof LicenseApiError ? error.message : await visibleServiceError('Could not load your license key.', 0, 'licensing')
  }
}

async function claimFromCallback(token: string) {
  const callbackUrl = new URL(window.location.href)
  const code = callbackUrl.searchParams.get('code')
  const state = callbackUrl.searchParams.get('state')
  const oauthError = callbackUrl.searchParams.get('error')
  if (!code && !state && !oauthError) return false

  window.history.replaceState({}, '', `${callbackUrl.pathname}${callbackUrl.hash}`)
  const savedState = sessionStorage.getItem('lumen-builtbybit-state')
  sessionStorage.removeItem('lumen-builtbybit-state')
  if (oauthError) {
    message.value = 'BuiltByBit linking was cancelled. You can try again whenever you’re ready.'
    return true
  }
  if (!token || !code || !state || !savedState || state !== savedState) {
    errorMessage.value = 'This BuiltByBit sign-in could not be matched to your Lumen account. Start again from this page.'
    return true
  }

  const endpoint = endpointFor('/account/builtbybit/claim')
  if (!endpoint) {
    errorMessage.value = 'Automatic licensing is not connected yet.'
    return true
  }

  connecting.value = true
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, state }),
    })
    const result = await response.json() as LicenseInfo
    if (!response.ok || typeof result.licenseKey !== 'string') {
      errorMessage.value = await visibleServiceError(result.error ?? 'Your purchase could not be verified. Please try again.', response.status, 'licensing')
      return true
    }
    if (token !== getDiscordSession()) return true
    showClaim(result)
  } catch (error) {
    console.error('Unable to claim the BuiltByBit license:', error)
    errorMessage.value = 'Could not verify the purchase right now. Please try again later.'
  } finally {
    connecting.value = false
  }
  return true
}

function showClaim(result: LicenseInfo) {
  if (typeof result.licenseKey !== 'string' || !result.licenseKey) throw new Error('The service did not return your shared license key. Refresh before retrying.')
  licenseKey.value = result.licenseKey
  productIds.value = result.claimedProductIds ?? result.license?.productIds ?? []
  keyVisible.value = false
  message.value = 'Purchase verified. Your shared Lumen license is ready.'
  window.dispatchEvent(new Event('lumen-license-claimed'))
}

async function startClaim(mode: 'discord' | 'oauth' = 'discord') {
  errorMessage.value = ''
  message.value = ''
  const token = readSession()
  if (!token) {
    errorMessage.value = 'Sign in with Discord before connecting a BuiltByBit purchase.'
    return
  }
  if (!licenseKey.value && !await confirmSiteAction('Claiming your first shared key replaces old per-product keys. You will need to update your plugins and add your server IPs again.', { title: 'Verify BuiltByBit purchases', confirmText: mode === 'discord' ? 'Check linked Discord' : 'Continue to BuiltByBit' })) return

  const endpoint = endpointFor(mode === 'discord' ? '/account/builtbybit/discord' : '/account/builtbybit/authorize')
  if (!endpoint) {
    errorMessage.value = 'Automatic licensing is not connected yet.'
    return
  }

  connecting.value = true
  try {
    if (mode === 'discord') {
      const result = await accountRequest<LicenseInfo>('/account/builtbybit/discord', { method: 'POST' })
      if (token === getDiscordSession()) showClaim(result)
      return
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json() as { authorizeUrl?: string; state?: string; error?: string }
    if (!response.ok || !result.authorizeUrl || !result.state) {
      errorMessage.value = await visibleServiceError(result.error ?? 'Could not start BuiltByBit sign-in.', response.status, 'licensing')
      return
    }
    if (token !== getDiscordSession()) return
    sessionStorage.setItem('lumen-builtbybit-state', result.state)
    window.location.assign(result.authorizeUrl)
  } catch (error) {
    console.error('Unable to start BuiltByBit purchase linking:', error)
    errorMessage.value = error instanceof Error ? error.message : 'Could not connect to BuiltByBit. Please try again later.'
  } finally {
    connecting.value = false
  }
}

async function copyLicenseKey() {
  try {
    await navigator.clipboard.writeText(licenseKey.value)
    copying.value = true
    window.setTimeout(() => { copying.value = false }, 1800)
  } catch (error) {
    console.error('Unable to copy the license key:', error)
    errorMessage.value = 'Copy was blocked by the browser. Select the key and copy it manually.'
  }
}

async function handleSession() {
  const token = readSession()
  if (token === lastToken) return
  lastToken = token
  licenseKey.value = ''
  productIds.value = []
  keyVisible.value = false
  message.value = ''
  errorMessage.value = ''
  if (token) await loadExistingLicense(token)
}

onMounted(async () => {
  window.addEventListener('lumen-discord-user', handleSession)
  const token = readSession()
  lastToken = token
  if (!token) {
    loading.value = false
    return
  }
  const callbackHandled = await claimFromCallback(token)
  if (!callbackHandled || !licenseKey.value) await loadExistingLicense(token)
  loading.value = false
})
onUnmounted(() => window.removeEventListener('lumen-discord-user', handleSession))
</script>

<template>
  <section class="builtbybit-claim" aria-labelledby="builtbybit-claim-title">
    <div class="claim-glow" aria-hidden="true" />
    <div class="claim-copy">
      <span class="claim-eyebrow"><i /> BUILTBYBIT PURCHASE LINK</span>
      <h2 id="builtbybit-claim-title">Your purchase.<br><span>Your Lumen key.</span></h2>
      <p>Link Discord in your BuiltByBit account, then check your purchases here to get one shared Lumen license key.</p>
      <ul>
        <li>On BuiltByBit, choose Link Discord account.</li>
        <li>Use the same Discord account you use on this website.</li>
        <li>We verify the linked account and its Lumen purchases; we never ask for your password.</li>
        <li>Keep the same Lumen key for your eligible plugins.</li>
      </ul>
      <a class="claim-link-discord" href="https://builtbybit.com/account/" target="_blank" rel="noopener noreferrer">Link Discord on BuiltByBit <span aria-hidden="true">↗</span></a>
      <button class="claim-button" type="button" :disabled="loading || connecting" @click="startClaim('discord')">
        {{ connecting ? 'Checking purchases…' : loading ? 'Checking your account…' : licenseKey ? 'Refresh purchases with Discord' : 'Check Discord & claim key' }}
        <span aria-hidden="true">↗</span>
      </button>
      <button class="claim-oauth" type="button" :disabled="loading || connecting" @click="startClaim('oauth')">Use BuiltByBit sign-in instead</button>
      <p class="claim-refresh-note">New purchases require another check. Your first shared-key claim replaces legacy per-product keys; update your plugin configs and re-add your IPs.</p>
      <p v-if="message" class="claim-message" role="status">{{ message }}</p>
      <p v-if="errorMessage" :class="errorMessage === licenseServiceNotice ? 'claim-message' : 'claim-error'" :role="errorMessage === licenseServiceNotice ? 'status' : 'alert'">{{ errorMessage }}</p>
    </div>

    <div class="claim-key-card">
      <div class="claim-card-header"><span class="claim-card-icon">✦</span><span><b>SHARED LICENSE</b><small>One key for your Lumen plugins</small></span><i /></div>
      <div v-if="licenseKey" class="claim-key-content">
        <label for="lumen-shared-license-key">Your Lumen license key</label>
        <div class="claim-key-field">
          <input id="lumen-shared-license-key" :type="keyVisible ? 'text' : 'password'" :value="licenseKey" readonly autocomplete="off" spellcheck="false">
          <button type="button" :aria-label="keyVisible ? 'Hide license key' : 'Show license key'" @click="keyVisible = !keyVisible">{{ keyVisible ? 'Hide' : 'Show' }}</button>
        </div>
        <button class="claim-copy-button" type="button" @click="copyLicenseKey">{{ copying ? 'Copied!' : 'Copy license key' }}</button>
        <p v-if="productIds.length" class="claim-products">Unlocked products: {{ productIds.join(', ') }}</p>
        <p class="claim-secret-note">Keep this key private. Add the same key to each eligible plugin’s license setting.</p>
      </div>
      <div v-else class="claim-empty">
        <span class="claim-empty-orbit" aria-hidden="true" />
        <span class="claim-empty-key" aria-hidden="true">⌁</span>
        <b>{{ loading ? 'Checking for your key…' : 'Your key will appear here' }}</b>
        <small>Link Discord on BuiltByBit, then check your purchases.</small>
      </div>
    </div>
  </section>
</template>

<style scoped>
.claim-link-discord { display: inline-block; margin-bottom: 14px; color: var(--vp-c-brand-1); font-size: 13px; font-weight: 600; }
.claim-oauth { display: block; margin-top: 12px; color: var(--vp-c-text-2); font-size: 11px; text-decoration: underline; cursor: pointer; }
.claim-oauth:disabled { opacity: .5; cursor: not-allowed; }
.claim-oauth:focus-visible, .claim-link-discord:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
.builtbybit-claim {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(260px, 0.78fr);
  align-items: center;
  gap: clamp(24px, 5vw, 56px);
  margin: 20px 0 30px;
  padding: clamp(22px, 4vw, 38px);
  overflow: hidden;
  border: 1px solid rgb(123 63 242 / 30%);
  border-radius: 20px;
  background:
    radial-gradient(ellipse at 9% 12%, rgb(123 63 242 / 14%), transparent 48%),
    var(--lumen-card-bg, var(--vp-c-bg-soft));
}

.claim-glow {
  position: absolute;
  right: -120px;
  bottom: -180px;
  width: 360px;
  height: 300px;
  border-radius: 50%;
  background: rgb(123 63 242 / 16%);
  filter: blur(80px);
  pointer-events: none;
}

.claim-copy,
.claim-key-card { position: relative; z-index: 1; }
.claim-eyebrow { display: inline-flex; align-items: center; gap: 8px; color: var(--vp-c-brand-1); font-size: 0.59rem; font-weight: 800; letter-spacing: 0.12em; }
.claim-eyebrow i,
.claim-card-header > i { width: 7px; height: 7px; border-radius: 50%; background: #54d89a; box-shadow: 0 0 12px rgb(84 216 154 / 65%); animation: claim-pulse 2s ease-in-out infinite; }
.claim-copy h2 { margin: 12px 0 10px; font-size: clamp(1.7rem, 3vw, 2.4rem); letter-spacing: -0.05em; line-height: 1.08; }
.claim-copy h2 span { color: var(--vp-c-brand-1); }
.claim-copy > p { max-width: 530px; margin: 0; color: var(--vp-c-text-2); font-size: 0.82rem; line-height: 1.7; }
.claim-copy ul { display: grid; gap: 7px; margin: 16px 0 20px; padding: 0; list-style: none; color: var(--vp-c-text-2); font-size: 0.72rem; }
.claim-copy li { position: relative; padding-left: 18px; }
.claim-copy li::before { position: absolute; left: 0; color: #54d89a; content: "✓"; font-weight: 800; }
.claim-button,
.claim-copy-button { display: inline-flex; min-height: 40px; align-items: center; justify-content: center; gap: 11px; padding: 0 14px; border: 1px solid transparent; border-radius: 10px; background: #7b3ff2; box-shadow: 0 9px 24px rgb(123 63 242 / 25%); color: #fff; cursor: pointer; font-size: 0.72rem; font-weight: 700; transition: transform 160ms ease, background 160ms ease, box-shadow 160ms ease; }
.claim-button:hover:not(:disabled),
.claim-copy-button:hover { transform: translateY(-2px); background: #8d5af5; box-shadow: 0 12px 28px rgb(123 63 242 / 32%); }
.claim-button:disabled { cursor: wait; opacity: 0.7; }
.claim-message { margin-top: 12px !important; color: var(--vp-c-brand-1) !important; font-weight: 650; }
.claim-error { margin-top: 12px !important; color: var(--vp-c-danger-1) !important; }
.claim-key-card { min-width: 0; padding: 16px; border: 1px solid var(--lumen-card-border, var(--vp-c-divider)); border-radius: 15px; background: color-mix(in srgb, var(--vp-c-bg) 86%, transparent); box-shadow: 0 20px 46px rgb(0 0 0 / 12%); }
.claim-card-header { display: flex; align-items: center; gap: 10px; }
.claim-card-icon { display: grid; width: 35px; height: 35px; place-items: center; border: 1px solid rgb(123 63 242 / 24%); border-radius: 10px; background: rgb(123 63 242 / 13%); color: #b89aff; font-size: 1.2rem; }
.claim-card-header > span:nth-child(2) { display: grid; gap: 4px; }
.claim-card-header b { font-size: 0.6rem; letter-spacing: 0.09em; }
.claim-card-header small { color: var(--vp-c-text-3); font-size: 0.59rem; }
.claim-card-header > i { margin-left: auto; }
.claim-key-content { margin-top: 20px; }
.claim-key-content label { display: block; margin-bottom: 7px; color: var(--vp-c-text-2); font-size: 0.63rem; font-weight: 650; }
.claim-key-field { display: flex; min-width: 0; align-items: center; gap: 7px; padding: 7px 8px; border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg); }
.claim-key-field input { width: 0; min-width: 0; flex: 1; border: 0; outline: 0; background: transparent; color: var(--vp-c-brand-1); font-family: var(--vp-font-family-mono); font-size: 0.64rem; }
.claim-key-field button { border: 0; background: transparent; color: var(--vp-c-text-2); cursor: pointer; font-size: 0.59rem; font-weight: 650; }
.claim-copy-button { width: 100%; margin-top: 9px; }
.claim-products,
.claim-secret-note { margin: 10px 0 0; color: var(--vp-c-text-3); font-size: 0.58rem; line-height: 1.55; }
.claim-secret-note { color: var(--vp-c-brand-1); }
.claim-copy .claim-refresh-note { margin-top: 12px; font-size: .7rem; color: var(--vp-c-text-2); }
.claim-empty { position: relative; display: grid; min-height: 180px; align-content: center; justify-items: center; gap: 8px; overflow: hidden; color: var(--vp-c-text-2); text-align: center; }
.claim-empty-orbit { position: absolute; width: 120px; height: 58px; border: 1px solid rgb(123 63 242 / 25%); border-radius: 50%; transform: rotate(-25deg); animation: claim-orbit 14s linear infinite; }
.claim-empty-key { position: relative; display: grid; width: 45px; height: 45px; place-items: center; border: 1px solid rgb(169 134 255 / 55%); border-radius: 14px; background: linear-gradient(145deg, #a77cff, #6731c4); box-shadow: 0 0 28px rgb(123 63 242 / 38%); color: white; font-size: 1.5rem; animation: claim-float 3.8s ease-in-out infinite; }
.claim-empty b { font-size: 0.72rem; }
.claim-empty small { color: var(--vp-c-text-3); font-size: 0.59rem; }

@keyframes claim-pulse { 50% { opacity: 0.55; } }
@keyframes claim-orbit { to { transform: rotate(335deg); } }
@keyframes claim-float { 50% { transform: translateY(-6px) rotate(5deg); } }

@media (max-width: 720px) {
  .builtbybit-claim { grid-template-columns: 1fr; gap: 22px; }
}

@media (prefers-reduced-motion: reduce) {
  .builtbybit-claim *,
  .builtbybit-claim *::before,
  .builtbybit-claim *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }
}
</style>
