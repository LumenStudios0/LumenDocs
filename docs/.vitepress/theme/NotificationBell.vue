<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, withBase } from 'vitepress'
import { communityDate, communityRequest, type Notification, type NotificationPage } from './community-api'
import { getDiscordSession } from './discord-session'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const route = useRoute()
const router = useRouter()
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const items = ref<Notification[]>([])
const unread = ref<number | null>(null)
const loading = ref(false)
const opening = ref(false)
const error = ref('')
let generation = 0
let alive = true
let timer: ReturnType<typeof setInterval> | undefined
const label = computed(() => error.value ? 'Notifications, unread count unavailable'
  : unread.value === null ? 'Notifications' : `Notifications, ${unread.value} unread`)

async function refresh() {
  if (loading.value || opening.value || document.hidden) return
  const token = getDiscordSession()
  if (!token) return
  const requestId = ++generation
  loading.value = true
  try {
    const result = await communityRequest<NotificationPage>('/notifications?page=1&pageSize=5')
    if (requestId !== generation || token !== getDiscordSession()) return
    if (!Number.isSafeInteger(result.unreadTotal) || result.unreadTotal < 0 || !Array.isArray(result.items)) {
      throw new Error('The notification service returned an invalid unread count. Please refresh.')
    }
    items.value = result.items
    unread.value = result.unreadTotal
    error.value = ''
  } catch (requestError) {
    if (requestId === generation && token === getDiscordSession()) {
      error.value = requestError instanceof Error ? requestError.message : 'Notifications could not be loaded.'
      unread.value = null
      items.value = []
    }
  } finally { if (requestId === generation) loading.value = false }
}
async function openNotification(notification: Notification) {
  if (opening.value || loading.value) return
  const token = getDiscordSession()
  opening.value = true
  error.value = ''
  try {
    if (!notification.read) {
      await communityRequest(`/notifications/${notification.id}/read`, { method: 'POST' })
      if (!alive || token !== getDiscordSession()) return
      notification.read = true
      if (unread.value !== null) unread.value = Math.max(0, unread.value - 1)
      window.dispatchEvent(new Event('lumen-notifications-changed'))
    }
    if (!alive || token !== getDiscordSession()) return
    emit('update:open', false)
    await router.go(withBase(notification.link))
  } catch (requestError) {
    if (alive && token === getDiscordSession()) error.value = requestError instanceof Error ? requestError.message : 'Could not open notification.'
  } finally { opening.value = false; if (alive && !error.value) void refresh() }
}
function outside(event: PointerEvent) {
  if (event.target instanceof Node && !root.value?.contains(event.target)) emit('update:open', false)
}
function escape(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) { emit('update:open', false); trigger.value?.focus() }
}
function visible() { if (!document.hidden) void refresh() }
watch(() => props.open, value => { if (value) void refresh() })
watch(() => route.path, () => { emit('update:open', false) })
onMounted(() => {
  void refresh()
  timer = setInterval(() => { void refresh() }, 60000)
  document.addEventListener('pointerdown', outside)
  document.addEventListener('visibilitychange', visible)
  window.addEventListener('keydown', escape)
  window.addEventListener('lumen-notifications-changed', refresh)
})
onUnmounted(() => {
  alive = false
  generation++
  clearInterval(timer)
  document.removeEventListener('pointerdown', outside)
  document.removeEventListener('visibilitychange', visible)
  window.removeEventListener('keydown', escape)
  window.removeEventListener('lumen-notifications-changed', refresh)
})
</script>

