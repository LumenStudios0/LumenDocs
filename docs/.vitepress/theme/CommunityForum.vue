<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { getDiscordSession } from './discord-session'
import {
  communityRequest, type CommunityPage, type ForumChannel, type ForumPost, type ForumThread, type ForumViewer, type Issue,
} from './community-api'
import { CommunityUnavailableError } from './community-errors.mjs'
import pluginData from './plugin-compatibility-data.json'

type ChannelId = 'all' | 'known-issues' | ForumChannel
const channels: { id: ChannelId; name: string; icon: string; topic: string; group: string }[] = [
  { id: 'all', name: 'all-threads', icon: '💬', topic: 'Every recent conversation across the community.', group: 'Browse' },
  { id: 'known-issues', name: 'known-issues', icon: '📌', topic: 'Staff-confirmed issues and verified workarounds. Read-only.', group: 'Info' },
  { id: 'announcements', name: 'announcements', icon: '📣', topic: 'News and releases from the Lumen Studios team. Staff only.', group: 'Info' },
  { id: 'general', name: 'general', icon: '#', topic: 'Chat with other server owners about Lumen plugins.', group: 'Community' },
  { id: 'help', name: 'help', icon: '#', topic: 'Ask setup and configuration questions. Staff and the community can answer.', group: 'Community' },
  { id: 'bugs', name: 'bug-reports', icon: '#', topic: 'Report bugs in public. Use a private ticket for logs that contain secrets.', group: 'Community' },
  { id: 'suggestions', name: 'suggestions', icon: '#', topic: 'Pitch features and improvements for any plugin.', group: 'Community' },
  { id: 'showcase', name: 'showcase', icon: '#', topic: 'Show off what you built with Lumen plugins.', group: 'Community' },
]
const groups = ['Browse', 'Info', 'Community']
const products = pluginData.plugins.map(plugin => ({ id: plugin.id, name: plugin.name }))
const productName = (id?: string | null) => products.find(product => product.id === id)?.name ?? id ?? ''

