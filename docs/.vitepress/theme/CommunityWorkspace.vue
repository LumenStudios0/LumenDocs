<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useData } from 'vitepress'
import { getDiscordSession } from './discord-session'
import { communityRequest, communityDate, type CommunityPage, type Issue, type Notification, type Preferences, type Reply, type Service, type Ticket } from './community-api'
import pluginData from './plugin-compatibility-data.json'
import { CommunityUnavailableError } from './community-errors.mjs'

const props = defineProps<{ mode: 'tickets' | 'issues' | 'notifications' | 'status' }>()
const { frontmatter } = useData()
const signedIn = ref(false)
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const notice = ref('')
const serviceReady = ref(false)
const serviceUnavailable = ref(false)
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
const showComposer = ref(false)
const serverSoftware = ref('')
const minecraftVersion = ref('')
const editing = ref(false)
const editTitle = ref('')
const editBody = ref('')
let generation = 0
let token = ''
let deepLinkHandled = false
let timer: ReturnType<typeof setInterval> | undefined
const headers = {
  tickets: ['YOUR SUPPORT WORKSPACE', 'Your tickets, on the website.', 'Create a private ticket and follow staff replies here. Do not include license keys, passwords, or access tokens.'],
  issues: ['KNOWN ISSUES', 'Confirmed issues. Clear workarounds.', 'Published issues are reviewed by staff. Connect Discord to submit a bug; your submission stays private until staff publish a sanitized issue.'],
  notifications: ['YOUR NOTIFICATION CENTER', 'Updates you choose to receive.', 'In-app announcements, plugin updates, and ticket replies. Preferences do not send email or Discord messages.'],
  status: ['SERVICE HEALTH', 'Lumen service status.', 'When the website service is connected, automatic probes run every five minutes. Staff can add a maintenance notice or override a status.'],
}

