<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface DiscordUser {
  id: string
  username: string
  globalName: string
  avatarUrl: string
  expiresAt: number
}

interface StoredPreferences {
  reduceMotion: boolean
  compactCards: boolean
}

const preferenceKey = 'lumen-account-preferences'
const user = ref<DiscordUser | null>(null)
const loading = ref(true)
const identityMessage = ref('')
const preferences = ref<StoredPreferences>({ reduceMotion: false, compactCards: false })
const notice = ref('')
const noticeIsError = ref(false)
const deleteConfirmation = ref('')
const deletingAccount = ref(false)

function getWorkerEndpoint(path: string) {
  const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + path
  endpoint.search = ''
  return endpoint.toString()
}

function applyPreferences() {
  document.documentElement.classList.toggle('lumen-portal-reduce-motion', preferences.value.reduceMotion)
  document.documentElement.classList.toggle('lumen-portal-compact', preferences.value.compactCards)
}

function savePreferences() {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences.value))
    applyPreferences()
    notice.value = 'Your preferences are saved in this browser.'
    noticeIsError.value = false
  } catch (error) {
    console.error('Unable to save customer portal preferences:', error)
    notice.value = 'Could not save your preferences in this browser.'
    noticeIsError.value = true
  }
}

function loadPreferences() {
  try {
    const saved = localStorage.getItem(preferenceKey)
    if (saved) {
      const parsed: unknown = JSON.parse(saved)
      if (parsed && typeof parsed === 'object') {
        const values = parsed as Partial<StoredPreferences>
        preferences.value = {
          reduceMotion: values.reduceMotion === true,
          compactCards: values.compactCards === true,
        }
      }
    }
    applyPreferences()
  } catch (error) {
    console.error('Unable to load customer portal preferences:', error)
    notice.value = 'Could not load saved preferences from this browser.'
    noticeIsError.value = true
  }
}

