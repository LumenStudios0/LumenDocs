<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'
import { getDiscordSession } from './discord-session'
import { communityRequest, communityDate, type CommunityPage, type Issue, type Notification, type Preferences, type Reply, type Service, type Ticket } from './community-api'
import pluginData from './plugin-compatibility-data.json'

const props = defineProps<{ mode: 'tickets' | 'issues' | 'notifications' | 'status' }>()
const { frontmatter } = useData()
const signedIn = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const notice = ref('')
const page = ref(1)
const total = ref(0)
const tickets = ref<Ticket[]>([])
const issues = ref<Issue[]>([])
const notifications = ref<Notification[]>([])
const services = ref<Service[]>([])
const preferences = ref<Preferences>({ updates: true, announcements: true, ticketReplies: true, products: [] })
const customTopics = ref('')
const selected = ref<Ticket | null>(null)
const replies = ref<Reply[]>([])
const reply = ref('')
const title = ref('')
const body = ref('')
const productId = ref('')
const type = ref('support')
let generation = 0
let token = ''
let deepLinkHandled = false
let timer: ReturnType<typeof setInterval> | undefined
const headers = {
  tickets: ['YOUR SUPPORT WORKSPACE', 'Your tickets, on the website.', 'Create a private ticket and follow staff replies here. Do not include license keys, passwords, or access tokens.'],
  issues: ['KNOWN ISSUES', 'Confirmed issues. Clear workarounds.', 'Published issues are reviewed by staff. Connect Discord to submit a bug; your submission stays private until staff publish a sanitized issue.'],
  notifications: ['YOUR NOTIFICATION CENTER', 'Updates you choose to receive.', 'In-app announcements, plugin updates, and ticket replies. Preferences do not send email or Discord messages.'],
  status: ['SERVICE HEALTH', 'Lumen service status.', 'Automatic probes run every five minutes. Staff can add a maintenance notice or override a status; the automatic result remains visible.'],
}