<template>
  <div ref="root" class="lumen-notifications">
    <button ref="trigger" class="notification-trigger" type="button" :aria-label="label" :title="label" :aria-expanded="open" aria-controls="lumen-notification-panel" @click="emit('update:open', !open)">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      <span v-if="unread" class="notification-count" aria-hidden="true">{{ unread }}</span>
      <span v-else-if="error" class="notification-count notification-warning" aria-hidden="true">!</span>
    </button>
    <section v-if="open" id="lumen-notification-panel" class="lumen-notification-panel" aria-label="Notifications">
      <header><strong>Notifications <small v-if="unread !== null">{{ unread }} unread</small></strong><button type="button" :disabled="loading || opening" @click="refresh">Refresh</button></header>
      <p v-if="error" class="notification-error" role="alert">{{ error }}</p>
      <p v-else-if="loading && unread === null" role="status">Loading notifications...</p>
      <p v-else-if="!items.length">You are all caught up.</p>
      <ul v-if="items.length">
        <li v-for="notification in items" :key="notification.id">
          <a :href="withBase(notification.link)" :class="{ unread: !notification.read }" :aria-disabled="opening" @click.prevent="openNotification(notification)">
            <strong><span v-if="!notification.read" class="notification-dot" aria-label="Unread"></span>{{ notification.title }}</strong>
            <span class="notification-preview">{{ notification.body }}</span>
            <small>{{ communityDate(notification.createdAt) }}</small>
          </a>
        </li>
      </ul>
      <a class="notification-footer" :href="withBase('/account/notifications')" @click="emit('update:open', false)">All notifications &amp; preferences</a>
    </section>
  </div>
</template>

<style scoped>
.lumen-notifications { position: relative; }
.notification-trigger { position: relative; display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid var(--lumen-card-border); border-radius: 9px; background: var(--lumen-card-bg); color: var(--vp-c-text-1); cursor: pointer; }
.notification-trigger svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.notification-trigger:hover, .notification-trigger[aria-expanded="true"] { border-color: var(--vp-c-brand-1); color: var(--vp-c-brand-1); }
.notification-count { position: absolute; top: -6px; right: -6px; min-width: 17px; height: 17px; padding: 0 4px; border: 2px solid var(--vp-c-bg); border-radius: 12px; background: var(--vp-c-brand-1); color: var(--vp-c-bg); font-size: 9px; font-weight: 750; line-height: 13px; text-align: center; }
.notification-warning { background: var(--vp-c-warning-1); }
.lumen-notification-panel { position: absolute; z-index: 110; top: calc(100% + 10px); right: 0; width: 320px; max-width: calc(100vw - 24px); max-height: min(460px, calc(100dvh - var(--vp-nav-height) - 24px)); overflow-y: auto; padding: 12px; border: 1px solid var(--lumen-card-border); border-radius: 12px; background: var(--vp-c-bg); box-shadow: 0 16px 42px rgb(0 0 0 / 25%); }
.lumen-notification-panel header { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 12px; }
.lumen-notification-panel header strong { display: grid; gap: 3px; }
.lumen-notification-panel small, .lumen-notification-panel p { color: var(--vp-c-text-2); font-size: 10px; line-height: 1.5; }
.lumen-notification-panel header button { padding: 5px 7px; color: var(--vp-c-brand-1); font-size: 10px; cursor: pointer; }
.lumen-notification-panel ul { margin: 10px 0; padding: 0; list-style: none; }
.lumen-notification-panel li a { display: grid; gap: 5px; padding: 10px; border-radius: 8px; color: var(--vp-c-text-2); text-decoration: none; }
.lumen-notification-panel a.unread { background: var(--vp-c-brand-soft); }
.lumen-notification-panel li a strong { color: var(--vp-c-text-1); font-size: 11px; line-height: 1.5; overflow-wrap: anywhere; }
.notification-preview { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 2; -webkit-box-orient: vertical; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.notification-dot { display: inline-block; width: 5px; height: 5px; margin: 0 6px 1px 0; border-radius: 50%; background: var(--vp-c-brand-1); }
.notification-footer { display: block; padding: 10px 5px 2px; border-top: 1px solid var(--lumen-card-border); color: var(--vp-c-brand-1); font-size: 11px; text-align: center; text-decoration: none; }
.lumen-notification-panel .notification-error { color: var(--vp-c-danger-1); overflow-wrap: anywhere; }
button:focus-visible, a:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 2px; }
button:disabled, a[aria-disabled="true"] { opacity: .6; }
@media (max-width: 640px) { .lumen-notification-panel { position: fixed; top: calc(var(--vp-nav-height) + 8px); left: 12px; right: 12px; width: auto; } .notification-trigger { width: 32px; height: 32px; } }
</style>