async function loadDiscordProfile() {
  let token = ''
  try {
    token = sessionStorage.getItem('lumen-discord-session') ?? ''
  } catch (error) {
    console.error('Unable to access the Discord sign-in session:', error)
    identityMessage.value = 'This browser could not access your sign-in session.'
    loading.value = false
    return
  }

  if (!token) {
    identityMessage.value = 'You are not signed in with Discord in this browser.'
    loading.value = false
    return
  }

  const endpoint = getWorkerEndpoint('/auth/me')
  if (!endpoint) {
    identityMessage.value = 'Discord profile verification is not configured in this environment.'
    loading.value = false
    return
  }

  try {
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
    const result = await response.json() as { user?: DiscordUser; error?: string }
    if (!response.ok || !result.user) {
      identityMessage.value = result.error ?? 'Your Discord session could not be verified.'
      return
    }
    user.value = result.user
    const profileEndpoint = getWorkerEndpoint('/account/profile')
    if (profileEndpoint) {
      try {
        const syncResponse = await fetch(profileEndpoint, {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!syncResponse.ok) {
          const syncResult = await syncResponse.json() as { error?: string; detail?: string }
          if (syncResponse.status === 410) {
            user.value = null
            identityMessage.value = 'This customer account has already been deleted.'
            try {
              sessionStorage.removeItem('lumen-discord-session')
            } catch (storageError) {
              console.error('Unable to clear the deleted customer session:', storageError)
            }
            return
          }
          const syncErrorMessage = syncResult.error ?? syncResult.detail
          notice.value = syncErrorMessage
            ? `Discord is connected, but your username could not be synced: ${syncErrorMessage}`
            : 'Discord is connected, but your username could not be synced to the customer directory.'
          noticeIsError.value = true
        }
      } catch (syncError) {
        console.error('Unable to sync customer Discord username:', syncError)
        notice.value = 'Discord is connected, but your username could not be synced to the customer directory.'
        noticeIsError.value = true
      }
    }
  } catch (error) {
    console.error('Unable to verify the customer Discord profile:', error)
    identityMessage.value = 'Could not reach the account service. Please try again later.'
  } finally {
    loading.value = false
  }
}

async function copyDiscordId() {
  if (!user.value) return
  try {
    await navigator.clipboard.writeText(user.value.id)
    notice.value = 'Discord ID copied to clipboard.'
    noticeIsError.value = false
  } catch (error) {
    console.error('Unable to copy the Discord account ID:', error)
    notice.value = 'Could not copy the Discord ID. Check clipboard permissions.'
    noticeIsError.value = true
  }
}

function clearPreviewData() {
  if (!window.confirm('Clear the IP addresses saved only in this browser? This cannot be undone.')) return
  try {
    localStorage.removeItem('lumen-account-license-ips')
    notice.value = 'Browser-only license IP preview data was cleared.'
    noticeIsError.value = false
  } catch (error) {
    console.error('Unable to clear browser-only license preview data:', error)
    notice.value = 'Could not clear the preview data from this browser.'
    noticeIsError.value = true
  }
}

function signOut() {
  try {
    sessionStorage.removeItem('lumen-discord-session')
    window.location.assign('/account/')
  } catch (error) {
    console.error('Unable to clear the Discord sign-in session:', error)
    notice.value = 'Could not sign out in this browser.'
    noticeIsError.value = true
  }
}

async function deleteAccount() {
  if (!user.value || deleteConfirmation.value !== 'DELETE') return
  if (!window.confirm('Delete your Lumen Studios customer account and revoke its active licenses? This cannot be undone.')) return
  const endpoint = getWorkerEndpoint('/account/delete')
  if (!endpoint) {
    notice.value = 'Account deletion is not configured in this environment.'
    noticeIsError.value = true
    return
  }

  deletingAccount.value = true
  notice.value = ''
  try {
    const token = sessionStorage.getItem('lumen-discord-session')
    if (!token) throw new Error('Your Discord sign-in session has expired. Sign in again before deleting your account.')
    const response = await fetch(endpoint, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json() as { error?: string; detail?: string }
    if (!response.ok) throw new Error(result.error ?? result.detail ?? 'Your account could not be deleted.')

    try {
      sessionStorage.removeItem('lumen-discord-session')
    } catch (storageError) {
      console.error('Unable to clear the deleted account session from this browser:', storageError)
    }
    for (const key of [preferenceKey, 'lumen-account-license-ips']) {
      try {
        localStorage.removeItem(key)
      } catch (storageError) {
        console.error(`Unable to clear local account data (${key}):`, storageError)
      }
    }
    user.value = null
    deleteConfirmation.value = ''
    notice.value = 'Your account was deleted. Active licenses were revoked and their bound IP/server details erased.'
    noticeIsError.value = false
    window.setTimeout(() => window.location.assign('/'), 2000)
  } catch (error) {
    console.error('Unable to delete the customer account:', error)
    notice.value = error instanceof Error ? error.message : 'Your account could not be deleted. Please try again later.'
    noticeIsError.value = true
  } finally {
    deletingAccount.value = false
  }
}

function startDiscordSignIn() {
  const endpoint = getWorkerEndpoint('/auth/login')
  if (!endpoint) {
    identityMessage.value = 'Discord sign-in is not configured in this environment.'
    return
  }
  window.location.assign(endpoint)
}

onMounted(() => {
  loadPreferences()
  void loadDiscordProfile()
})
</script>

<template>
  <div class="account-settings">
    <section class="settings-profile">
      <div class="settings-section-head">
        <div>
          <span class="settings-kicker">ACCOUNT IDENTITY</span>
          <h2>Discord connection</h2>
        </div>
        <span class="settings-status" :class="{ 'is-connected': user }">
          <i /> {{ loading ? 'Checking' : user ? 'Connected' : 'Not connected' }}
        </span>
      </div>

      <div v-if="user" class="settings-profile-row">
        <img v-if="user.avatarUrl" class="settings-avatar" :src="user.avatarUrl" alt="">
        <div v-else class="settings-avatar settings-avatar-fallback" aria-hidden="true">{{ user.username.slice(0, 1).toUpperCase() }}</div>
        <div class="settings-profile-copy">
          <strong>{{ user.globalName || user.username }}</strong>
          <span>@{{ user.username }}</span>
        </div>
        <button class="settings-secondary-button settings-copy-button" type="button" @click="copyDiscordId">Copy Discord ID</button>
      </div>
      <p v-else class="settings-state" role="status">{{ loading ? 'Verifying your Discord account…' : identityMessage }}</p>

      <div v-if="user" class="settings-session-row">
        <span><i /> Signed in with Discord</span>
        <span>Session expires {{ new Date(user.expiresAt * 1000).toLocaleString() }}</span>
      </div>
      <div v-else-if="!loading" class="settings-profile-actions">
        <button class="settings-primary-button" type="button" @click="startDiscordSignIn">Sign in with Discord <span aria-hidden="true">↗</span></button>
      </div>
    </section>

    <section class="settings-preferences">
      <div class="settings-section-head">
        <div>
          <span class="settings-kicker">MAKE IT YOURS</span>
          <h2>Portal preferences</h2>
        </div>
        <span class="settings-local-badge">SAVED IN THIS BROWSER</span>
      </div>

      <label class="settings-preference-row">
        <span class="settings-preference-icon">◌</span>
        <span class="settings-preference-copy"><strong>Reduce motion</strong><small>Pause portal animations and transitions.</small></span>
        <input v-model="preferences.reduceMotion" class="settings-toggle-input" type="checkbox" @change="savePreferences">
        <span class="settings-toggle" aria-hidden="true"><i /></span>
      </label>

      <label class="settings-preference-row">
        <span class="settings-preference-icon settings-icon-green">▤</span>
        <span class="settings-preference-copy"><strong>Compact cards</strong><small>Use a denser layout for portal sections.</small></span>
        <input v-model="preferences.compactCards" class="settings-toggle-input" type="checkbox" @change="savePreferences">
        <span class="settings-toggle" aria-hidden="true"><i /></span>
      </label>
    </section>

    <section class="settings-privacy">
      <div class="settings-section-head">
        <div>
          <span class="settings-kicker">PRIVACY & DATA</span>
          <h2>Your browser data</h2>
        </div>
      </div>
      <p>License IP entries are only a local preview right now. Clear them from this browser whenever you want.</p>
      <div class="settings-data-row">
        <span><strong>License IP preview</strong><small>Stored in this browser only · not synced to a license</small></span>
        <button class="settings-danger-button" type="button" @click="clearPreviewData">Clear preview data</button>
      </div>
    </section>

    <section v-if="user" class="settings-delete">
      <div class="settings-section-head">
        <div>
          <span class="settings-kicker">IRREVERSIBLE</span>
          <h2>Delete your customer account</h2>
        </div>
      </div>
      <p>Deleting your account revokes active licenses, removes saved license IPs and server bindings, and erases your Discord name from the customer profile. Minimal license and audit records are retained for service integrity. You will be signed out.</p>
      <label class="settings-delete-confirm">
        Type <strong>DELETE</strong> to confirm
        <input v-model="deleteConfirmation" autocomplete="off" placeholder="DELETE">
      </label>
      <button class="settings-danger-button" type="button" :disabled="deletingAccount || deleteConfirmation !== 'DELETE'" @click="deleteAccount">
        {{ deletingAccount ? 'Deleting account…' : 'Delete my account' }}
      </button>
    </section>

    <div v-if="user" class="settings-signout-row">
      <div><strong>Finished for now?</strong><span>Sign out of this browser session.</span></div>
      <button class="settings-secondary-button" type="button" @click="signOut">Sign out</button>
    </div>

    <p v-if="notice" class="settings-notice" :class="{ 'is-error': noticeIsError }" role="status">{{ notice }}</p>
  </div>
</template>

<style scoped>
.account-settings {
  display: grid;
  gap: 16px;
  margin: 22px 0 42px;
}

.settings-profile,
.settings-preferences,
.settings-privacy,
.settings-delete,
.settings-signout-row {
  padding: 21px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 16px;
  background:
    radial-gradient(ellipse at 92% 0, rgb(123 63 242 / 8%), transparent 48%),
    var(--lumen-card-bg, var(--vp-c-bg-soft));
}

.settings-delete {
  border-color: rgb(239 68 68 / 45%);
}

.settings-delete > p {
  color: var(--vp-c-text-2);
  font-size: 0.84rem;
  line-height: 1.65;
}

.settings-delete-confirm {
  display: grid;
  gap: 7px;
  max-width: 360px;
  margin: 14px 0;
  font-size: 0.78rem;
}

.settings-delete-confirm input {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 9px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
}

.settings-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-kicker {
  color: var(--vp-c-brand-1);
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.settings-section-head h2 {
  margin: 5px 0 0;
  border: 0;
  font-size: 1.16rem;
}

.settings-status,
.settings-local-badge {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 999px;
  color: var(--vp-c-text-2);
  font-size: 0.61rem;
  font-weight: 650;
  white-space: nowrap;
}

.settings-status > i,
.settings-session-row > span:first-child > i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
}

.settings-status.is-connected > i,
.settings-session-row > span:first-child > i {
  background: #54d89a;
  box-shadow: 0 0 9px rgb(84 216 154 / 50%);
}

.settings-local-badge {
  color: var(--vp-c-brand-1);
  font-size: 0.5rem;
  letter-spacing: 0.06em;
}

.settings-profile-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 20px;
}

.settings-avatar {
  width: 46px;
  height: 46px;
  flex: 0 0 46px;
  border: 1px solid rgb(123 63 242 / 35%);
  border-radius: 50%;
  object-fit: cover;
}

.settings-avatar-fallback {
  display: grid;
  place-items: center;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  font-weight: 750;
}

.settings-profile-copy,
.settings-data-row > span,
.settings-signout-row > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.settings-profile-copy strong,
.settings-data-row strong,
.settings-signout-row strong {
  color: var(--vp-c-text-1);
  font-size: 0.86rem;
}

.settings-profile-copy > span,
.settings-session-row,
.settings-state,
.settings-privacy > p,
.settings-data-row small,
.settings-signout-row > div > span {
  color: var(--vp-c-text-2);
  font-size: 0.75rem;
}

.settings-copy-button {
  margin-left: auto;
}

.settings-session-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
  padding-top: 13px;
  border-top: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  font-size: 0.66rem;
}