const channel = ref<ChannelId>('all')
const threads = ref<ForumThread[]>([])
const issues = ref<Issue[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const search = ref('')
const statusFilter = ref<'all' | 'open' | 'answered' | 'investigating' | 'resolved'>('all')
const viewer = ref<ForumViewer>({ signedIn: false, staff: false })
const selected = ref<ForumThread | null>(null)
const posts = ref<ForumPost[]>([])
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const unavailable = ref(false)
const composing = ref(false)
const newTitle = ref('')
const newBody = ref('')
const newProduct = ref('')
const newChannel = ref<ForumChannel>('help')
const replyBody = ref('')
const messages = ref<HTMLElement | null>(null)
let generation = 0
let searchTimer: ReturnType<typeof setTimeout> | undefined
let refreshTimer: ReturnType<typeof setInterval> | undefined

const current = computed(() => channels.find(item => item.id === channel.value) ?? channels[0])
const signedIn = computed(() => viewer.value.signedIn || Boolean(safeSession()))
const postableChannels = computed(() => channels.filter(item =>
  item.id !== 'all' && item.id !== 'known-issues' && (item.id !== 'announcements' || viewer.value.staff)))
const canPostHere = computed(() => channel.value !== 'known-issues' && (channel.value !== 'announcements' || viewer.value.staff))
const pages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

function safeSession() {
  try { return getDiscordSession() } catch { return '' }
}
function authHeaders(): Record<string, string> {
  const token = safeSession()
  return token ? { Authorization: `Bearer ${token}` } : {}
}
function initials(name: string) {
  return name.split(/[\s_.-]+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join('') || '?'
}
function hue(name: string) {
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return 250 + (hash % 80)
}
function relative(value: string) {
  const time = Date.parse(value)
  if (!Number.isFinite(time)) return ''
  const seconds = Math.round((Date.now() - time) / 1000)
  if (seconds < 60) return 'just now'
  const units: [number, string][] = [[60, 'minute'], [3600, 'hour'], [86400, 'day'], [604800, 'week']]
  for (let index = units.length - 1; index >= 0; index--) {
    const [size, unit] = units[index]!
    if (seconds >= size) {
      const count = Math.floor(seconds / size)
      return count > 4 && unit === 'week' ? new Date(time).toLocaleDateString() : `${count} ${unit}${count === 1 ? '' : 's'} ago`
    }
  }
  return ''
}
function fullDate(value: string) {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : ''
}
function channelLabel(id: string) {
  return channels.find(item => item.id === id)?.name ?? id
}
function syncUrl() {
  const url = new URL(window.location.href)
  if (channel.value === 'all') url.searchParams.delete('channel'); else url.searchParams.set('channel', channel.value)
  if (selected.value) url.searchParams.set('thread', selected.value.id); else url.searchParams.delete('thread')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
}
function fail(requestError: unknown, fallback: string) {
  error.value = requestError instanceof Error ? requestError.message : fallback
  if (requestError instanceof CommunityUnavailableError) unavailable.value = true
}

async function loadList(target = 1, quiet = false) {
  const requestId = ++generation
  if (!quiet) { loading.value = true; error.value = ''; unavailable.value = false }
  try {
    if (channel.value === 'known-issues') {
      const result = await communityRequest<CommunityPage<Issue>>(`/issues?page=${target}&pageSize=${pageSize}`, {}, false)
      if (requestId !== generation) return
      const term = search.value.trim().toLowerCase()
      issues.value = result.items.filter(issue => (statusFilter.value === 'all' || issue.status === statusFilter.value) &&
        (!term || `${issue.title} ${issue.body} ${issue.productId ?? ''}`.toLowerCase().includes(term)))
      total.value = result.total; page.value = result.page; threads.value = []
    } else {
      const params = new URLSearchParams({ page: String(target), pageSize: String(pageSize), channel: channel.value })
      if (search.value.trim()) params.set('q', search.value.trim())
      if (statusFilter.value !== 'all') params.set('status', statusFilter.value)
      const result = await communityRequest<CommunityPage<ForumThread> & { viewer: ForumViewer }>(
        `/forum?${params}`, { headers: authHeaders() }, false)
      if (requestId !== generation) return
      threads.value = result.items; total.value = result.total; page.value = result.page; viewer.value = result.viewer
    }
    error.value = ''; unavailable.value = false
  } catch (requestError) {
    if (requestId === generation && !quiet) { fail(requestError, 'Could not load Community Support.'); threads.value = []; issues.value = [] }
  } finally { if (requestId === generation && !quiet) loading.value = false }
}

async function openThread(id: string, quiet = false) {
  const requestId = ++generation
  if (!quiet) { loading.value = true; error.value = ''; notice.value = '' }
  try {
    const result = await communityRequest<{ thread: ForumThread; posts: ForumPost[]; viewer: ForumViewer }>(
      `/forum/${id}`, { headers: authHeaders() }, false)
    if (requestId !== generation) return
    const grew = result.posts.length !== posts.value.length
    selected.value = result.thread; posts.value = result.posts; viewer.value = result.viewer; composing.value = false
    syncUrl()
    if (!quiet || grew) { await nextTick(); messages.value?.scrollTo({ top: messages.value.scrollHeight, behavior: quiet ? 'smooth' : 'auto' }) }
  } catch (requestError) {
    if (requestId === generation && !quiet) { fail(requestError, 'Could not open this thread.'); selected.value = null }
  } finally { if (requestId === generation && !quiet) loading.value = false }
}

function selectChannel(id: ChannelId) {
  channel.value = id; selected.value = null; posts.value = []; composing.value = false; notice.value = ''
  if (id !== 'all' && id !== 'known-issues') newChannel.value = id
  syncUrl()
  if (statusFilter.value === 'answered' || statusFilter.value === 'investigating') statusFilter.value = 'all'
  else void loadList(1)
}
function closeThread() {
  selected.value = null; posts.value = []
  syncUrl()
  void loadList(page.value)
}
function startThread() {
  if (channel.value !== 'all' && channel.value !== 'known-issues') newChannel.value = channel.value
  if (!postableChannels.value.some(item => item.id === newChannel.value)) newChannel.value = 'help'
  selected.value = null; composing.value = true; notice.value = ''; error.value = ''
  syncUrl()
}

async function createThread() {
  if (busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await communityRequest<{ thread: ForumThread }>('/forum', {
      method: 'POST',
      body: JSON.stringify({ channel: newChannel.value, title: newTitle.value, body: newBody.value, productId: newProduct.value || undefined }),
    })
    newTitle.value = ''; newBody.value = ''; newProduct.value = ''; composing.value = false
    channel.value = result.thread.channel
    await openThread(result.thread.id)
    notice.value = 'Thread posted. Anyone can now read and reply.'
  } catch (requestError) { fail(requestError, 'Could not post your thread.') }
  finally { busy.value = false }
}

async function sendReply() {
  if (!selected.value || busy.value || !replyBody.value.trim()) return
  busy.value = true; error.value = ''
  const id = selected.value.id
  try {
    await communityRequest(`/forum/${id}/posts`, { method: 'POST', body: JSON.stringify({ body: replyBody.value }) })
    replyBody.value = ''
    await openThread(id, true)
  } catch (requestError) { fail(requestError, 'Could not send your reply.') }
  finally { busy.value = false }
}
function replyKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void sendReply() }
}

