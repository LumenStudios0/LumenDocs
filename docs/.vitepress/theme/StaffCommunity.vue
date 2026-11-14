<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { communityRequest, communityDate, type CommunityPage, type Issue, type Notification, type Reply, type Service, type ServiceStatus, type Ticket } from './community-api'
import { staffReplyTemplates } from './staff-reply-templates'
import pluginData from './plugin-compatibility-data.json'

type Tab = 'tickets' | 'issues' | 'notifications' | 'status'
const tab = ref<Tab>('tickets')
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
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
const tabs: { id: Tab; name: string }[] = [
  { id: 'tickets', name: 'Website tickets' }, { id: 'issues', name: 'Known issues' },
  { id: 'notifications', name: 'Publish notifications' }, { id: 'status', name: 'Service status' },
]
function textError(value: unknown) { return value instanceof Error ? value.message : 'Staff request failed.' }
async function load(target = 1) {
  const requestId = ++generation
  const targetTab = tab.value
  loading.value = true; error.value = ''; notice.value = ''; selected.value = null
  try {
    token = getDiscordSession()
    if (targetTab === 'status') {
      const result = await communityRequest<{ services: Service[] }>('/status')
      if (requestId !== generation) return
      services.value = result.services
      statusEdits.value = Object.fromEntries(result.services.map(service => [service.id, { status: service.overrideStatus || 'auto', message: service.message }]))
    } else {
      const path = `/staff/${targetTab}?page=${target}&pageSize=20${targetTab === 'tickets' ? `&status=${ticketStatus.value}` : ''}`
      const result = await communityRequest<CommunityPage<Ticket | Issue | Notification>>(path)
      if (requestId !== generation) return
      if (targetTab === 'tickets') tickets.value = result.items as Ticket[]
      if (targetTab === 'issues') issues.value = result.items as Issue[]
      if (targetTab === 'notifications') announcements.value = result.items as Notification[]
      page.value = result.page; total.value = result.total
    }
  } catch (requestError) {
    if (requestId === generation) {
      error.value = textError(requestError)
      tickets.value = []; issues.value = []; announcements.value = []; services.value = []
    }
  } finally { if (requestId === generation) loading.value = false }
}
function changeTab(target: Tab) {
  if (saving.value) return
  tab.value = target; title.value = ''; body.value = ''; productId.value = ''; issueId.value = ''
  void load()
}
async function open(id: string) {
  const requestId = ++generation
  loading.value = true; error.value = ''; selected.value = null
  try {
    const result = await communityRequest<{ ticket: Ticket; replies: Reply[] }>(`/tickets/${id}`)
    if (requestId === generation) {
      selected.value = result.ticket; replies.value = result.replies; reply.value = ''
      statusDraft.value = result.ticket.status; templateIndex.value = ''
    }
  } catch (requestError) { if (requestId === generation) error.value = textError(requestError) }
  finally { if (requestId === generation) loading.value = false }
}
async function write(path: string, method: string, payload: unknown, after: () => Promise<void>, success: string) {
  if (saving.value) return
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
  } finally { saving.value = false }
}
function sendReply() {
  if (!selected.value) return
  const id = selected.value.id
  void write(`/tickets/${id}/replies`, 'POST', { body: reply.value }, () => open(id), 'Staff reply saved on the website.')
}
function updateTicket() {
  if (!selected.value) return
  const id = selected.value.id
  if (statusDraft.value === 'closed' && !window.confirm('Close this website ticket? The customer will no longer be able to reply until staff reopen it.')) return
  void write(`/staff/tickets/${id}`, 'PUT', { status: statusDraft.value }, () => open(id), 'Ticket status saved.')
}
function insertTemplate() {
  const template = staffReplyTemplates[Number(templateIndex.value)]
  if (templateIndex.value === '' || !template) return
  if (reply.value.trim() && !window.confirm('Replace your current draft with this reply template?')) return
  reply.value = template.body
}
function editIssue(issue?: Issue) {
  issueId.value = issue?.id || ''
  title.value = issue?.title || ''; body.value = issue?.body || ''; productId.value = issue?.productId || ''
  issueStatus.value = issue?.status || 'open'; published.value = issue?.published ?? true
}
function saveIssue() {
  if (published.value && !window.confirm('Publish this sanitized issue on the public website? Check that it contains no customer details or secrets.')) return
  void write(`/staff/issues${issueId.value ? `/${issueId.value}` : ''}`, issueId.value ? 'PUT' : 'POST',
    { title: title.value, body: body.value, productId: productId.value || undefined, status: issueStatus.value, published: published.value },
    async () => { editIssue(); await load(page.value) }, 'Known issue saved.')
}
function publishNotification() {
  if (!window.confirm(`Publish this ${kind.value} to ${audience.value === 'product' ? productId.value : audience.value} subscribers?`)) return
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
  generation++; selected.value = null; replies.value = []; tickets.value = []; issues.value = []; announcements.value = []; services.value = []
  title.value = ''; body.value = ''; reply.value = ''
  void load()
}
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged) })
</script>

