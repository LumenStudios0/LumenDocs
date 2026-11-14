<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { getDiscordSession } from './discord-session'
import { communityRequest, communityDate, type CommunityPage, type Issue, type Notification, type Reply, type Service, type ServiceStatus, type Ticket, type StaffMember } from './community-api'
import { staffReplyTemplates } from './staff-reply-templates'
import pluginData from './plugin-compatibility-data.json'
import { CommunityUnavailableError } from './community-errors.mjs'
import { useSiteDialog } from './site-dialog'
const { confirm: confirmSiteAction } = useSiteDialog()

type Tab = 'tickets' | 'issues' | 'notifications' | 'status'
const props = defineProps<{ permissions: string[] }>()
const can = (permission: string) => props.permissions.includes(permission)
const tab = ref<Tab>('tickets')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const serviceReady = ref(false)
const serviceUnavailable = ref(false)
const page = ref(1)
const total = ref(0)
const ticketStatus = ref('all')
const tickets = ref<Ticket[]>([])
const issues = ref<Issue[]>([])
const announcements = ref<Notification[]>([])
const services = ref<Service[]>([])
const selected = ref<Ticket | null>(null)
const replies = ref<Reply[]>([])
const reply = ref('')
const templateIndex = ref('')
const statusDraft = ref<'open' | 'waiting' | 'closed'>('open')
const titleDraft = ref('')
const assigneeDraft = ref('')
const labelsDraft = ref('')
const assignmentFilter = ref('all')
const labelFilter = ref('')
const members = ref<StaffMember[]>([])
const currentStaffId = ref('')
const title = ref('')
const body = ref('')
const productId = ref('')
const issueId = ref('')
const issueStatus = ref<Issue['status']>('open')
const published = ref(true)
const kind = ref<'update' | 'announcement'>('announcement')
const audience = ref('all')
const statusChoices: ServiceStatus[] = ['operational', 'degraded', 'outage', 'maintenance', 'unknown']
const statusEdits = ref<Record<string, { status: string; message: string }>>({})
let generation = 0
let token = ''
let deepLinkHandled = false
const tabs: { id: Tab; name: string }[] = [
  { id: 'tickets', name: 'Website tickets' }, { id: 'issues', name: 'Known issues (#known-issues)' },
  { id: 'notifications', name: 'Publish notifications' }, { id: 'status', name: 'Service status' },
]
const allowedTabs = computed(() => tabs.filter(item => can(item.id === 'tickets' ? 'tickets.view' : item.id === 'issues' ? 'issues.manage' : item.id === 'notifications' ? 'notifications.manage' : 'status.manage')))
function textError(value: unknown) { return value instanceof Error ? value.message : 'Staff request failed.' }
async function load(target = 1) {
  const requestId = ++generation
  const targetTab = tab.value
  loading.value = true; error.value = ''; notice.value = ''; selected.value = null
  serviceReady.value = false; serviceUnavailable.value = false
  try {
    token = getDiscordSession()
    if (targetTab === 'status') {
      const result = await communityRequest<{ services: Service[] }>('/status')
      if (requestId !== generation) return
      services.value = result.services
      statusEdits.value = Object.fromEntries(result.services.map(service => [service.id, { status: service.overrideStatus || 'auto', message: service.message }]))
      serviceReady.value = true
    } else {
      const path = `/staff/${targetTab}?page=${target}&pageSize=20${targetTab === 'tickets' ? `&status=${ticketStatus.value}&assigned=${encodeURIComponent(assignmentFilter.value)}&label=${encodeURIComponent(labelFilter.value)}` : ''}`
      const result = await communityRequest<CommunityPage<Ticket | Issue | Notification>>(path)
      if (requestId !== generation) return
      if (targetTab === 'tickets') {
        const staff = await communityRequest<{ members: StaffMember[]; currentStaffId: string }>('/staff/members')
        if (requestId !== generation) return
        members.value = staff.members; currentStaffId.value = staff.currentStaffId
        tickets.value = result.items as Ticket[]
      }
      if (targetTab === 'issues') issues.value = result.items as Issue[]
      if (targetTab === 'notifications') announcements.value = result.items as Notification[]
      page.value = result.page; total.value = result.total
      serviceReady.value = true
      const requested = new URLSearchParams(window.location.search).get('ticket')
      if (targetTab === 'tickets' && !deepLinkHandled && requested && /^[0-9a-f-]{36}$/i.test(requested)) {
        deepLinkHandled = true
        await open(requested)
      }
    }
  } catch (requestError) {
    if (requestId === generation) {
      error.value = textError(requestError)
      serviceUnavailable.value = requestError instanceof CommunityUnavailableError
      serviceReady.value = false
      tickets.value = []; issues.value = []; announcements.value = []; services.value = []
    }
  } finally { if (requestId === generation) loading.value = false }
}
function changeTab(target: Tab) {
  if (saving.value) return
  tab.value = target; title.value = ''; body.value = ''; productId.value = ''; issueId.value = ''
  void load()
}
function backToQueue() {
  const url = new URL(window.location.href)
  url.searchParams.delete('ticket')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  void load(page.value)
}
async function open(id: string) {
  const requestId = ++generation
  loading.value = true; error.value = ''; selected.value = null
  try {
    const result = await communityRequest<{ ticket: Ticket; replies: Reply[] }>(`/tickets/${id}`)
    if (requestId === generation) {
      selected.value = result.ticket; replies.value = result.replies; reply.value = ''
      statusDraft.value = result.ticket.status; templateIndex.value = ''
      titleDraft.value = result.ticket.title
      assigneeDraft.value = result.ticket.assignedTo?.id || ''
      labelsDraft.value = result.ticket.labels.join(', ')
    }
  } catch (requestError) {
    if (requestId === generation) {
      error.value = textError(requestError)
      if (requestError instanceof CommunityUnavailableError) { serviceReady.value = false; serviceUnavailable.value = true }
    }
  }
  finally { if (requestId === generation) loading.value = false }
}
async function write(path: string, method: string, payload: unknown, after: () => Promise<void>, success: string) {
  if (saving.value || !serviceReady.value) return
  const captured = getDiscordSession()
  saving.value = true; error.value = ''; notice.value = ''
  let committed = false
  try {
    await communityRequest(path, { method, body: JSON.stringify(payload) })
    committed = true
    if (captured !== getDiscordSession()) return
    await after()
    if (captured === getDiscordSession()) {
      if (error.value) error.value = `Change saved, but refreshed data could not load. Do not repeat the action. ${error.value}`
      else notice.value = success
    }
  } catch (requestError) {
    if (captured === getDiscordSession()) error.value = `${committed ? 'Change saved; refresh failed. Do not repeat the action. ' : ''}${textError(requestError)}`
    if (captured === getDiscordSession() && requestError instanceof CommunityUnavailableError) {
      serviceReady.value = false; serviceUnavailable.value = true
    }
  } finally { saving.value = false }
}
function sendReply() {
  if (!selected.value) return
  const id = selected.value.id
  void write(`/tickets/${id}/replies`, 'POST', { body: reply.value }, () => open(id), 'Staff reply saved on the website.')
}
async function updateTicket() {
  if (!selected.value) return
  const id = selected.value.id
  if (statusDraft.value === 'closed' && !await confirmSiteAction('Close this website ticket? The customer will no longer be able to reply until staff reopen it.', { title: 'Close ticket', confirmText: 'Close ticket' })) return
  void write(`/staff/tickets/${id}`, 'PUT', {
    status: statusDraft.value, title: titleDraft.value, assigneeId: assigneeDraft.value || null,
    labels: labelsDraft.value.split(',').map(label => label.trim()).filter(Boolean),
  }, () => open(id), 'Ticket details, assignment and labels saved.')
}
function retryAlert() {
  if (!selected.value) return
  const id = selected.value.id
  void write(`/staff/tickets/${id}/alert`, 'POST', {}, () => open(id), 'Alert delivery checked. See its delivery status below.')
}
async function insertTemplate() {
  const template = staffReplyTemplates[Number(templateIndex.value)]
  if (templateIndex.value === '' || !template) return
  if (reply.value.trim() && !await confirmSiteAction('Replace your current draft with this reply template?', { title: 'Replace reply draft', confirmText: 'Replace draft' })) return
  reply.value = template.body
}
function editIssue(issue?: Issue) {
  issueId.value = issue?.id || ''
  title.value = issue?.title || ''; body.value = issue?.body || ''; productId.value = issue?.productId || ''
  issueStatus.value = issue?.status || 'open'; published.value = issue?.published ?? true
}
async function saveIssue() {
  if (published.value && !await confirmSiteAction('Publish this sanitized issue on the public website? Check that it contains no customer details or secrets.', { title: 'Publish known issue', confirmText: 'Publish issue' })) return
  void write(`/staff/issues${issueId.value ? `/${issueId.value}` : ''}`, issueId.value ? 'PUT' : 'POST',
    { title: title.value, body: body.value, productId: productId.value || undefined, status: issueStatus.value, published: published.value },
    async () => { editIssue(); await load(page.value) }, 'Known issue saved.')
}
async function publishNotification() {
  if (!await confirmSiteAction(`Publish this ${kind.value} to ${audience.value === 'product' ? productId.value : audience.value} subscribers?`, { title: 'Publish notification', confirmText: 'Publish notification' })) return
  void write('/staff/notifications', 'POST', {
    title: title.value, body: body.value, kind: kind.value, productId: productId.value || undefined, audience: audience.value,
  }, async () => { title.value = ''; body.value = ''; await load(1) }, 'Notification published in the website notification center.')
}
function saveService(service: Service) {
  void write(`/staff/status/${service.id}`, 'PUT', statusEdits.value[service.id], () => load(), 'Service status saved.')
}
function runCheck() { void write('/staff/status/check', 'POST', {}, () => load(), 'Automatic service checks completed.') }
function sessionChanged() {
  let current = ''
  try { current = getDiscordSession() } catch (sessionError) { console.error('Staff session unavailable:', sessionError) }
  if (current === token) return
  deepLinkHandled = false
  generation++; selected.value = null; replies.value = []; tickets.value = []; issues.value = []; announcements.value = []; services.value = []
  title.value = ''; body.value = ''; reply.value = ''
  titleDraft.value = ''; assigneeDraft.value = ''; labelsDraft.value = ''; members.value = []
  void load()
}
watch(allowedTabs, items => {
  if (!items.some(item => item.id === tab.value) && items.length) { tab.value = items[0].id; void load() }
})
onMounted(() => { if (!allowedTabs.value.some(item => item.id === tab.value) && allowedTabs.value.length) tab.value = allowedTabs.value[0].id; void load(); window.addEventListener('lumen-discord-user', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged) })
</script>