.settings-session-row > span:first-child {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.settings-state {
  margin: 16px 0 0;
  line-height: 1.6;
}

.settings-profile-actions { margin-top: 15px; }

.settings-primary-button,
.settings-secondary-button,
.settings-danger-button {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 9px;
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font: inherit;
  font-size: 0.69rem;
  font-weight: 650;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 160ms ease, transform 160ms ease, background 160ms ease;
}

.settings-primary-button {
  border-color: transparent;
  background: var(--vp-c-brand-1);
  color: white;
}

.settings-primary-button:hover,
.settings-secondary-button:hover,
.settings-danger-button:hover {
  transform: translateY(-1px);
  border-color: var(--vp-c-brand-1);
}

.settings-preference-row {
  position: relative;
  display: flex;
  min-height: 67px;
  align-items: center;
  gap: 11px;
  margin-top: 8px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 11px;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.settings-preference-row:hover {
  border-color: var(--lumen-card-border, var(--vp-c-divider));
  background: color-mix(in srgb, var(--vp-c-bg) 55%, transparent);
}

.settings-preference-icon {
  display: grid;
  width: 35px;
  height: 35px;
  flex: 0 0 35px;
  place-items: center;
  border-radius: 10px;
  background: rgb(123 63 242 / 12%);
  color: var(--vp-c-brand-1);
}

.settings-icon-green {
  background: rgb(84 216 154 / 10%);
  color: #54d89a;
}

.settings-preference-copy {
  display: grid;
  gap: 3px;
}

.settings-preference-copy strong { font-size: 0.76rem; }
.settings-preference-copy small { color: var(--vp-c-text-2); font-size: 0.64rem; }

.settings-toggle-input {
  position: absolute;
  right: 12px;
  width: 38px;
  height: 22px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.settings-toggle {
  position: relative;
  width: 38px;
  height: 22px;
  flex: 0 0 38px;
  margin-left: auto;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 99px;
  background: var(--vp-c-bg);
  transition: background 180ms ease, border-color 180ms ease;
}

.settings-toggle i {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
  transition: transform 180ms ease, background 180ms ease;
}

.settings-toggle-input:checked + .settings-toggle {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-1);
}

.settings-toggle-input:checked + .settings-toggle i {
  transform: translateX(16px);
  background: white;
}

.settings-toggle-input:focus-visible + .settings-toggle {
  outline: 2px solid var(--vp-c-brand-1);
  outline-offset: 3px;
}

.settings-privacy > p {
  margin: 12px 0;
  line-height: 1.6;
}

.settings-data-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 10px;
}

.settings-data-row small { line-height: 1.5; }

.settings-danger-button {
  flex: 0 0 auto;
  border-color: rgb(229 72 77 / 28%);
  color: var(--vp-c-danger-1, #e5484d);
}

.settings-signout-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--vp-c-bg);
}