async function mutate(path: string, payload: Record<string, unknown>, message: string) {
  if (!selected.value || busy.value) return
  busy.value = true; error.value = ''; notice.value = ''
  const id = selected.value.id
  try {
    await communityRequest(path, { method: 'PUT', body: JSON.stringify(payload) })
    await openThread(id, true)
    notice.value = message
  } catch (requestError) { fail(requestError, 'Could not update this thread.') }
  finally { busy.value = false }
}
const setOwnStatus = (status: 'open' | 'resolved') =>
  mutate(`/forum/${selected.value!.id}`, { status }, status === 'resolved' ? 'Marked as resolved.' : 'Reopened.')
const moderate = (payload: Record<string, unknown>, message: string) =>
  mutate(`/staff/forum/${selected.value!.id}`, payload, message)
const moderatePost = (post: ForumPost) =>
  mutate(`/staff/forum/posts/${post.id}`, { hidden: !post.hidden }, post.hidden ? 'Message restored.' : 'Message hidden from the public.')

watch([search, statusFilter], () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { if (!selected.value) void loadList(1) }, 300)
})

function onSessionChange() {
  if (selected.value) void openThread(selected.value.id, true); else void loadList(page.value, true)
}
onMounted(() => {
  const params = new URLSearchParams(window.location.search)
  const requested = params.get('channel')
  if (requested && channels.some(item => item.id === requested)) channel.value = requested as ChannelId
  const thread = params.get('thread')
  if (thread && /^[0-9a-f-]{36}$/i.test(thread)) void openThread(thread); else void loadList(1)
  window.addEventListener('lumen-discord-user', onSessionChange)
  window.addEventListener('storage', onSessionChange)
  refreshTimer = setInterval(() => {
    if (document.visibilityState !== 'visible' || busy.value || unavailable.value) return
    if (selected.value) void openThread(selected.value.id, true)
    else if (!composing.value) void loadList(page.value, true)
  }, 30000)
})
onUnmounted(() => {
  generation++
  clearTimeout(searchTimer); clearInterval(refreshTimer)
  window.removeEventListener('lumen-discord-user', onSessionChange)
  window.removeEventListener('storage', onSessionChange)
})
</script>