function session() {
  try { token = getDiscordSession(); signedIn.value = !!token }
  catch (sessionError) { error.value = String(sessionError); signedIn.value = false }
}
async function load(target = 1, quiet = false) {
  const requestId = ++generation
  if (!quiet) { loading.value = true; error.value = ''; notice.value = '' }
  selected.value = null
  replies.value = []
  session()
  try {
    if (props.mode === 'status') {
      const result = await communityRequest<{ services: Service[]; intervalMinutes: number }>('/status', {}, false)
      if (requestId === generation) services.value = result.services
    } else if (props.mode === 'issues') {
      const result = await communityRequest<CommunityPage<Issue>>(`/issues?page=${target}&pageSize=20`, {}, false)
      if (requestId === generation) { issues.value = result.items; total.value = result.total; page.value = result.page }
    } else if (signedIn.value && props.mode === 'tickets') {
      const result = await communityRequest<CommunityPage<Ticket>>(`/tickets?page=${target}&pageSize=20`)
      if (requestId === generation) { tickets.value = result.items; total.value = result.total; page.value = result.page }
      const requested = new URLSearchParams(window.location.search).get('ticket')
      if (requestId === generation && !deepLinkHandled && requested && /^[0-9a-f-]{36}$/.test(requested)) {
        deepLinkHandled = true
        await openTicket(requested)
      }
    } else if (signedIn.value && props.mode === 'notifications') {
      const [result, settings] = await Promise.all([
        communityRequest<CommunityPage<Notification>>(`/notifications?page=${target}&pageSize=20`),
        communityRequest<{ preferences: Preferences }>('/preferences'),
      ])
      if (requestId === generation) {
        notifications.value = result.items; total.value = result.total; page.value = result.page
        preferences.value = settings.preferences
        customTopics.value = settings.preferences.products.filter(id => !pluginData.plugins.some(plugin => plugin.id === id)).join(', ')
      }
    }
  } catch (requestError) {
    if (requestId === generation) {
      error.value = requestError instanceof Error ? requestError.message : 'Could not load website data.'
      if (!quiet) { tickets.value = []; issues.value = []; notifications.value = []; services.value = [] }
    }
  } finally { if (requestId === generation && !quiet) loading.value = false }
}
async function openTicket(id: string) {
  const requestId = ++generation
  loading.value = true
  error.value = ''
  selected.value = null
  try {
    const result = await communityRequest<{ ticket: Ticket; replies: Reply[] }>(`/tickets/${id}`)
    if (requestId === generation) { selected.value = result.ticket; replies.value = result.replies; reply.value = '' }
  } catch (requestError) { if (requestId === generation) error.value = requestError instanceof Error ? requestError.message : 'Could not open ticket.' }
  finally { if (requestId === generation) loading.value = false }
}
async function submit() {
  if (submitting.value) return
  submitting.value = true
  error.value = ''
  notice.value = ''
  const captured = getDiscordSession()
  try {
    if (props.mode === 'issues') {
      const result = await communityRequest<{ submissionId: string; message: string }>('/issues', {
        method: 'POST', body: JSON.stringify({ title: title.value, body: body.value, productId: productId.value || undefined }),
      })
      if (captured !== getDiscordSession()) return
      notice.value = `${result.message || 'Bug submitted for staff review.'} View your private ticket in My tickets.`
    } else {
      const result = await communityRequest<{ ticket: Ticket }>('/tickets', {
        method: 'POST', body: JSON.stringify({ type: type.value, title: title.value, body: body.value, productId: productId.value || undefined }),
      })
      if (captured !== getDiscordSession()) return
      await load(1)
      await openTicket(result.ticket.id)
      notice.value = 'Your ticket has been saved on the website.'
    }
    title.value = ''; body.value = ''; productId.value = ''
  } catch (requestError) { if (captured === getDiscordSession()) error.value = requestError instanceof Error ? requestError.message : 'Submission failed.' }
  finally { submitting.value = false }
}
async function sendReply() {
  if (!selected.value || submitting.value) return
  const id = selected.value.id
  const captured = getDiscordSession()
  submitting.value = true; error.value = ''
  try {
    await communityRequest(`/tickets/${id}/replies`, { method: 'POST', body: JSON.stringify({ body: reply.value }) })
    if (captured !== getDiscordSession()) return
    await openTicket(id)
  } catch (requestError) { if (captured === getDiscordSession()) error.value = requestError instanceof Error ? requestError.message : 'Could not send reply.' }
  finally { submitting.value = false }
}
async function savePreferences() {
  submitting.value = true; error.value = ''; notice.value = ''
  const captured = getDiscordSession()
  try {
    const productIds = [...new Set([...preferences.value.products.filter(id => pluginData.plugins.some(plugin => plugin.id === id)), ...customTopics.value.split(',').map(value => value.trim()).filter(Boolean)])]
    const result = await communityRequest<{ preferences: Preferences }>('/preferences', {
      method: 'PUT', body: JSON.stringify({ ...preferences.value, products: productIds }),
    })
    if (captured !== getDiscordSession()) return
    preferences.value = result.preferences
    await load(1)
    notice.value = 'Notification preferences saved.'
  } catch (requestError) { if (captured === getDiscordSession()) error.value = requestError instanceof Error ? requestError.message : 'Could not save preferences.' }
  finally { submitting.value = false }
}
async function markRead(notification: Notification) {
  const captured = getDiscordSession()
  error.value = ''
  try {
    await communityRequest(`/notifications/${notification.id}/read`, { method: 'POST' })
    if (captured === getDiscordSession()) notification.read = true
  } catch (requestError) { if (captured === getDiscordSession()) error.value = requestError instanceof Error ? requestError.message : 'Could not mark notification read.' }
}
function changedSession() {
  let current = ''
  try { current = getDiscordSession() } catch (sessionError) { console.error('Unable to read website session:', sessionError) }
  if (current === token) return
  generation++
  tickets.value = []; notifications.value = []; selected.value = null; replies.value = []
  title.value = ''; body.value = ''; reply.value = ''; notice.value = ''
  void load()
}
onMounted(() => {
  void load()
  window.addEventListener('lumen-discord-user', changedSession)
  if (props.mode === 'status') timer = setInterval(() => { if (!document.hidden && !loading.value) void load(1, true) }, 5 * 60000)
})
onUnmounted(() => { generation++; clearInterval(timer); window.removeEventListener('lumen-discord-user', changedSession) })
</script>

