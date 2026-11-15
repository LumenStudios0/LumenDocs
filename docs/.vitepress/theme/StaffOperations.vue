<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { studioRequest } from './studio-api'
import { getDiscordSession } from './discord-session'
import { mergeStaffDrafts } from './staff-operation-drafts.mjs'

interface Actor { id: string; role?: string; rank?: number; roleName: string; permissions: string[] }
interface Guide { id: string; title: string }
interface Path { id: string; title: string; description: string; guideIds: string[] }
interface Scenario { id: string; title: string; category: string; prompt: string; choices: { id: string; label: string }[]; answerId: string; explanation: string }
interface Member { id: string; name: string; roleName: string; rank: number; availability?: string | null; lastOnline?: string | null; lastDid?: string | null; lastActivityAt?: string | null; online?: boolean | null }
interface Task { id: string; title: string; body: string; assigneeId: string | null; status: string; priority: string; dueAt: string | null; revision: number; createdAt: string }
interface Warning { id: string; targetId: string; actorId: string; reason: string; createdAt: string; acknowledgedAt: string | null }
interface Commission { ticketId: string; title: string; status: string; stage: string; scope: string; acceptanceCriteria: string; milestones: string[]; revision: number }
interface Feedback { id: string; guideId: string; actorId: string; message: string; createdAt: string }
interface Operations { actor: Actor & { rank: number }; members: Member[]; tasks: Task[]; warnings: Warning[]; commissions: Commission[]; feedback: Feedback[] }
const props = defineProps<{ view: string; actor: Actor; guides: Guide[]; paths: Path[]; scenarios: Scenario[] }>()
const emit = defineEmits<{ guide: [id: string]; accessChanged: [] }>()
const data = ref<Operations | null>(null), error = ref(''), notice = ref(''), loading = ref(false), saving = ref(false)
const availability = ref('off_shift')
const task = ref({ title: '', body: '', assigneeId: '', status: 'todo', priority: 'normal', dueAt: '' })
const edits = ref<Record<string, Task>>({})
const commissions = ref<Record<string, Commission>>({})
const milestoneText = ref<Record<string, string>>({})
const warning = ref({ targetId: '', reason: '' })
const answers = ref<Record<string, string>>({}), checked = ref<Record<string, boolean>>({})
const can = (permission: string) => props.actor.permissions.includes(permission)
const needsOperations = computed(() => ['availability', 'tasks', 'warnings', 'commissions', 'feedback'].includes(props.view))
const eligible = computed(() => data.value?.members.filter(m => m.id !== props.actor.id && m.rank < (data.value?.actor.rank ?? 0)) ?? [])
const memberName = (id: string | null) => data.value?.members.find(m => m.id === id)?.name || id || 'Unassigned'
const date = (value: string | null | undefined) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString() : 'Not available'
const localDue = (value: string | null) => {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  const parsed = new Date(value)
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
let generation = 0, token = '', controller: AbortController | null = null, timer: ReturnType<typeof setInterval> | undefined
function clear() { data.value = null; edits.value = {}; commissions.value = {}; milestoneText.value = {}; answers.value = {}; checked.value = {}; task.value = { title: '', body: '', assigneeId: '', status: 'todo', priority: 'normal', dueAt: '' }; warning.value = { targetId: '', reason: '' }; error.value = ''; notice.value = '' }
async function load(quiet = false) {
  if (!needsOperations.value) return
  const current = getDiscordSession(), id = ++generation
  if (current !== token) clear()
  token = current; controller?.abort(); controller = new AbortController()
  if (!quiet) { loading.value = true; error.value = '' }
  try {
    const result = await studioRequest<Operations>('/staff/operations', { signal: controller.signal })
    if (id !== generation || current !== getDiscordSession()) return
    if (result.actor.id !== props.actor.id || result.actor.roleName !== props.actor.roleName ||
      (props.actor.role != null && result.actor.role !== props.actor.role) ||
      (props.actor.rank != null && result.actor.rank !== props.actor.rank) ||
      JSON.stringify([...result.actor.permissions].sort()) !== JSON.stringify([...props.actor.permissions].sort())) {
      clear(); error.value = 'Staff access changed. Rechecking access before showing private data.'; emit('accessChanged'); return
    }
    data.value = result
    if (!quiet) {
      edits.value = mergeStaffDrafts(edits.value, result.tasks, 'id', (item: Task) => ({ ...item, dueAt: localDue(item.dueAt) }))
      commissions.value = mergeStaffDrafts(commissions.value, result.commissions, 'ticketId', (item: Commission) => ({ ...item }))
      milestoneText.value = mergeStaffDrafts(milestoneText.value, result.commissions, 'ticketId', (item: Commission) => (item.milestones || []).join('\n'))
      availability.value = result.members.find(m => m.id === result.actor.id)?.availability || 'off_shift'
    }
    error.value = ''
  } catch (e) { if (id === generation && current === getDiscordSession()) { data.value = null; error.value = e instanceof Error ? e.message : 'Staff operations could not load.' } }
  finally { if (id === generation) loading.value = false }
}
async function write(path: string, method: string, body: unknown, success: string) {
  if (saving.value) return false
  const current = getDiscordSession(), id = generation
  saving.value = true; error.value = ''; notice.value = ''
  let committed = false
  try {
    await studioRequest(path, { method, body: JSON.stringify(body) }); committed = true
    if (current !== getDiscordSession() || id !== generation) return false
    await load()
    if (current !== getDiscordSession() || generation !== id + 1) return false
    notice.value = error.value ? 'Saved, but refresh failed. Refresh before retrying.' : success
    return true
  } catch (e) {
    if (current === getDiscordSession() && id === generation) error.value = `${committed ? 'Saved; refresh failed. Do not retry until refreshed. ' : ''}${e instanceof Error ? e.message : 'Action failed.'} Refresh to resolve any revision conflict.`
    return false
  } finally { saving.value = false }
}
function resetTask(item: Task) { edits.value[item.id] = { ...item, dueAt: localDue(item.dueAt) } }
function resetCommission(item: Commission) { commissions.value[item.ticketId] = { ...item }; milestoneText.value[item.ticketId] = (item.milestones || []).join('\n') }
async function saveTask(item: Task) {
  const saved = await write('/staff/tasks/' + encodeURIComponent(item.id), 'PUT', { title: item.title, body: item.body, assigneeId: item.assigneeId || null, status: item.status, priority: item.priority, dueAt: item.dueAt ? new Date(item.dueAt).toISOString() : null, revision: item.revision }, 'Task saved.')
  const latest = data.value?.tasks.find(task => task.id === item.id)
  if (saved && latest) resetTask(latest)
}
async function createTask() {
  if (await write('/staff/tasks', 'POST', { ...task.value, assigneeId: task.value.assigneeId || null, dueAt: task.value.dueAt ? new Date(task.value.dueAt).toISOString() : null }, 'Task created.')) task.value = { title: '', body: '', assigneeId: '', status: 'todo', priority: 'normal', dueAt: '' }
}
async function issueWarning() {
  if (await write('/staff/warnings', 'POST', warning.value, 'Warning issued.')) warning.value = { targetId: '', reason: '' }
}
async function saveCommission(item: Commission) {
  const milestones = (milestoneText.value[item.ticketId] || '').split('\n').map(s => s.trim()).filter(Boolean)
  if (milestones.length > 20 || milestones.some(s => s.length > 240)) { error.value = 'Use at most 20 milestones, each no longer than 240 characters.'; return }
  const saved = await write('/staff/commissions/' + encodeURIComponent(item.ticketId), 'PUT', { stage: item.stage, scope: item.scope, acceptanceCriteria: item.acceptanceCriteria, milestones, revision: item.revision }, 'Commission saved.')
  const latest = data.value?.commissions.find(commission => commission.ticketId === item.ticketId)
  if (saved && latest) resetCommission(latest)
}
function sessionChanged() { if (token !== getDiscordSession()) { generation++; controller?.abort(); clear(); token = getDiscordSession(); void load() } }
watch(() => props.view, () => { generation++; controller?.abort(); clear(); void load() })
watch(() => JSON.stringify([props.actor.id, props.actor.role, props.actor.rank, props.actor.roleName, [...props.actor.permissions].sort()]), () => { generation++; controller?.abort(); clear(); void load() }, { flush: 'sync' })
onMounted(() => { token = getDiscordSession(); void load(); window.addEventListener('lumen-discord-user', sessionChanged); window.addEventListener('storage', sessionChanged); timer = setInterval(() => { if (!document.hidden && props.view === 'availability' && !loading.value && !saving.value) void load(true) }, 30000) })
onUnmounted(() => { generation++; controller?.abort(); clear(); clearInterval(timer); window.removeEventListener('lumen-discord-user', sessionChanged); window.removeEventListener('storage', sessionChanged) })
</script>

<template>
  <section class="ops" :aria-label="`Staff ${view}`">
    <header><p class="eyebrow">PRIVATE STAFF / {{ view.toUpperCase() }}</p><h2>{{ ({ availability: 'Live team availability', tasks: 'Task board', warnings: 'Staff warnings', commissions: 'Commission pipeline', onboarding: 'Onboarding paths', practice: 'Practice scenarios', feedback: 'Guide feedback inbox' } as Record<string,string>)[view] }}</h2><p>Verified staff workspace · {{ actor.roleName }}</p></header>
    <p v-if="error" role="alert" class="message">{{ error }} <button v-if="needsOperations" type="button" @click="load()">Refresh data</button></p><p v-if="notice" role="status" class="message">{{ notice }}</p><p v-if="loading" role="status">Loading private staff data…</p>
    <button v-if="needsOperations" type="button" :disabled="loading || saving" @click="load()">Refresh data</button>
    <template v-if="view === 'availability' && data">
      <form v-if="can('staff.presence')" class="panel" @submit.prevent="write('/staff/presence', 'POST', { availability }, 'Availability updated.')"><label>Your availability<select v-model="availability"><option value="available">Available</option><option value="busy">Busy</option><option value="away">Away</option><option value="off_shift">Off shift</option></select></label><button :disabled="saving">Update availability</button></form>
      <div class="grid"><article v-for="member in data.members" :key="member.id" class="panel"><p class="eyebrow">{{ member.online == null ? 'PRESENCE HIDDEN' : member.online ? 'ONLINE' : 'OFFLINE' }} · {{ member.availability?.replace('_', ' ') || 'Unavailable' }}</p><h3>{{ member.name }}</h3><p>{{ member.roleName }}</p><p>Last online: {{ date(member.lastOnline) }}<br>Last did: {{ member.lastDid || 'Not available' }} · {{ date(member.lastActivityAt) }}</p></article></div>
      <p>Presence refreshes while this page is visible. Availability is self-reported.</p>
    </template>
    <template v-if="view === 'tasks' && data">
      <form v-if="can('staff.tasks')" class="panel form" @submit.prevent="createTask"><h3>Create task</h3><label>Title<input v-model="task.title" required maxlength="160"></label><label>Details<textarea v-model="task.body" maxlength="6000" /></label><label>Assignee<select v-model="task.assigneeId"><option value="">Unassigned</option><option v-for="m in data.members" :key="m.id" :value="m.id">{{ m.name }}</option></select></label><label>Priority<select v-model="task.priority"><option>low</option><option>normal</option><option>high</option></select></label><label>Due date<input v-model="task.dueAt" type="datetime-local"></label><button :disabled="saving">Create task</button></form>
      <div class="grid"><form v-for="item in data.tasks" :key="item.id" class="panel form" @submit.prevent="saveTask(edits[item.id])"><template v-if="edits[item.id]"><label>Title<input v-model="edits[item.id].title" required maxlength="160"></label><label>Details<textarea v-model="edits[item.id].body" maxlength="6000" /></label><label>Assignee<select v-model="edits[item.id].assigneeId"><option :value="null">Unassigned</option><option v-for="m in data.members" :key="m.id" :value="m.id">{{ m.name }}</option></select></label><label>Status<select v-model="edits[item.id].status"><option value="todo">To do</option><option value="in_progress">In progress</option><option value="done">Done</option></select></label><label>Priority<select v-model="edits[item.id].priority"><option>low</option><option>normal</option><option>high</option></select></label><label>Due date<input v-model="edits[item.id].dueAt" type="datetime-local"></label><p>Draft revision {{ edits[item.id].revision }} · Latest revision {{ item.revision }}</p><p v-if="edits[item.id].revision !== item.revision" role="alert">This draft is stale. Copy your changes before loading the latest version.</p><button v-if="edits[item.id].revision !== item.revision" type="button" @click="resetTask(item)">Discard this draft and load latest</button><button v-if="can('staff.tasks')" :disabled="saving">Save task</button></template></form></div><p v-if="!data.tasks.length">No tasks yet.</p>
    </template>
    <template v-if="view === 'warnings' && data">
      <form v-if="can('staff.warnings') && eligible.length" class="panel form" @submit.prevent="issueWarning"><h3>Issue warning</h3><p>Only staff with a lower rank are eligible.</p><label>Team member<select v-model="warning.targetId" required><option value="">Choose member</option><option v-for="m in eligible" :key="m.id" :value="m.id">{{ m.name }} · {{ m.roleName }}</option></select></label><label>Reason<textarea v-model="warning.reason" required minlength="3" maxlength="2000" /></label><button :disabled="saving">Issue warning</button></form>
      <div class="grid"><article v-for="item in data.warnings" :key="item.id" class="panel"><h3>{{ memberName(item.targetId) }}</h3><p>{{ item.reason }}</p><p>Issued by {{ memberName(item.actorId) }} · {{ date(item.createdAt) }}<br>{{ item.acknowledgedAt ? `Acknowledged ${date(item.acknowledgedAt)}` : 'Awaiting acknowledgement' }}</p><button v-if="item.targetId === actor.id && !item.acknowledgedAt" :disabled="saving" @click="write('/staff/warnings/' + encodeURIComponent(item.id) + '/acknowledge', 'POST', {}, 'Warning acknowledged.')">Acknowledge</button></article></div><p v-if="!data.warnings.length">No visible warnings.</p>
    </template>
    <template v-if="view === 'commissions' && data"><div class="grid"><form v-for="item in data.commissions" :key="item.ticketId" class="panel form" @submit.prevent="saveCommission(commissions[item.ticketId])"><template v-if="commissions[item.ticketId]"><p class="eyebrow">{{ item.status }} · LATEST REVISION {{ item.revision }}</p><h3>{{ item.title }}</h3><p v-if="commissions[item.ticketId].revision !== item.revision" role="alert">This draft is stale. Copy your changes before loading the latest version.</p><button v-if="commissions[item.ticketId].revision !== item.revision" type="button" @click="resetCommission(item)">Discard this draft and load latest</button><a :href="'/admin/?ticket=' + encodeURIComponent(item.ticketId) + '#tickets'">Open ticket →</a><label>Stage<select v-model="commissions[item.ticketId].stage"><option v-for="stage in ['enquiry','scoping','quoted','development','review','delivered','cancelled']" :key="stage">{{ stage }}</option></select></label><label>Scope<textarea v-model="commissions[item.ticketId].scope" maxlength="6000" /></label><label>Acceptance criteria<textarea v-model="commissions[item.ticketId].acceptanceCriteria" maxlength="6000" /></label><label>Milestones, one per line (up to 20, 240 characters each)<textarea v-model="milestoneText[item.ticketId]" rows="4" /></label><button v-if="can('staff.commissions')" :disabled="saving">Save pipeline</button></template></form></div><p v-if="!data.commissions.length">No commission tickets yet.</p></template>
    <template v-if="view === 'feedback' && data && can('staff.feedback')"><p>Private feedback submitted by staff about the knowledge library.</p><div class="grid"><article v-for="item in data.feedback" :key="item.id" class="panel"><p class="eyebrow">{{ date(item.createdAt) }} · {{ memberName(item.actorId) }}</p><h3>{{ guides.find(g => g.id === item.guideId)?.title || item.guideId }}</h3><p>{{ item.message }}</p><button v-if="guides.some(g => g.id === item.guideId)" type="button" @click="emit('guide', item.guideId)">Open guide</button></article></div><p v-if="!data.feedback.length">No guide feedback yet.</p></template>
    <p v-if="view === 'feedback' && !can('staff.feedback')">Your role does not have guide feedback access.</p>
    <template v-if="view === 'onboarding'"><p>Follow a path at your own pace. Guide progress is personal to this account.</p><div class="grid"><article v-for="path in paths" :key="path.id" class="panel"><h3>{{ path.title }}</h3><p>{{ path.description }}</p><ul><li v-for="id in path.guideIds" :key="id"><button v-if="guides.some(g => g.id === id)" type="button" @click="emit('guide', id)">{{ guides.find(g => g.id === id)?.title }}</button><span v-else>Guide unavailable</span></li></ul></article></div><p v-if="!paths.length">No onboarding paths are available.</p></template>
    <template v-if="view === 'practice'"><p>Training only: choices are checked locally. No live actions or AI requests are made.</p><div class="grid"><form v-for="scenario in scenarios" :key="scenario.id" class="panel" @submit.prevent="checked[scenario.id] = true"><p class="eyebrow">{{ scenario.category }}</p><h3>{{ scenario.title }}</h3><p>{{ scenario.prompt }}</p><fieldset><legend>Choose an answer</legend><label v-for="choice in scenario.choices" :key="choice.id" class="choice"><input v-model="answers[scenario.id]" type="radio" :name="'scenario-' + scenario.id" :value="choice.id" @change="checked[scenario.id] = false"> {{ choice.label }}</label></fieldset><button :disabled="!answers[scenario.id]">Check answer</button><p v-if="checked[scenario.id]" role="status"><strong>{{ answers[scenario.id] === scenario.answerId ? 'Correct.' : 'Not quite.' }}</strong> {{ scenario.explanation }}</p></form></div><p v-if="!scenarios.length">No practice scenarios are available.</p></template>
  </section>
</template>
<style scoped>
.ops{margin:28px 0;color:#f5edf0}.ops header{padding:24px;border:1px solid #9a344c;border-radius:20px;background:radial-gradient(ellipse at top right,#7e1c383f,transparent 70%),#151116}.ops h2{font-size:clamp(1.7rem,4vw,2.7rem);margin:.3em 0}.ops h3{margin:.4em 0}.eyebrow{font-size:.72rem;color:#ff8792;letter-spacing:.12em;font-weight:700}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:16px;margin:18px 0}.panel{padding:20px;border:1px solid #532a36;border-radius:16px;background:#171318;margin:16px 0;min-width:0}.grid .panel{margin:0}.form,label{display:grid;gap:8px}.form{gap:14px}.ops input:not([type=radio]),.ops select,.ops textarea{width:100%;padding:10px;color:#fff;background:#0e0d11;border:1px solid #69414b;border-radius:8px}.ops button{padding:9px 14px;border:1px solid #aa4259;border-radius:9px;color:#fff;background:#321924;cursor:pointer}.ops button:disabled{opacity:.5;cursor:not-allowed}.ops a{color:#ff98a2}.ops .choice{display:block;margin:10px 0}.message{padding:12px;border:1px solid #a93c50;border-radius:10px}.ops :focus-visible{outline:2px solid #ff9eaa;outline-offset:3px}
</style>