<template>
  <section class="forum" aria-label="Community Support">
    <nav class="forum-sidebar" aria-label="Community channels">
      <div class="forum-server"><span class="forum-server-icon" aria-hidden="true">L</span><div><strong>Lumen Studios</strong><small>Community Support</small></div></div>
      <div v-for="group in groups" :key="group" class="forum-group">
        <p class="forum-group-name">{{ group }}</p>
        <button v-for="item in channels.filter(entry => entry.group === group)" :key="item.id" type="button" class="forum-channel"
          :class="{ active: channel === item.id }" :aria-current="channel === item.id ? 'page' : undefined" @click="selectChannel(item.id)">
          <span class="forum-hash" aria-hidden="true">{{ item.icon }}</span>{{ item.name }}
        </button>
      </div>
      <a class="forum-private" href="/account/tickets">🔒 Private ticket instead</a>
    </nav>

    <div class="forum-main">
      <header class="forum-topbar">
        <div class="forum-topic">
          <h2><span aria-hidden="true">{{ current.icon }}</span> {{ selected ? selected.title : composing ? 'New thread' : current.name }}</h2>
          <p>{{ selected ? `in #${channelLabel(selected.channel)}` : current.topic }}</p>
        </div>
        <div v-if="!selected && !composing" class="forum-tools">
          <input v-model="search" type="search" maxlength="100" placeholder="Search threads" aria-label="Search threads">
          <select v-model="statusFilter" aria-label="Filter by status">
            <option value="all">All statuses</option><option value="open">Open</option>
            <option v-if="channel !== 'known-issues'" value="answered">Answered</option>
            <option v-if="channel === 'known-issues'" value="investigating">Investigating</option>
            <option value="resolved">Resolved</option>
          </select>
          <button v-if="canPostHere" type="button" class="forum-new" :disabled="unavailable" @click="startThread">+ New thread</button>
        </div>
        <button v-else type="button" class="forum-back" @click="composing = false; selected ? closeThread() : loadList(page)">← Back</button>
      </header>

      <p v-if="error" class="website-message" :class="{ 'website-error': !unavailable }" :role="unavailable ? 'status' : 'alert'">{{ error }}
        <button v-if="unavailable" type="button" @click="selected ? openThread(selected.id) : loadList(page)">Try again</button></p>
      <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
      <p v-if="loading" class="website-note forum-loading" role="status">Loading conversations…</p>

      <form v-if="composing" class="forum-compose-thread" @submit.prevent="createThread">
        <p v-if="!signedIn" class="website-message">Use <strong>Log in</strong> in the header to connect Discord, then start a thread.</p>
        <div class="forum-compose-row">
          <label>Channel<select v-model="newChannel"><option v-for="item in postableChannels" :key="item.id" :value="item.id">#{{ item.name }}</option></select></label>
          <label>Plugin<select v-model="newProduct"><option value="">General / no plugin</option><option v-for="product in products" :key="product.id" :value="product.id">{{ product.name }}</option></select></label>
        </div>
        <label>Title<input v-model="newTitle" required minlength="3" maxlength="160" placeholder="Short summary, e.g. Crates won't open on 1.21"></label>
        <label>Message<textarea v-model="newBody" required minlength="2" maxlength="8000" rows="6" placeholder="Plugin and server versions, what you expected, what happened. Never share license keys or tokens."></textarea></label>
        <p class="website-note">Posts are public and show your Discord display name. Staff may hide posts that break the rules.</p>
        <div class="website-actions"><button class="website-primary" type="submit" :disabled="busy || !signedIn || unavailable">Post thread</button><button type="button" @click="composing = false">Cancel</button></div>
      </form>

      <template v-else-if="selected">
        <div v-if="viewer.staff" class="forum-modbar" role="group" aria-label="Staff moderation">
          <span class="ticket-support-badge">Staff tools</span>
          <button type="button" :disabled="busy" @click="moderate({ pinned: !selected.pinned }, selected.pinned ? 'Unpinned.' : 'Pinned to the top.')">{{ selected.pinned ? 'Unpin' : 'Pin' }}</button>
          <button type="button" :disabled="busy" @click="moderate({ locked: !selected.locked }, selected.locked ? 'Thread unlocked.' : 'Thread locked.')">{{ selected.locked ? 'Unlock' : 'Lock' }}</button>
          <button type="button" :disabled="busy" @click="moderate({ hidden: !selected.hidden }, selected.hidden ? 'Thread restored.' : 'Thread hidden from the public.')">{{ selected.hidden ? 'Restore thread' : 'Hide thread' }}</button>
          <select :value="selected.status" aria-label="Thread status" :disabled="busy" @change="moderate({ status: ($event.target as HTMLSelectElement).value }, 'Status updated.')">
            <option value="open">Open</option><option value="answered">Answered</option><option value="resolved">Resolved</option>
          </select>
        </div>
        <div ref="messages" class="forum-messages" aria-live="polite">
          <div class="forum-thread-meta">
            <span class="website-badge" :data-status="selected.status">{{ selected.status }}</span>
            <span v-if="selected.pinned" class="website-badge">📌 Pinned</span>
            <span v-if="selected.locked" class="website-badge">🔒 Locked</span>
            <span v-if="selected.hidden" class="website-badge" data-status="outage">Hidden</span>
            <span v-if="selected.productId" class="website-badge">{{ productName(selected.productId) }}</span>
          </div>
          <article class="forum-message" :class="{ 'forum-message-staff': selected.author.staff }">
            <span class="forum-avatar" :style="{ '--avatar-hue': hue(selected.author.name) }" aria-hidden="true">{{ initials(selected.author.name) }}</span>
            <div class="forum-message-body">
              <p class="forum-author"><strong>{{ selected.author.name }}</strong><span v-if="selected.author.staff" class="ticket-support-badge">Support</span><span class="forum-op">OP</span><time :datetime="selected.createdAt" :title="fullDate(selected.createdAt)">{{ relative(selected.createdAt) }}</time></p>
              <p class="forum-text">{{ selected.body }}</p>
            </div>
          </article>
          <div v-if="posts.length" class="forum-divider"><span>{{ selected.replyCount }} {{ selected.replyCount === 1 ? 'reply' : 'replies' }}</span></div>
          <article v-for="post in posts" :key="post.id" class="forum-message" :class="{ 'forum-message-staff': post.staff, 'forum-message-hidden': post.hidden }">
            <span class="forum-avatar" :style="{ '--avatar-hue': hue(post.authorName) }" aria-hidden="true">{{ initials(post.authorName) }}</span>
            <div class="forum-message-body">
              <p class="forum-author"><strong>{{ post.authorName }}</strong><span v-if="post.staff" class="ticket-support-badge">Support</span><time :datetime="post.createdAt" :title="fullDate(post.createdAt)">{{ relative(post.createdAt) }}</time>
                <button v-if="viewer.staff" type="button" class="forum-post-mod" :disabled="busy" @click="moderatePost(post)">{{ post.hidden ? 'Restore' : 'Hide' }}</button></p>
              <p class="forum-text">{{ post.body }}</p>
            </div>
          </article>
          <p v-if="!posts.length" class="forum-empty">No replies yet. Be the first to help.</p>
        </div>
        <div v-if="selected.mine && !viewer.staff" class="forum-owner">
          <button v-if="selected.status !== 'resolved'" type="button" :disabled="busy" @click="setOwnStatus('resolved')">✓ Mark as resolved</button>
          <button v-else type="button" :disabled="busy" @click="setOwnStatus('open')">Reopen thread</button>
        </div>
        <form class="forum-composer" @submit.prevent="sendReply">
          <p v-if="!signedIn" class="forum-composer-locked">Use <strong>Log in</strong> in the header to join the conversation.</p>
          <p v-else-if="selected.locked && !viewer.staff" class="forum-composer-locked">🔒 This thread is locked by staff.</p>
          <template v-else>
            <textarea v-model="replyBody" rows="1" maxlength="4000" :placeholder="`Message #${channelLabel(selected.channel)}`" aria-label="Reply" @keydown="replyKeydown"></textarea>
            <button type="submit" class="forum-send" :disabled="busy || !replyBody.trim() || unavailable" aria-label="Send reply">➤</button>
          </template>
        </form>
      </template>

      <template v-else-if="!loading">
        <ul v-if="channel === 'known-issues'" class="forum-list">
          <li v-for="issue in issues" :key="issue.id" class="forum-row forum-row-static">
            <span class="forum-avatar forum-avatar-brand" aria-hidden="true">L</span>
            <div class="forum-row-body">
              <p class="forum-row-title">{{ issue.title }}</p>
              <p class="forum-row-preview">{{ issue.body }}</p>
              <p class="forum-row-meta"><span class="website-badge" :data-status="issue.status">{{ issue.status }}</span><span v-if="issue.productId">{{ productName(issue.productId) }}</span><span>Updated {{ relative(issue.updatedAt) }}</span></p>
            </div>
          </li>
        </ul>
        <ul v-else class="forum-list">
          <li v-for="thread in threads" :key="thread.id">
            <button type="button" class="forum-row" :class="{ 'forum-row-pinned': thread.pinned }" @click="openThread(thread.id)">
              <span class="forum-avatar" :style="{ '--avatar-hue': hue(thread.author.name) }" aria-hidden="true">{{ initials(thread.author.name) }}</span>
              <span class="forum-row-body">
                <span class="forum-row-title"><span v-if="thread.pinned" aria-label="Pinned">📌 </span><span v-if="thread.locked" aria-label="Locked">🔒 </span>{{ thread.title }}</span>
                <span class="forum-row-preview">{{ thread.body }}</span>
                <span class="forum-row-meta">
                  <span class="website-badge" :data-status="thread.status">{{ thread.status }}</span>
                  <span v-if="thread.hidden" class="website-badge" data-status="outage">Hidden</span>
                  <strong>{{ thread.author.name }}</strong><span v-if="thread.author.staff" class="ticket-support-badge">Support</span>
                  <span v-if="channel === 'all'">#{{ channelLabel(thread.channel) }}</span>
                  <span v-if="thread.productId">{{ productName(thread.productId) }}</span>
                </span>
              </span>
              <span class="forum-row-stats"><span>💬 {{ thread.replyCount }}</span><time :datetime="thread.lastActivityAt" :title="fullDate(thread.lastActivityAt)">{{ relative(thread.lastActivityAt) }}</time></span>
            </button>
          </li>
        </ul>
        <div v-if="!error && !(channel === 'known-issues' ? issues.length : threads.length)" class="forum-empty">
          <p><strong>{{ search || statusFilter !== 'all' ? 'No threads match your filters.' : channel === 'known-issues' ? 'No staff-published known issues right now.' : 'No threads here yet.' }}</strong></p>
          <p v-if="canPostHere && !search">Start the conversation. Everyone signed in with Discord can post.</p>
        </div>
        <div v-if="pages > 1" class="forum-pager">
          <button type="button" :disabled="page <= 1" @click="loadList(page - 1)">← Newer</button><span>Page {{ page }} of {{ pages }}</span><button type="button" :disabled="page >= pages" @click="loadList(page + 1)">Older →</button>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.forum { --forum-accent: var(--vp-c-brand-1); --forum-side: var(--vp-c-bg-alt); display: grid; grid-template-columns: 236px minmax(0, 1fr); margin-top: 24px; min-height: 620px; overflow: hidden; border: 1px solid var(--vp-c-divider); border-radius: 18px; background: var(--vp-c-bg); box-shadow: 0 24px 60px -36px rgba(91, 39, 194, 0.55); }