.settings-notice {
  margin: 0;
  color: var(--vp-c-brand-1);
  font-size: 0.75rem;
}

.settings-notice.is-error { color: var(--vp-c-danger-1, #e5484d); }

:global(html.lumen-portal-reduce-motion .account-settings *),
:global(html.lumen-portal-reduce-motion .account-settings *::before),
:global(html.lumen-portal-reduce-motion .account-settings *::after) {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  scroll-behavior: auto !important;
  transition-duration: 0.01ms !important;
}

:global(html.lumen-portal-compact .settings-profile),
:global(html.lumen-portal-compact .settings-preferences),
:global(html.lumen-portal-compact .settings-privacy) {
  padding: 14px;
}

@media (max-width: 560px) {
  .settings-profile,
  .settings-preferences,
  .settings-privacy,
  .settings-signout-row { padding: 15px; }

  .settings-section-head { align-items: flex-start; flex-direction: column; }
  .settings-profile-row { flex-wrap: wrap; }
  .settings-copy-button { margin-left: 58px; }
  .settings-session-row,
  .settings-data-row { align-items: flex-start; flex-direction: column; }
  .settings-preference-copy { padding-right: 40px; }
}
</style>

<style>
html.lumen-portal-reduce-motion *,
html.lumen-portal-reduce-motion *::before,
html.lumen-portal-reduce-motion *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  scroll-behavior: auto !important;
  transition-duration: 0.01ms !important;
}

html.lumen-portal-compact .portal-action-card {
  min-height: 220px;
  padding: 15px;
}

html.lumen-portal-compact .portal-section {
  padding-top: 38px;
}
</style>