<template>
  <section class="website-workspace" :aria-label="String(frontmatter.title || headers[mode][1])">
    <header><p class="website-kicker">{{ headers[mode][0] }}</p><h2>{{ headers[mode][1] }}</h2><p class="website-note">{{ headers[mode][2] }}</p><button type="button" :disabled="loading || submitting" @click="load(page)">{{ loading ? 'Loading…' : 'Refresh' }}</button></header>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
    <p v-if="loading" class="website-note" role="status">Loading website data…</p>
    <p v-if="!signedIn && mode !== 'status'" class="website-message">Use <strong>Log in</strong> in the header to connect your Discord account {{ mode === 'issues' ? 'before submitting a bug.' : 'to view your private workspace.' }}</p>

    <template v-if="mode === 'tickets' && signedIn">
      <section v-if="selected" class="website-panel">
        <button type="button" :disabled="loading || submitting" @click="load(page)">← All my tickets</button>
        <h3>{{ selected.title }}</h3><p class="website-meta"><span class="website-badge">{{ selected.status }}</span>{{ selected.type }} · {{ selected.productId || 'General' }} · {{ communityDate(selected.createdAt) }}</p>
        <p class="website-body">{{ selected.body }}</p>
        <div class="website-list"><article v-for="item in replies" :key="item.id"><p class="website-meta">{{ item.staff ? 'Staff' : 'Customer' }} · {{ item.authorName }} · {{ communityDate(item.createdAt) }}</p><p class="website-body">{{ item.body }}</p></article></div>
        <form v-if="selected.status !== 'closed'" @submit.prevent="sendReply"><label>Reply<textarea v-model="reply" required maxlength="4000" rows="4" :disabled="submitting" /></label><button class="website-primary" type="submit" :disabled="submitting || !reply.trim()">Send reply</button></form>
        <p v-else class="website-note">This ticket is closed. Create a new ticket if you need further help.</p>
      </section>
      <template v-else>
        <details class="website-panel"><summary>Create a ticket</summary><form @submit.prevent="submit"><label>Type<select v-model="type"><option value="support">Support</option><option value="bug">Bug report</option><option value="compatibility">Compatibility</option><option value="feature">Feature request</option></select></label><label>Title<input v-model="title" required maxlength="120"></label><label>Plugin / product ID (optional)<input v-model="productId" maxlength="100"></label><label>Details<textarea v-model="body" required maxlength="4000" rows="6" placeholder="Describe the issue and reproduction steps. Remove credentials from logs."></textarea></label><button class="website-primary" type="submit" :disabled="submitting">Create website ticket</button></form></details>
        <div class="website-list"><article v-for="ticket in tickets" :key="ticket.id"><p class="website-meta"><span class="website-badge">{{ ticket.status }}</span>{{ ticket.type }} · {{ communityDate(ticket.updatedAt) }}</p><h3>{{ ticket.title }}</h3><button type="button" :disabled="loading || submitting" @click="openTicket(ticket.id)">Open conversation →</button></article></div>
        <p v-if="!loading && !error && !tickets.length" class="website-note">No tickets on this page.</p>
      </template>
    </template>

    <template v-if="mode === 'issues'">
      <details v-if="signedIn" class="website-panel"><summary>Submit a bug for staff review</summary><form @submit.prevent="submit"><label>Short title<input v-model="title" required maxlength="120"></label><label>Plugin / product ID<input v-model="productId" maxlength="100"></label><label>What happened?<textarea v-model="body" required maxlength="4000" rows="6" placeholder="Expected result, actual result, exact plugin/server versions, and reproduction steps. No secrets."></textarea></label><button class="website-primary" type="submit" :disabled="submitting">Submit bug</button><p class="website-note">Your Discord identity is verified server-side. Reports create private website tickets and are not public until staff review.</p></form></details>
      <div class="website-list"><article v-for="issue in issues" :key="issue.id"><p class="website-meta"><span class="website-badge">{{ issue.status }}</span>{{ issue.productId || 'General' }} · Updated {{ communityDate(issue.updatedAt) }}</p><h3>{{ issue.title }}</h3><p class="website-body">{{ issue.body }}</p></article></div>
      <p v-if="!loading && !error && !issues.length" class="website-note">No staff-published issues on this page. This is not a guarantee that every plugin is bug-free.</p>
      <a href="/account/tickets">View my submissions and tickets →</a>
    </template>

    <template v-if="mode === 'notifications' && signedIn">
      <details class="website-panel"><summary>Notification preferences</summary><form @submit.prevent="savePreferences"><label class="website-check"><input v-model="preferences.updates" type="checkbox">Plugin update notifications</label><label class="website-check"><input v-model="preferences.announcements" type="checkbox">Studio announcements</label><label class="website-check"><input v-model="preferences.ticketReplies" type="checkbox">Replies to my support tickets</label><fieldset><legend>Plugin topics</legend><p class="website-note">Select the plugins you want updates for. Leave all unchecked to receive every plugin topic. This does not change ownership or licenses.</p><div class="website-columns"><label v-for="plugin in pluginData.plugins" :key="plugin.id" class="website-check"><input v-model="preferences.products" type="checkbox" :value="plugin.id">{{ plugin.name }}</label></div></fieldset><label>Additional topic IDs (optional)<input v-model="customTopics" maxlength="1000" placeholder="Comma-separated topic IDs"></label><button class="website-primary" type="submit" :disabled="submitting">Save preferences</button></form></details>
      <div class="website-list"><article v-for="item in notifications" :key="item.id"><p class="website-meta"><span class="website-badge">{{ item.kind }}</span>{{ item.read ? 'Read' : 'Unread' }} · {{ item.productId || 'Studio' }} · {{ communityDate(item.createdAt) }}</p><h3>{{ item.title }}</h3><p class="website-body">{{ item.body }}</p><div class="website-actions"><a v-if="item.link && item.link.startsWith('/') && !item.link.startsWith('//')" :href="item.link">View details →</a><button v-if="!item.read" type="button" @click="markRead(item)">Mark read</button></div></article></div>
      <p v-if="!loading && !error && !notifications.length" class="website-note">No notifications match your preferences on this page.</p>
    </template>

    <template v-if="mode === 'status'">
      <div class="website-list"><article v-for="service in services" :key="service.id"><p class="website-meta"><span class="website-badge" :data-status="service.status">{{ service.status }}</span>{{ service.overrideStatus ? 'Staff override' : 'Automatic result' }}</p><h3>{{ service.name }}</h3><p v-if="service.message" class="website-body">{{ service.message }}</p><p class="website-note">Last automatic check: {{ communityDate(service.checkedAt) }} · Automatic result: {{ service.automaticStatus }}</p></article></div>
      <p class="website-note">This page refreshes every five minutes while visible. Checks cover service reachability, not every feature or Minecraft server.</p>
    </template>
    <div v-if="mode !== 'status' && !selected && total > 20" class="website-pagination"><button type="button" :disabled="loading || submitting || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }} / {{ Math.ceil(total / 20) }}</span><button type="button" :disabled="loading || submitting || page * 20 >= total" @click="load(page + 1)">Next</button></div>
  </section>
</template>