.forum-sidebar { display: flex; flex-direction: column; gap: 4px; padding: 14px 10px; background: var(--forum-side); border-right: 1px solid var(--vp-c-divider); }
.forum-server { display: flex; gap: 10px; align-items: center; margin: 0 4px 10px; padding-bottom: 12px; border-bottom: 1px solid var(--vp-c-divider); }
.forum-server strong, .forum-server small { display: block; line-height: 1.3; }
.forum-server small { color: var(--vp-c-text-2); font-size: 12px; }
.forum-server-icon { display: grid; place-items: center; flex: none; width: 38px; height: 38px; border-radius: 12px; color: #fff; font-weight: 800; background: linear-gradient(135deg, #a855f7, #6b32df); }
.forum-group { display: flex; flex-direction: column; gap: 2px; margin-top: 6px; }
.forum-group-name { margin: 6px 8px 2px; color: var(--vp-c-text-3); font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
.forum-channel { display: flex; gap: 8px; align-items: center; width: 100%; padding: 7px 10px; border-radius: 8px; color: var(--vp-c-text-2); font-size: 14px; font-weight: 500; text-align: left; transition: background 0.15s, color 0.15s; }
.forum-channel:hover { color: var(--vp-c-text-1); background: var(--vp-c-default-soft); }
.forum-channel.active { color: var(--vp-c-text-1); background: var(--vp-c-brand-soft); box-shadow: inset 3px 0 0 var(--forum-accent); font-weight: 650; }
.forum-hash { width: 18px; color: var(--vp-c-text-3); text-align: center; font-weight: 700; }
.forum-private { margin-top: auto; padding: 10px; border-radius: 8px; font-size: 13px; text-decoration: none; }
.forum-private:hover { background: var(--vp-c-default-soft); }
.forum-main { display: flex; flex-direction: column; min-width: 0; }
.forum-topbar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--vp-c-divider); }
.forum-topic { min-width: 0; }
.forum-topic h2 { margin: 0; padding: 0; border: 0; font-size: 18px; line-height: 1.35; overflow-wrap: anywhere; }
.forum-topic p { margin: 2px 0 0; color: var(--vp-c-text-2); font-size: 13px; line-height: 1.4; }
.forum-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.forum-tools input, .forum-tools select, .forum-compose-thread input, .forum-compose-thread select, .forum-compose-thread textarea, .forum-modbar select { min-height: 36px; padding: 6px 10px; border: 1px solid var(--vp-c-divider); border-radius: 10px; color: var(--vp-c-text-1); background: var(--vp-c-bg-soft); font: inherit; font-size: 14px; }
.forum-tools input { width: 190px; max-width: 100%; }
.forum-new, .forum-send { border-radius: 10px; color: #fff; font-weight: 650; background: linear-gradient(135deg, #8b5cf6, #6b32df); }
.forum-new { padding: 8px 14px; font-size: 14px; }
.forum-new:disabled, .forum-send:disabled { opacity: 0.5; cursor: not-allowed; }
.forum-back, .forum-modbar button, .forum-owner button, .forum-pager button, .forum-post-mod, .website-message button { padding: 6px 12px; border: 1px solid var(--vp-c-divider); border-radius: 9px; font-size: 13px; font-weight: 600; background: var(--vp-c-bg-soft); }
.forum-back:hover, .forum-modbar button:hover:not(:disabled), .forum-owner button:hover:not(:disabled), .forum-pager button:hover:not(:disabled) { border-color: var(--forum-accent); color: var(--forum-accent); }
.forum-main > .website-message, .forum-loading { margin: 12px 18px 0; }
.forum-list { flex: 1; margin: 0; padding: 8px; list-style: none; }
.forum-list li { margin: 0; }
.forum-row { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: start; width: 100%; padding: 12px; border-radius: 12px; color: inherit; text-align: left; transition: background 0.15s; }
button.forum-row:hover { background: var(--vp-c-default-soft); }
.forum-row-pinned { background: var(--vp-c-brand-soft); }
.forum-row-static { grid-template-columns: auto minmax(0, 1fr); }
.forum-row-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.forum-row-title { margin: 0; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.forum-row-preview { display: -webkit-box; margin: 0; overflow: hidden; color: var(--vp-c-text-2); font-size: 14px; line-height: 1.5; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow-wrap: anywhere; }
.forum-row-static .forum-row-preview { display: block; white-space: pre-wrap; -webkit-line-clamp: unset; }
.forum-row-meta { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; margin: 4px 0 0; color: var(--vp-c-text-2); font-size: 12.5px; }
.forum-row-stats { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; color: var(--vp-c-text-2); font-size: 12.5px; white-space: nowrap; }
.forum-avatar { --avatar-hue: 270; display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 50%; color: #fff; font-size: 14px; font-weight: 800; background: linear-gradient(135deg, hsl(var(--avatar-hue) 70% 58%), hsl(calc(var(--avatar-hue) + 25) 65% 42%)); }
.forum-avatar-brand { background: linear-gradient(135deg, #a855f7, #6b32df); }
.forum-messages { flex: 1; max-height: 560px; padding: 14px 18px; overflow-y: auto; }
.forum-thread-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.forum-message { display: flex; gap: 12px; margin: 0 -8px; padding: 10px 8px; border-radius: 12px; }
.forum-message:hover { background: var(--vp-c-default-soft); }
.forum-message-staff { background: var(--vp-c-brand-soft); box-shadow: inset 3px 0 0 var(--forum-accent); }
.forum-message-hidden { opacity: 0.55; }
.forum-message-body { min-width: 0; flex: 1; }
.forum-author { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; margin: 0; line-height: 1.4; }
.forum-message-staff .forum-author strong { color: var(--forum-accent); }
.forum-author time { color: var(--vp-c-text-3); font-size: 12px; }
.forum-op { padding: 0 6px; border-radius: 6px; color: var(--vp-c-text-2); font-size: 11px; font-weight: 700; background: var(--vp-c-default-soft); }
.forum-post-mod { margin-left: auto; padding: 2px 8px; font-size: 12px; }
.forum-text { margin: 4px 0 0; line-height: 1.6; white-space: pre-wrap; overflow-wrap: anywhere; }
.forum-divider { display: flex; align-items: center; gap: 10px; margin: 14px 0 6px; color: var(--vp-c-text-3); font-size: 12px; font-weight: 700; text-transform: uppercase; }
.forum-divider::before, .forum-divider::after { content: ''; flex: 1; height: 1px; background: var(--vp-c-divider); }
.forum-modbar, .forum-owner { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 10px 18px; border-bottom: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft); }
.forum-owner { border-top: 1px solid var(--vp-c-divider); border-bottom: 0; }
.forum-composer { display: flex; gap: 8px; align-items: flex-end; margin: 0 14px 14px; padding: 8px 8px 8px 14px; border: 1px solid var(--vp-c-divider); border-radius: 14px; background: var(--vp-c-bg-soft); }
.forum-composer:focus-within { border-color: var(--forum-accent); box-shadow: 0 0 0 3px var(--vp-c-brand-soft); }
.forum-composer textarea { flex: 1; min-height: 38px; max-height: 180px; padding: 8px 0; border: 0; color: var(--vp-c-text-1); background: transparent; font: inherit; resize: vertical; outline: none; }
.forum-send { width: 40px; height: 40px; flex: none; font-size: 16px; }
.forum-composer-locked { margin: 6px 0; color: var(--vp-c-text-2); font-size: 14px; }
.forum-compose-thread { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
.forum-compose-thread label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 650; }
.forum-compose-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; }
.forum-empty { padding: 40px 18px; color: var(--vp-c-text-2); text-align: center; }
.forum-empty p { margin: 4px 0; }
.forum-pager { display: flex; gap: 12px; align-items: center; justify-content: center; padding: 12px; border-top: 1px solid var(--vp-c-divider); font-size: 13px; }
@media (max-width: 760px) {
  .forum { grid-template-columns: 1fr; min-height: 0; }
  .forum-sidebar { flex-direction: row; gap: 6px; padding: 10px; overflow-x: auto; border-right: 0; border-bottom: 1px solid var(--vp-c-divider); }
  .forum-server, .forum-group-name { display: none; }
  .forum-group { flex-direction: row; gap: 6px; margin: 0; }
  .forum-channel { width: auto; white-space: nowrap; }
  .forum-private { margin: 0; white-space: nowrap; }
  .forum-tools, .forum-tools input { width: 100%; }
  .forum-tools input { flex: 1 1 100%; }
  .forum-row { grid-template-columns: auto minmax(0, 1fr); }
  .forum-row-stats { grid-column: 2; flex-direction: row; gap: 12px; align-items: center; }
  .forum-avatar { width: 34px; height: 34px; font-size: 12px; }
  .forum-messages { max-height: none; padding: 12px; }
}
</style>
