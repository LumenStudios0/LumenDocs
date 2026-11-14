<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ROLES } from '../../../shared/permissions.mjs'

interface Access { role: string; rank: number; permissions: string[] }
interface Role { id: string; name: string; rank: number; permissions: string[]; revision: number }
interface Member { discordId: string; username: string; displayName: string; role: string; rank: number; revision: number; protected: boolean; registeredAt: string | null; lastSeenAt: string | null }
interface SiteSettings { supportOpen: boolean; supportClosedMessage: string; forumOpen: boolean; forumClosedMessage: string }
interface Audit { id: string; actor_id: string; actor_role: string; action: string; target: string; details: Record<string, unknown>; created_at: string }
interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
const props = defineProps<{
  request: <T>(path: string, init?: RequestInit) => Promise<T>
  mode: 'roles' | 'settings'
}>()
const emit = defineEmits<{ updated: [] }>()
const actor = ref<Access | null>(null)
const roles = ref<Role[]>([])
const permissions = ref<{ id: string; name: string; group: string }[]>([])
const members = ref<Member[]>([])
const total = ref(0)
const page = ref(1)
const query = ref('')
const appliedQuery = ref('')
const selectedMember = ref<Member | null>(null)
const targetId = ref('')
const assignedRole = ref('client')
const selectedRoleId = ref('support_team')
const permissionDraft = ref<string[]>([])
const settings = ref<SiteSettings | null>(null)
const settingsRevision = ref(0)
const audit = ref<Audit[]>([])
const auditPage = ref(1)
const auditTotal = ref(0)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const can = (id: string) => actor.value?.permissions.includes(id) || false
const selectedRole = computed(() => roles.value.find(role => role.id === selectedRoleId.value))
const assignableRoles = computed(() => roles.value.filter(role => actor.value?.role === 'owner' ||
  role.rank < (actor.value?.rank ?? -1) && role.permissions.every(permission => can(permission))))
const editableRole = computed(() => selectedRole.value && selectedRole.value.id !== 'owner' && can('settings.roles') &&
  (actor.value?.role === 'owner' || selectedRole.value.rank < (actor.value?.rank ?? -1)))
const groups = computed(() => [...new Set(permissions.value.map(item => item.group))])
const busy = computed(() => loading.value || saving.value)
const messageOf = (value: unknown) => value instanceof Error ? value.message : 'Website request failed.'
function selectRole() { permissionDraft.value = [...(selectedRole.value?.permissions || [])] }
function chooseMember(member: Member) { selectedMember.value = member; targetId.value = member.discordId; assignedRole.value = assignableRoles.value.some(role => role.id === member.role) ? member.role : assignableRoles.value[0]?.id || '' }
function resetTarget() { selectedMember.value = null }
function mayManage(member: Member) { return !member.protected && (actor.value?.role === 'owner' || member.rank < (actor.value?.rank ?? -1)) }
async function loadMembers(targetPage = 1) {
  const result = await props.request<Page<Member>>(`/website/members?page=${targetPage}&query=${encodeURIComponent(appliedQuery.value)}`)
  members.value = result.items; total.value = result.total; page.value = result.page
}
async function loadAudit(targetPage = 1) {
  const result = await props.request<Page<Audit>>(`/website/audit?page=${targetPage}`)
  audit.value = result.items; auditTotal.value = result.total; auditPage.value = result.page
}
async function load() {
  loading.value = true
  try {
    const result = await props.request<{ actor: Access; roles: Role[]; permissions: typeof permissions.value }>('/website/access')
    actor.value = result.actor; roles.value = result.roles; permissions.value = result.permissions
    selectRole()
    if (props.mode === 'roles') await loadMembers(page.value)
    else {
      const config = await props.request<{ settings: SiteSettings; revision: number }>('/website/settings')
      settings.value = config.settings; settingsRevision.value = config.revision
      if (can('settings.audit')) await loadAudit(auditPage.value)
    }
  } finally { loading.value = false }
}
async function refresh() {
  error.value = ''
  try { await load() } catch (requestError) { error.value = messageOf(requestError) }
}
async function save(path: string, body: object, message: string) {
  if (busy.value) return
  error.value = ''; notice.value = ''; saving.value = true
  let committed = false
  try {
    await props.request(path, { method: 'PUT', body: JSON.stringify(body) })
    committed = true
    selectedMember.value = null
    await load()
    emit('updated')
    notice.value = message
  } catch (requestError) { error.value = `${committed ? 'Saved, but refresh failed. Refresh before retrying. ' : ''}${messageOf(requestError)}` }
  finally { saving.value = false }
}
function assign() {
  if (!/^\d{5,22}$/.test(targetId.value) || !assignedRole.value) { error.value = 'Enter a Discord user ID and choose a role.'; return }
  if (!window.confirm(`Assign ${roles.value.find(role => role.id === assignedRole.value)?.name} to Discord user ${targetId.value}? Their website permissions change immediately.`)) return
  void save(`/website/members/${targetId.value}/role`, { role: assignedRole.value, revision: selectedMember.value?.revision ?? 0 }, 'User role saved. Existing sign-in sessions now use the new permissions.')
}
function saveRole() {
  if (!editableRole.value || !selectedRole.value) return
  if (!window.confirm(`Save permissions for every ${selectedRole.value.name} account? Existing sessions are affected immediately.`)) return
  void save(`/website/roles/${selectedRole.value.id}`, { permissions: permissionDraft.value, revision: selectedRole.value.revision }, 'Role permissions saved.')
}
function restorePreset() { permissionDraft.value = [...(ROLES.find(role => role.id === selectedRoleId.value)?.permissions || [])] }
async function searchMembers() {
  appliedQuery.value = query.value.trim(); error.value = ''; loading.value = true
  try { await loadMembers(1) } catch (requestError) { error.value = messageOf(requestError) } finally { loading.value = false }
}
async function movePage(kind: 'members' | 'audit', target: number) {
  error.value = ''; loading.value = true
  try { if (kind === 'members') await loadMembers(target); else await loadAudit(target) }
  catch (requestError) { error.value = messageOf(requestError) } finally { loading.value = false }
}
onMounted(() => { void refresh() })
</script>