<template>
  <section class="website-workspace" aria-label="Staff website operations">
    <header><p class="website-kicker">STAFF DASHBOARD / WEBSITE OPERATIONS</p><h2>Support, updates, and service health.</h2><p class="website-note">These controls use the website database, independently of the licensing API. Every write requires a verified staff Discord session. Local license test mode does not apply here.</p></header>
    <nav class="website-tabs" aria-label="Staff website tools"><button v-for="item in allowedTabs" :key="item.id" type="button" :aria-pressed="tab === item.id" :disabled="saving" @click="changeTab(item.id)">{{ item.name }}</button></nav>
    <button type="button" :disabled="loading || saving" @click="selected ? open(selected.id) : load(page)">Refresh staff data</button>
    <p v-if="error" class="website-message" :class="{ 'website-error': !serviceUnavailable }" :role="serviceUnavailable ? 'status' : 'alert'">{{ error }}</p>
    <p v-if="serviceUnavailable" class="website-note">Staff actions are disabled until the website service is connected. The Worker deployment must succeed with D1 access and both community migrations applied.</p><p v-if="notice" class="website-message" role="status">{{ notice }}</p><p v-if="loading" role="status" class="website-note">Loading authorized website data…</p>

    <fieldset class="website-service-controls" :disabled="loading || saving || !serviceReady" aria-label="Staff website service controls">
    <template v-if="tab === 'tickets'">
      <div v-if="!selected" class="ticket-filters"><label>Status<select v-model="ticketStatus" :disabled="saving" @change="load(1)"><option value="all">All statuses</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="closed">Closed</option></select></label><label>Assignment<select v-model="assignmentFilter" :disabled="saving" @change="load(1)"><option value="all">Everyone</option><option value="unassigned">Unassigned</option><option v-if="currentStaffId" :value="currentStaffId">Assigned to me</option><option v-for="member in members.filter(item => item.id !== currentStaffId)" :key="member.id" :value="member.id">{{ member.name }}</option></select></label><form @submit.prevent="load(1)"><label>Label<input v-model="labelFilter" maxlength="30" placeholder="bug, urgent, billing"></label><button type="submit" :disabled="loading || saving">Filter</button></form></div>
      <section v-if="selected" class="website-panel ticket-conversation">
        <button type="button" :disabled="saving" @click="backToQueue">← Ticket queue</button><header class="ticket-heading"><p class="website-kicker">TICKET {{ selected.id.slice(0, 8) }}</p><h3>{{ selected.title }}</h3><p class="website-meta"><span class="website-badge" :data-status="selected.status">{{ selected.status }}</span>{{ selected.type }} · {{ selected.productId || 'General' }}</p><p class="website-note">Opened by {{ selected.customerName }} · Discord ID {{ selected.customerDiscordId }}<br>{{ communityDate(selected.createdAt) }}</p></header>
        <form v-if="can('tickets.manage')" class="ticket-routing" @submit.prevent="updateTicket"><h3>Ticket routing</h3><label>Title<input v-model="titleDraft" required minlength="3" maxlength="160"></label><div class="website-columns"><label>Status<select v-model="statusDraft"><option value="open">Open</option><option value="waiting">Waiting for customer</option><option value="closed">Closed</option></select></label><label>Assigned staff<select v-model="assigneeDraft"><option value="">Unassigned</option><option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }} · {{ member.id }}</option></select></label></div><button type="button" :disabled="saving || !currentStaffId" @click="assigneeDraft = currentStaffId">Assign to me</button><label>Labels<input v-model="labelsDraft" maxlength="250" placeholder="bug, urgent, needs-logs"></label><p class="website-note">Comma-separated, up to eight labels. Labels are visible to the ticket owner.</p><button class="website-primary" type="submit" :disabled="saving">Save ticket changes</button></form>
        <p class="website-note" role="status">Discord alert: {{ !selected.alertConfigured ? 'Webhook is not configured. Set DISCORD_BUG_REPORT_WEBHOOK on the Worker.' : selected.alert?.state || 'No alert recorded' }}<span v-if="selected.alert?.lastError"> · {{ selected.alert.lastError }}</span></p><button v-if="can('tickets.alerts') && selected.alertConfigured && selected.alert && ['pending', 'failed'].includes(selected.alert.state)" type="button" :disabled="saving" @click="retryAlert">Retry Discord alert</button>
        <article class="ticket-message"><p class="website-meta">{{ selected.customerName }} · Original request</p><p class="website-body">{{ selected.body }}</p><p v-if="selected.serverSoftware" class="website-note">{{ selected.serverSoftware }} · Minecraft {{ selected.minecraftVersion }}</p></article>
        <div class="ticket-thread"><article v-for="item in replies" :key="item.id" class="ticket-message" :class="{ 'ticket-message-staff': item.staff }"><p class="website-meta"><span class="ticket-author"><strong>{{ item.authorName }}</strong><span v-if="item.staff" class="ticket-support-badge">Support</span><span v-else class="website-badge">Customer</span></span><time :datetime="item.createdAt">{{ communityDate(item.createdAt) }}</time></p><p class="website-body">{{ item.body }}</p></article></div>
        <form v-if="can('tickets.reply') && selected.status !== 'closed'" @submit.prevent="sendReply"><label>Preset reply template<select v-model="templateIndex"><option value="">Choose a reply template</option><option v-for="(preset, index) in staffReplyTemplates" :key="preset.title" :value="String(index)">{{ preset.title }}</option></select></label><button type="button" :disabled="saving || templateIndex === ''" @click="insertTemplate">Insert template into draft</button><label>Reply (review before sending)<textarea v-model="reply" required maxlength="4000" rows="8" /></label><p class="website-note">Replace bracketed placeholders and verify advice for the customer's exact plugin/version. Templates are never sent automatically.</p><button class="website-primary" type="submit" :disabled="saving || !reply.trim()">Send staff reply</button></form>
        <p v-else class="website-note">{{ selected.status === 'closed' ? 'Reopen this ticket before replying.' : 'Your role has read-only access to replies.' }}</p>
        <a href="/known-issues">Open Community Support (moderate threads there) →</a>
      </section>
      <div v-else class="website-list ticket-cards"><article v-for="ticket in tickets" :key="ticket.id"><p class="website-meta"><span class="website-badge" :data-status="ticket.status">{{ ticket.status }}</span>{{ ticket.type }} · #{{ ticket.id.slice(0, 8) }}</p><h3>{{ ticket.title }}</h3><p class="website-note">{{ ticket.customerName }} · {{ ticket.productId || 'General support' }}<br>{{ ticket.assignedTo?.name || 'Unassigned' }}</p><div class="ticket-labels"><span v-for="label in ticket.labels" :key="label" class="website-badge">{{ label }}</span></div><div class="ticket-toolbar"><span class="website-meta">{{ communityDate(ticket.updatedAt) }}</span><button type="button" :disabled="loading || saving" @click="open(ticket.id)">Open ticket →</button></div></article></div>
    </template>
    <template v-if="tab === 'issues'">
      <form class="website-panel" @submit.prevent="saveIssue"><h3>{{ issueId ? 'Edit known issue' : 'Publish a known issue' }}</h3><p class="website-note">Review bug tickets, then publish a sanitized summary and verified workaround here. Never copy customer identities, keys, or private logs to the public board.</p><label>Title<input v-model="title" required maxlength="120"></label><label>Plugin / product ID<input v-model="productId" maxlength="100"></label><label>Issue and workaround<textarea v-model="body" required maxlength="4000" rows="6"></textarea></label><label>Status<select v-model="issueStatus"><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select></label><label class="website-check"><input v-model="published" type="checkbox">Publish in Community Support #known-issues</label><div class="website-actions"><button class="website-primary" type="submit" :disabled="saving">Save known issue</button><button type="button" :disabled="saving" @click="editIssue()">Clear draft</button></div></form>
      <div class="website-list"><article v-for="issue in issues" :key="issue.id"><p class="website-meta">{{ issue.published ? 'Public' : 'Unpublished' }} · <span class="website-badge" :data-status="issue.status">{{ issue.status }}</span> · {{ issue.productId || 'General' }}</p><h3>{{ issue.title }}</h3><p class="website-body">{{ issue.body }}</p><button type="button" :disabled="saving" @click="editIssue(issue)">Edit issue</button></article></div>
    </template>
    <template v-if="tab === 'notifications'">
      <form class="website-panel" @submit.prevent="publishNotification"><h3>Publish an update or announcement</h3><label>Notification type<select v-model="kind"><option value="announcement">Studio announcement</option><option value="update">Plugin update</option></select></label><label>Audience<select v-model="audience"><option value="all">All opted-in customers</option><option value="product">Selected product subscribers</option><option value="staff">Staff only</option></select></label><label>Plugin topic<select v-model="productId" :required="audience === 'product'"><option value="">Studio-wide / no plugin topic</option><option v-for="plugin in pluginData.plugins" :key="plugin.id" :value="plugin.id">{{ plugin.name }}</option></select></label><label>Title<input v-model="title" required maxlength="120"></label><label>Update details<textarea v-model="body" required maxlength="4000" rows="6" /></label><button class="website-primary" type="submit" :disabled="saving">Review &amp; publish notification</button><p class="website-note">Delivery is in-app and respects notification preferences. Selecting a product targets subscribers, not verified purchases.</p></form>
      <div class="website-list"><article v-for="item in announcements" :key="item.id"><p class="website-meta">{{ item.kind }} · {{ item.audience }} · {{ item.productId || 'Studio' }} · {{ communityDate(item.createdAt) }}</p><h3>{{ item.title }}</h3><p class="website-body">{{ item.body }}</p></article></div>
    </template>
    <template v-if="tab === 'status'">
      <p class="website-note">Automatic probes run every five minutes. Manual overrides persist until you select Automatic; they do not erase probe results.</p><button type="button" :disabled="loading || saving" @click="runCheck">Run service checks now</button>
      <div class="website-list"><article v-for="service in services" :key="service.id"><h3>{{ service.name }}</h3><p class="website-meta">Effective: <span class="website-badge" :data-status="service.status">{{ service.status }}</span> · Automatic: <span class="website-badge" :data-status="service.automaticStatus">{{ service.automaticStatus }}</span> · Checked {{ communityDate(service.checkedAt) }}</p><form v-if="statusEdits[service.id]" @submit.prevent="saveService(service)"><label>Staff override<select v-model="statusEdits[service.id].status"><option value="auto">Automatic (remove override)</option><option v-for="status in statusChoices" :key="status">{{ status }}</option></select></label><label>Public incident / maintenance message<textarea v-model="statusEdits[service.id].message" maxlength="1000" rows="3" /></label><button type="submit" :disabled="saving">Save service status</button></form></article></div><a href="/status">View public status page →</a>
    </template>
    <p v-if="!loading && !error && tab !== 'status' && !selected && total === 0" class="website-note">No records in this queue.</p>
    <div v-if="tab !== 'status' && !selected && total > 20" class="website-pagination"><button type="button" :disabled="loading || saving || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }} / {{ Math.ceil(total / 20) }}</span><button type="button" :disabled="loading || saving || page * 20 >= total" @click="load(page + 1)">Next</button></div>
    </fieldset>
  </section>
</template>