<template>
  <section class="website-workspace" aria-label="Staff website operations">
    <header><p class="website-kicker">STAFF DASHBOARD / WEBSITE OPERATIONS</p><h2>Support, updates, and service health.</h2><p class="website-note">These controls use the website database, independently of the licensing API. Every write requires a verified staff Discord session. Local license test mode does not apply here.</p></header>
    <nav class="website-tabs" aria-label="Staff website tools"><button v-for="item in tabs" :key="item.id" type="button" :aria-pressed="tab === item.id" :disabled="saving" @click="changeTab(item.id)">{{ item.name }}</button></nav>
    <button type="button" :disabled="loading || saving" @click="load(page)">Refresh staff data</button>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p><p v-if="notice" class="website-message" role="status">{{ notice }}</p><p v-if="loading" role="status" class="website-note">Loading authorized website data…</p>

    <template v-if="tab === 'tickets'">
      <label v-if="!selected">Ticket queue<select v-model="ticketStatus" :disabled="saving" @change="load(1)"><option value="all">All statuses</option><option value="open">Open</option><option value="waiting">Waiting</option><option value="closed">Closed</option></select></label>
      <section v-if="selected" class="website-panel">
        <button type="button" :disabled="saving" @click="load(page)">← Ticket queue</button><h3>{{ selected.title }}</h3><p class="website-meta">{{ selected.type }} · {{ selected.productId || 'General' }} · Discord ID {{ selected.customerDiscordId }} · {{ communityDate(selected.createdAt) }}</p><p class="website-body">{{ selected.body }}</p>
        <form @submit.prevent="updateTicket"><label>Ticket status<select v-model="statusDraft"><option value="open">Open</option><option value="waiting">Waiting for customer</option><option value="closed">Closed</option></select></label><button type="submit" :disabled="saving">Save ticket status</button></form>
        <div class="website-list"><article v-for="item in replies" :key="item.id"><p class="website-meta">{{ item.staff ? 'Staff' : 'Customer' }} · {{ item.authorName }} · {{ communityDate(item.createdAt) }}</p><p class="website-body">{{ item.body }}</p></article></div>
        <form v-if="selected.status !== 'closed'" @submit.prevent="sendReply"><label>Preset reply template<select v-model="templateIndex"><option value="">Choose a reply template</option><option v-for="(preset, index) in staffReplyTemplates" :key="preset.title" :value="String(index)">{{ preset.title }}</option></select></label><button type="button" :disabled="saving || templateIndex === ''" @click="insertTemplate">Insert template into draft</button><label>Reply (review before sending)<textarea v-model="reply" required maxlength="4000" rows="8" /></label><p class="website-note">Replace bracketed placeholders and verify advice for the customer's exact plugin/version. Templates are never sent automatically.</p><button class="website-primary" type="submit" :disabled="saving || !reply.trim()">Send staff reply</button></form>
        <p v-else class="website-note">Reopen this ticket before replying.</p>
        <a href="/known-issues">Open public known-issue board →</a>
      </section>
      <div v-else class="website-list"><article v-for="ticket in tickets" :key="ticket.id"><p class="website-meta"><span class="website-badge">{{ ticket.status }}</span>{{ ticket.type }} · {{ ticket.customerDiscordId }} · {{ communityDate(ticket.updatedAt) }}</p><h3>{{ ticket.title }}</h3><button type="button" :disabled="loading || saving" @click="open(ticket.id)">Open ticket →</button></article></div>
    </template>
    <template v-if="tab === 'issues'">
      <form class="website-panel" @submit.prevent="saveIssue"><h3>{{ issueId ? 'Edit known issue' : 'Publish a known issue' }}</h3><p class="website-note">Review bug tickets, then publish a sanitized summary and verified workaround here. Never copy customer identities, keys, or private logs to the public board.</p><label>Title<input v-model="title" required maxlength="120"></label><label>Plugin / product ID<input v-model="productId" maxlength="100"></label><label>Issue and workaround<textarea v-model="body" required maxlength="4000" rows="6"></textarea></label><label>Status<select v-model="issueStatus"><option value="open">Open</option><option value="investigating">Investigating</option><option value="resolved">Resolved</option></select></label><label class="website-check"><input v-model="published" type="checkbox">Publish on public known-issue board</label><div class="website-actions"><button class="website-primary" type="submit" :disabled="saving">Save known issue</button><button type="button" :disabled="saving" @click="editIssue()">Clear draft</button></div></form>
      <div class="website-list"><article v-for="issue in issues" :key="issue.id"><p class="website-meta">{{ issue.published ? 'Public' : 'Unpublished' }} · {{ issue.status }} · {{ issue.productId || 'General' }}</p><h3>{{ issue.title }}</h3><p class="website-body">{{ issue.body }}</p><button type="button" :disabled="saving" @click="editIssue(issue)">Edit issue</button></article></div>
    </template>
    <template v-if="tab === 'notifications'">
      <form class="website-panel" @submit.prevent="publishNotification"><h3>Publish an update or announcement</h3><label>Notification type<select v-model="kind"><option value="announcement">Studio announcement</option><option value="update">Plugin update</option></select></label><label>Audience<select v-model="audience"><option value="all">All opted-in customers</option><option value="product">Selected product subscribers</option><option value="staff">Staff only</option></select></label><label>Plugin topic<select v-model="productId" :required="audience === 'product'"><option value="">Studio-wide / no plugin topic</option><option v-for="plugin in pluginData.plugins" :key="plugin.id" :value="plugin.id">{{ plugin.name }}</option></select></label><label>Title<input v-model="title" required maxlength="120"></label><label>Update details<textarea v-model="body" required maxlength="4000" rows="6" /></label><button class="website-primary" type="submit" :disabled="saving">Review &amp; publish notification</button><p class="website-note">Delivery is in-app and respects notification preferences. Selecting a product targets subscribers, not verified purchases.</p></form>
      <div class="website-list"><article v-for="item in announcements" :key="item.id"><p class="website-meta">{{ item.kind }} · {{ item.audience }} · {{ item.productId || 'Studio' }} · {{ communityDate(item.createdAt) }}</p><h3>{{ item.title }}</h3><p class="website-body">{{ item.body }}</p></article></div>
    </template>
    <template v-if="tab === 'status'">
      <p class="website-note">Automatic probes run every five minutes. Manual overrides persist until you select Automatic; they do not erase probe results.</p><button type="button" :disabled="loading || saving" @click="runCheck">Run service checks now</button>
      <div class="website-list"><article v-for="service in services" :key="service.id"><h3>{{ service.name }}</h3><p class="website-meta">Effective: {{ service.status }} · Automatic: {{ service.automaticStatus }} · Checked {{ communityDate(service.checkedAt) }}</p><form v-if="statusEdits[service.id]" @submit.prevent="saveService(service)"><label>Staff override<select v-model="statusEdits[service.id].status"><option value="auto">Automatic (remove override)</option><option v-for="status in statusChoices" :key="status">{{ status }}</option></select></label><label>Public incident / maintenance message<textarea v-model="statusEdits[service.id].message" maxlength="1000" rows="3" /></label><button type="submit" :disabled="saving">Save service status</button></form></article></div><a href="/status">View public status page →</a>
    </template>
    <p v-if="!loading && !error && tab !== 'status' && !selected && total === 0" class="website-note">No records in this queue.</p>
    <div v-if="tab !== 'status' && !selected && total > 20" class="website-pagination"><button type="button" :disabled="loading || saving || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }} / {{ Math.ceil(total / 20) }}</span><button type="button" :disabled="loading || saving || page * 20 >= total" @click="load(page + 1)">Next</button></div>
  </section>
</template>