<template>
  <section class="website-workspace access-settings">
    <header><p class="website-kicker">LUMEN / ACCESS CONTROL</p><h2>{{ mode === 'roles' ? 'Users & roles' : 'Website settings' }}</h2><p class="website-note">Guest &lt; Client &lt; Support team &lt; Developer &lt; Studio Lead &lt; Owner. Only roles strictly below your own can be delegated, and you cannot delegate permissions you do not hold. The original owner cannot be removed.</p><button type="button" :disabled="busy" @click="refresh">Refresh</button></header>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
    <p v-if="loading" role="status">Loading website access...</p>
    <template v-if="actor">
      <p class="website-note">Your role: <strong>{{ roles.find(role => role.id === actor?.role)?.name }}</strong>. Changes are enforced by the Worker on every request, not by hidden buttons.</p>
      <template v-if="mode === 'roles'">
        <form class="website-panel" @submit.prevent="assign">
          <h3>Assign a role</h3>
          <p class="website-note">Select a signed-in user below or enter their Discord ID. For an existing assignment, select the current record before saving. One preset role applies per user. These are website roles, not Discord server roles or plugin entitlements.</p>
          <div class="website-columns">
            <label>Discord user ID<input v-model.trim="targetId" pattern="[0-9]{5,22}" inputmode="numeric" maxlength="22" required :disabled="busy" @input="resetTarget"></label>
            <label>New role<select v-model="assignedRole" required :disabled="busy"><option v-for="role in assignableRoles" :key="role.id" :value="role.id">{{ role.name }}</option></select></label>
          </div>
          <p v-if="selectedMember" class="website-note">{{ selectedMember.displayName || selectedMember.username || selectedMember.discordId }} currently has {{ roles.find(role => role.id === selectedMember?.role)?.name }}.</p>
          <button class="website-primary" type="submit" :disabled="busy || !targetId || !assignableRoles.length">Save user role</button>
        </form>
        <form class="website-actions" @submit.prevent="searchMembers"><label class="access-search">Find website users<input v-model="query" type="search" placeholder="Discord ID, username or display name"></label><button type="submit" :disabled="busy">Search users</button></form>
        <p class="website-note">Users appear after their next verified website sign-in. Unassigned signed-in users are Guests; Client is an explicit role, not a proof of purchase.</p>
        <div class="website-list">
          <article v-for="member in members" :key="member.discordId"><div><strong>{{ member.displayName || member.username || 'Not signed in yet' }}</strong><p class="website-meta">{{ member.username }} / {{ member.discordId }}</p><p v-if="member.registeredAt" class="website-meta">Joined {{ new Date(member.registeredAt).toLocaleString() }}</p><p v-if="member.lastSeenAt" class="website-meta">Last seen {{ new Date(member.lastSeenAt).toLocaleString() }}</p><span class="website-badge">{{ roles.find(role => role.id === member.role)?.name }}</span></div><button type="button" :disabled="busy || !mayManage(member)" @click="chooseMember(member)">Manage role</button></article>
        </div>
        <p v-if="!loading && !members.length" class="website-note">No matching website users.</p>
        <div class="website-pagination"><button type="button" :disabled="busy || page <= 1" @click="movePage('members', page - 1)">Previous</button><span>Page {{ page }} / {{ Math.max(1, Math.ceil(total / 50)) }} · {{ total }} users</span><button type="button" :disabled="busy || page * 50 >= total" @click="movePage('members', page + 1)">Next</button></div>
      </template>
      <template v-else>
        <section class="website-panel">
          <h3>Preset role permissions</h3>
          <p class="website-note">Ranks and the six roles are fixed. Owner always retains all permissions. Other roles have independent permission sets; editing one does not automatically change higher roles. Dashboard access requires “Open Staff Dashboard” in addition to action permissions. License grants also need customer and registry read access.</p>
          <label>Role<select v-model="selectedRoleId" :disabled="busy" @change="selectRole"><option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option></select></label>
          <p v-if="!editableRole" class="website-note">Read-only: you need role-permission editing access and a strictly higher role. Owner permissions cannot be edited.</p>
          <fieldset v-for="group in groups" :key="group" :disabled="busy || !editableRole" class="permission-group"><legend>{{ group }}</legend><label v-for="permission in permissions.filter(item => item.group === group)" :key="permission.id" class="website-check"><input v-model="permissionDraft" :value="permission.id" type="checkbox" :disabled="!can(permission.id) && !permissionDraft.includes(permission.id)">{{ permission.name }}<code>{{ permission.id }}</code></label></fieldset>
          <div class="website-actions"><button type="button" class="website-primary" :disabled="busy || !editableRole" @click="saveRole">Save role permissions</button><button type="button" :disabled="busy || !editableRole" @click="restorePreset">Restore preset in editor</button></div>
        </section>
        <form v-if="settings" class="website-panel" @submit.prevent="save('/website/settings', { settings, revision: settingsRevision }, 'Website settings saved.')">
          <h3>Support & forum controls</h3>
          <fieldset :disabled="busy || !can('settings.site')">
            <label class="website-check"><input v-model="settings.supportOpen" type="checkbox">Accept new support tickets and issue submissions</label>
            <label>Message when support intake is paused<input v-model="settings.supportClosedMessage" maxlength="240" required></label>
            <label class="website-check"><input v-model="settings.forumOpen" type="checkbox">Allow new community threads and replies</label>
            <label>Message when the forum is read-only<input v-model="settings.forumClosedMessage" maxlength="240" required></label>
            <p class="website-note">Existing tickets remain readable and customers can still reply. Authorized ticket managers and forum moderators can continue their work while intake is paused.</p>
            <button type="submit" class="website-primary">Save website settings</button>
          </fieldset>
        </form>
        <section v-if="can('settings.audit')" class="website-panel">
          <h3>Website access audit</h3>
          <div class="website-list"><details v-for="entry in audit" :key="entry.id"><summary>{{ entry.action }} / {{ entry.target }}<p class="website-meta">{{ entry.actor_id }} ({{ entry.actor_role }}) · {{ new Date(entry.created_at).toLocaleString() }}</p></summary><pre>{{ JSON.stringify(entry.details, null, 2) }}</pre></details></div>
          <p v-if="!audit.length" class="website-note">No website role or settings changes recorded yet.</p>
          <div class="website-pagination"><button type="button" :disabled="busy || auditPage <= 1" @click="movePage('audit', auditPage - 1)">Previous changes</button><span>Page {{ auditPage }} / {{ Math.max(1, Math.ceil(auditTotal / 50)) }}</span><button type="button" :disabled="busy || auditPage * 50 >= auditTotal" @click="movePage('audit', auditPage + 1)">Next changes</button></div>
        </section>
      </template>
    </template>
  </section>
</template>

<style scoped>
.permission-group { margin: 18px 0; padding: 14px; border: 1px solid var(--vp-c-divider); border-radius: 10px; }
.permission-group legend { padding: 0 7px; color: var(--vp-c-brand-1); font-size: .82rem; font-weight: 650; }
.permission-group code { margin-left: auto; font-size: .68rem; overflow-wrap: anywhere; }
.permission-group label { flex-wrap: wrap; }
.access-search { flex: 1; min-width: 180px; }
.website-list article { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.website-list article > div { min-width: 0; overflow-wrap: anywhere; }
pre { overflow: auto; font-size: .75rem; }
fieldset { min-width: 0; }
@media (max-width: 600px) { .website-list article { align-items: flex-start; flex-direction: column; } .permission-group code { flex-basis: 100%; margin-left: 27px; } }
</style>