function session() {
  try { token = getDiscordSession(); signedIn.value = !!token }
  catch (sessionError) { error.value = String(sessionError); signedIn.value = false }
}
function checkAvailabilityError(requestError: unknown) {
  if (requestError instanceof CommunityUnavailableError) {
    serviceReady.value = false
    serviceUnavailable.value = true
  }
}
async function load(target = 1, quiet = false) {
  const requestId = ++generation
  if (!quiet) { loading.value = true; error.value = ''; notice.value = ''; serviceReady.value = false; serviceUnavailable.value = false }
  selected.value = null
  replies.value = []
  session()
  try {
    if (props.mode === 'status') {
      const result = await communityRequest<{ services: Service[]; intervalMinutes: number }>('/status', {}, false)
      if (requestId === generation) { services.value = result.services; serviceReady.value = true }
    } else if (props.mode === 'issues') {
      const result = await communityRequest<CommunityPage<Issue>>(`/issues?page=${target}&pageSize=20`, {}, false)
      if (requestId === generation) { issues.value = result.items; total.value = result.total; page.value = result.page; serviceReady.value = true }
    } else if (signedIn.value && props.mode === 'tickets') {
      const result = await communityRequest<CommunityPage<Ticket>>(`/tickets?page=${target}&pageSize=20`)
      if (requestId === generation) { tickets.value = result.items; total.value = result.total; page.value = result.page; serviceReady.value = true }
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
        serviceReady.value = true
        customTopics.value = settings.preferences.products.filter(id => !pluginData.plugins.some(plugin => plugin.id === id)).join(', ')
      }
    }
    if (requestId === generation && serviceReady.value) {
      error.value = ''
      serviceUnavailable.value = false
    }
  } catch (requestError) {
    if (requestId === generation) {
      error.value = requestError instanceof Error ? requestError.message : 'Could not load website data.'
      serviceUnavailable.value = requestError instanceof CommunityUnavailableError
      serviceReady.value = false
      services.value = []
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
    if (requestId === generation) { selected.value = result.ticket; replies.value = result.replies; reply.value = ''; editing.value = false }
  } catch (requestError) {
    if (requestId === generation) {
      error.value = requestError instanceof Error ? requestError.message : 'Could not open ticket.'
      if (requestError instanceof CommunityUnavailableError) { serviceReady.value = false; serviceUnavailable.value = true }
    }
  }
  finally { if (requestId === generation) loading.value = false }
}
async function submit() {
  if (submitting.value || !serviceReady.value) return
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
        method: 'POST', body: JSON.stringify({
          type: type.value, title: title.value, body: body.value, productId: productId.value || undefined,
          ...(type.value === 'compatibility' ? { serverSoftware: serverSoftware.value, minecraftVersion: minecraftVersion.value } : {}),
        }),
      })
      if (captured !== getDiscordSession()) return
      await load(1)
      await openTicket(result.ticket.id)
      showComposer.value = false
      notice.value = 'Your ticket has been saved on the website.'
    }
    title.value = ''; body.value = ''; productId.value = ''; serverSoftware.value = ''; minecraftVersion.value = ''
  } catch (requestError) {
    if (captured === getDiscordSession()) {
      error.value = requestError instanceof Error ? requestError.message : 'Submission failed.'
      checkAvailabilityError(requestError)
    }
  }
  finally { submitting.value = false }
}
function startEditing() {
  if (!selected.value) return
  editTitle.value = selected.value.title
  editBody.value = selected.value.body
  editing.value = true
}
function backToTickets() {
  const url = new URL(window.location.href)
  url.searchParams.delete('ticket')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  void load(page.value)
}
async function saveTicketDetails() {
  if (!selected.value || submitting.value) return
  const id = selected.value.id
  const captured = getDiscordSession()
  submitting.value = true; error.value = ''; notice.value = ''
  let saved = false
  try {
    await communityRequest(`/tickets/${id}`, {
      method: 'PUT', body: JSON.stringify({ title: editTitle.value, body: editBody.value }),
    })
    saved = true
    if (captured !== getDiscordSession()) return
    await openTicket(id)
    if (captured === getDiscordSession()) {
      if (error.value) error.value = `Ticket changes saved, but the conversation could not refresh. ${error.value}`
      else notice.value = 'Ticket details updated.'
    }
  } catch (requestError) {
    if (captured === getDiscordSession()) {
      error.value = `${saved ? 'Ticket changes saved; refresh failed. ' : ''}${requestError instanceof Error ? requestError.message : 'Could not update ticket.'}`
      checkAvailabilityError(requestError)
    }
  } finally { submitting.value = false }
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
  } catch (requestError) {
    if (captured === getDiscordSession()) {
      error.value = requestError instanceof Error ? requestError.message : 'Could not send reply.'
      checkAvailabilityError(requestError)
    }
  }
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
  } catch (requestError) {
    if (captured === getDiscordSession()) {
      error.value = requestError instanceof Error ? requestError.message : 'Could not save preferences.'
      checkAvailabilityError(requestError)
    }
  }
  finally { submitting.value = false }
}
async function markRead(notification: Notification) {
  const captured = getDiscordSession()
  error.value = ''
  try {
    await communityRequest(`/notifications/${notification.id}/read`, { method: 'POST' })
    if (captured === getDiscordSession()) notification.read = true
  } catch (requestError) {
    if (captured === getDiscordSession()) {
      error.value = requestError instanceof Error ? requestError.message : 'Could not mark notification read.'
      checkAvailabilityError(requestError)
    }
  }
}
function changedSession() {
  let current = ''
  try { current = getDiscordSession() } catch (sessionError) { console.error('Unable to read website session:', sessionError) }
  if (current === token) return
  generation++
  deepLinkHandled = false
  tickets.value = []; notifications.value = []; selected.value = null; replies.value = []
  title.value = ''; body.value = ''; reply.value = ''; notice.value = ''
  editing.value = false; editTitle.value = ''; editBody.value = ''; showComposer.value = false
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
    <header><p class="website-kicker">{{ headers[mode][0] }}</p><h2>{{ headers[mode][1] }}</h2><p class="website-note">{{ headers[mode][2] }}</p><button type="button" :disabled="loading || submitting" @click="selected ? openTicket(selected.id) : load(page)">{{ loading ? 'Loading…' : 'Refresh' }}</button></header>
    <p v-if="error" class="website-message" :class="{ 'website-error': !serviceUnavailable }" :role="serviceUnavailable ? 'status' : 'alert'">{{ error }}</p>
    <p v-if="serviceUnavailable" class="website-note">Live data is unavailable, so sending and editing are disabled. <a href="https://discord.gg/lumenstudios">Contact support on Discord →</a></p>
    <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
    <p v-if="loading" class="website-note" role="status">Loading website data…</p>
    <p v-if="!signedIn && mode !== 'status'" class="website-message">Use <strong>Log in</strong> in the header to connect your Discord account {{ mode === 'issues' ? 'before submitting a bug.' : 'to view your private workspace.' }}</p>

    <fieldset class="website-service-controls" :disabled="loading || submitting || !serviceReady" aria-label="Website service controls">
    <template v-if="mode === 'tickets' && signedIn">
      <section v-if="selected" class="website-panel ticket-conversation">
        <button type="button" :disabled="loading || submitting" @click="backToTickets">← All my tickets</button>
        <header class="ticket-heading"><p class="website-kicker">TICKET {{ selected.id.slice(0, 8) }}</p><h3>{{ selected.title }}</h3><p class="website-meta"><span class="website-badge" :data-status="selected.status">{{ selected.status === 'waiting' ? 'Waiting for your reply' : selected.status }}</span>{{ selected.type }} · {{ selected.productId || 'General' }}</p><p class="website-note">Opened by {{ selected.customerName }} · {{ communityDate(selected.createdAt) }}<br>Assigned to {{ selected.assignedTo?.name || 'the support team' }}</p><div class="ticket-labels"><span v-for="label in selected.labels" :key="label" class="website-badge">{{ label }}</span></div></header>
        <form v-if="editing" @submit.prevent="saveTicketDetails"><label>Ticket title<input v-model="editTitle" required minlength="3" maxlength="160"></label><label>Details<textarea v-model="editBody" required minlength="5" maxlength="8000" rows="6" /></label><div class="website-actions"><button class="website-primary" type="submit" :disabled="submitting">Save changes</button><button type="button" :disabled="submitting" @click="editing = false">Cancel</button></div></form>
        <article v-else class="ticket-message"><p class="website-meta">{{ selected.customerName }} · Original request</p><p class="website-body">{{ selected.body }}</p><p v-if="selected.serverSoftware" class="website-note">{{ selected.serverSoftware }} · Minecraft {{ selected.minecraftVersion }}</p><button v-if="selected.status !== 'closed'" type="button" :disabled="submitting" @click="startEditing">Edit ticket details</button></article>
        <div class="ticket-thread"><article v-for="item in replies" :key="item.id" class="ticket-message" :class="{ 'ticket-message-staff': item.staff }"><p class="website-meta"><span class="website-badge">{{ item.staff ? 'Staff' : 'Customer' }}</span>{{ item.authorName }} · {{ communityDate(item.createdAt) }}</p><p class="website-body">{{ item.body }}</p></article></div>
        <p v-if="!replies.length" class="website-note">Your request is with the support team. Replies will appear here and in your notification center.</p>
        <form v-if="selected.status !== 'closed'" @submit.prevent="sendReply"><label>Reply<textarea v-model="reply" required maxlength="4000" rows="4" :disabled="submitting" /></label><button class="website-primary" type="submit" :disabled="submitting || !reply.trim()">Send reply</button></form>
        <p v-else class="website-note">This ticket is closed. Create a new ticket if you need further help.</p>
      </section>
      <template v-else>
        <div class="ticket-toolbar"><div><h3>Your conversations</h3><p class="website-note">{{ serviceReady ? `${total} private ${total === 1 ? 'ticket' : 'tickets'}` : 'Tickets have not loaded' }} · Linked automatically to your Discord account</p></div><button class="website-primary" type="button" :disabled="submitting" @click="showComposer = !showComposer">{{ showComposer ? 'Cancel new ticket' : '+ New ticket' }}</button></div>
        <form v-if="showComposer" class="website-panel ticket-composer" @submit.prevent="submit"><h3>How can we help?</h3><p class="website-message">No username needed. This ticket belongs to the Discord account you are logged into.</p><div class="website-columns"><label>Type<select v-model="type"><option value="support">Support</option><option value="bug">Bug report</option><option value="compatibility">Compatibility</option><option value="feature">Feature request</option></select></label><label>Plugin<select v-model="productId"><option value="">General / no specific plugin</option><option v-for="plugin in pluginData.plugins" :key="plugin.id" :value="plugin.id">{{ plugin.name }}</option></select></label></div><div v-if="type === 'compatibility'" class="website-columns"><label>Server software<input v-model="serverSoftware" required maxlength="100" placeholder="Paper, Purpur, etc."></label><label>Minecraft version<input v-model="minecraftVersion" required maxlength="50" placeholder="1.21.4"></label></div><label>Short title<input v-model="title" required minlength="3" maxlength="160" placeholder="What do you need help with?"></label><label>Details<textarea v-model="body" required minlength="5" maxlength="4000" rows="6" placeholder="What happened, what you expected, and steps to reproduce. Remove credentials from logs."></textarea></label><button class="website-primary" type="submit" :disabled="submitting">{{ submitting ? 'Saving ticket…' : 'Send to support' }}</button></form>
        <div class="website-list ticket-cards"><article v-for="ticket in tickets" :key="ticket.id"><p class="website-meta"><span class="website-badge" :data-status="ticket.status">{{ ticket.status === 'waiting' ? 'Reply requested' : ticket.status }}</span>{{ ticket.type }} · #{{ ticket.id.slice(0, 8) }}</p><h3>{{ ticket.title }}</h3><p class="website-note">{{ ticket.productId || 'General support' }} · {{ ticket.assignedTo?.name || 'Awaiting assignment' }}</p><div class="ticket-labels"><span v-for="label in ticket.labels" :key="label" class="website-badge">{{ label }}</span></div><div class="ticket-toolbar"><span class="website-meta">Updated {{ communityDate(ticket.updatedAt) }}</span><button type="button" :disabled="loading || submitting" @click="openTicket(ticket.id)">Open conversation →</button></div></article></div>
        <p v-if="!loading && !error && !tickets.length" class="website-note">No tickets on this page.</p>
      </template>
    </template>

    <template v-if="mode === 'issues'">
      <details v-if="signedIn" class="website-panel"><summary>Submit a bug for staff review</summary><form @submit.prevent="submit"><label>Short title<input v-model="title" required maxlength="120"></label><label>Plugin / product ID<input v-model="productId" maxlength="100"></label><label>What happened?<textarea v-model="body" required maxlength="4000" rows="6" placeholder="Expected result, actual result, exact plugin/server versions, and reproduction steps. No secrets."></textarea></label><button class="website-primary" type="submit" :disabled="submitting">Submit bug</button><p class="website-note">Your Discord identity is verified server-side. Reports create private website tickets and are not public until staff review.</p></form></details>
      <div class="website-list"><article v-for="issue in issues" :key="issue.id"><p class="website-meta"><span class="website-badge" :data-status="issue.status">{{ issue.status }}</span>{{ issue.productId || 'General' }} · Updated {{ communityDate(issue.updatedAt) }}</p><h3>{{ issue.title }}</h3><p class="website-body">{{ issue.body }}</p></article></div>
      <p v-if="!loading && !error && !issues.length" class="website-note">No staff-published issues on this page. This is not a guarantee that every plugin is bug-free.</p>
      <a href="/account/tickets">View my submissions and tickets →</a>
    </template>

    <template v-if="mode === 'notifications' && signedIn">
      <details class="website-panel"><summary>Notification preferences</summary><form @submit.prevent="savePreferences"><label class="website-check"><input v-model="preferences.updates" type="checkbox">Plugin update notifications</label><label class="website-check"><input v-model="preferences.announcements" type="checkbox">Studio announcements</label><label class="website-check"><input v-model="preferences.ticketReplies" type="checkbox">Replies to my support tickets</label><fieldset><legend>Plugin topics</legend><p class="website-note">Select the plugins you want updates for. Leave all unchecked to receive every plugin topic. This does not change ownership or licenses.</p><div class="website-columns"><label v-for="plugin in pluginData.plugins" :key="plugin.id" class="website-check"><input v-model="preferences.products" type="checkbox" :value="plugin.id">{{ plugin.name }}</label></div></fieldset><label>Additional topic IDs (optional)<input v-model="customTopics" maxlength="1000" placeholder="Comma-separated topic IDs"></label><button class="website-primary" type="submit" :disabled="submitting">Save preferences</button></form></details>
      <div class="website-list"><article v-for="item in notifications" :key="item.id"><p class="website-meta"><span class="website-badge">{{ item.kind }}</span>{{ item.read ? 'Read' : 'Unread' }} · {{ item.productId || 'Studio' }} · {{ communityDate(item.createdAt) }}</p><h3>{{ item.title }}</h3><p class="website-body">{{ item.body }}</p><div class="website-actions"><a v-if="item.link && item.link.startsWith('/') && !item.link.startsWith('//')" :href="item.link">View details →</a><button v-if="!item.read" type="button" @click="markRead(item)">Mark read</button></div></article></div>
      <p v-if="!loading && !error && !notifications.length" class="website-note">No notifications match your preferences on this page.</p>
    </template>

    <template v-if="mode === 'status'">
      <div class="website-list"><article v-for="service in services" :key="service.id"><p class="website-meta"><span class="website-badge" :data-status="service.status">{{ service.status }}</span>{{ service.overrideStatus ? 'Staff override' : 'Automatic result' }}</p><h3>{{ service.name }}</h3><p v-if="service.message" class="website-body">{{ service.message }}</p><p class="website-note">Last automatic check: {{ communityDate(service.checkedAt) }} · Automatic result: <span class="website-badge" :data-status="service.automaticStatus">{{ service.automaticStatus }}</span></p></article></div>
      <p class="website-note">{{ serviceReady ? 'This page refreshes every five minutes while visible. Checks cover service reachability, not every feature or Minecraft server.' : 'No live service checks are available yet. This page does not assume services are healthy when the status Worker is unavailable.' }}</p>
    </template>
    <div v-if="mode !== 'status' && !selected && total > 20" class="website-pagination"><button type="button" :disabled="loading || submitting || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }} / {{ Math.ceil(total / 20) }}</span><button type="button" :disabled="loading || submitting || page * 20 >= total" @click="load(page + 1)">Next</button></div>
    </fieldset>
  </section>
</template>
