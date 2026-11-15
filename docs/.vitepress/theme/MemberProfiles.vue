<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { studioRequest } from './studio-api'
import { getDiscordSession } from './discord-session'
const props = defineProps<{ editOwn?: boolean }>()
interface Profile {
  id: string; username: string; displayName: string; avatarUrl: string; bio: string; pronouns: string; status: string;
  accent: string; banner: string; website: string; showcase: string; favoritePlugin: string;
  tier: { id: string; name: string } | null; tierCheckedAt: string | null; joinedAt: string; public?: boolean; revision?: number
}
const search = ref('')
const results = ref<Profile[]>([])
const selected = ref<Profile | null>(null)
const own = ref<Profile | null>(null)
const editing = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const page = ref(1)
const total = ref(0)
const draft = reactive({ displayName: '', bio: '', pronouns: '', status: '', accent: '#9f72ff', banner: '#38205c', website: '', showcase: '', favoritePlugin: '', public: true, revision: 0 })
const preview = computed(() => editing.value && own.value ? { ...own.value, ...draft } : selected.value)
let generation = 0
let initialization = 0
let token = ''
function fill(profile: Profile) {
  for (const key of ['displayName', 'bio', 'pronouns', 'status', 'accent', 'banner', 'website', 'showcase', 'favoritePlugin'] as const) draft[key] = profile[key]
  draft.public = true
  draft.revision = profile.revision ?? 0
}
function edit() { if (!own.value) return; fill(own.value); selected.value = own.value; editing.value = true; error.value = ''; notice.value = '' }
async function directory(target = 1) {
  const request = ++generation
  loading.value = true; error.value = ''
  try {
    const data = await studioRequest<{ items: Profile[]; total: number }>(`/profiles?q=${encodeURIComponent(search.value.trim())}&page=${target}`, {}, false)
    if (request !== generation) return
    results.value = data.items; total.value = data.total; page.value = target
  } catch (value) { if (request === generation) error.value = value instanceof Error ? value.message : 'Member search failed.' }
  finally { if (request === generation) loading.value = false }
}
async function open(id: string) {
  const request = ++generation
  loading.value = true; error.value = ''; editing.value = false
  selected.value = null
  try {
    const data = await studioRequest<{ profile: Profile }>(`/profiles/${id}`, {}, false)
    if (request !== generation) return
    selected.value = data.profile
    const url = new URL(location.href); url.searchParams.set('id', id); history.replaceState(history.state, '', url)
  } catch (value) { if (request === generation) error.value = value instanceof Error ? value.message : 'Profile could not be opened.' }
  finally { if (request === generation) loading.value = false }
}
async function mine() {
  const request = initialization
  const session = getDiscordSession()
  token = session; own.value = null
  if (!session) return
  try {
    const data = await studioRequest<{ profile: Profile; warning?: string }>('/profiles/me')
    if (session !== getDiscordSession() || request !== initialization) return
    own.value = data.profile
    if (data.warning) notice.value = data.warning
  } catch (value) { if (session === getDiscordSession() && request === initialization) error.value = value instanceof Error ? value.message : 'Your profile could not be loaded.' }
}
async function save() {
  if (!own.value || saving.value) return
  const session = getDiscordSession(), request = generation
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const data = await studioRequest<{ profile: Profile }>('/profiles/me', { method: 'PUT', body: JSON.stringify(draft) })
    if (session !== getDiscordSession() || request !== generation) return
    own.value = data.profile; selected.value = data.profile; editing.value = false
    notice.value = 'Profile saved.'
    void directory(page.value)
  } catch (value) {
    if (session === getDiscordSession() && request === generation) error.value = value instanceof Error ? value.message : 'Save could not be confirmed. Refresh before retrying.'
  } finally { saving.value = false }
}
async function copyLink() {
  if (!selected.value) return
  try { await navigator.clipboard.writeText(`${location.origin}/members/?id=${selected.value.id}`); notice.value = 'Profile link copied.' }
  catch { error.value = 'Clipboard access was denied.' }
}
function resetAppearance() { draft.accent = '#9f72ff'; draft.banner = '#38205c' }
async function init() {
  const request = ++initialization
  generation++; selected.value = null; own.value = null; editing.value = false; notice.value = ''; error.value = ''
  Object.assign(draft, { displayName: '', bio: '', pronouns: '', status: '', accent: '#9f72ff', banner: '#38205c', website: '', showcase: '', favoritePlugin: '', public: true, revision: 0 })
  await directory()
  if (request !== initialization) return
  await mine()
  if (request !== initialization) return
  if (props.editOwn) { edit(); return }
  const id = new URL(location.href).searchParams.get('id')
  if (id && /^\d{5,22}$/.test(id)) await open(id)
}
function sessionChanged() { if (getDiscordSession() !== token) void init() }
onMounted(() => { void init(); window.addEventListener('lumen-discord-user', sessionChanged); window.addEventListener('storage', sessionChanged) })
onUnmounted(() => { generation++; initialization++; window.removeEventListener('lumen-discord-user', sessionChanged); window.removeEventListener('storage', sessionChanged) })
</script>
<template>
  <main class="members">
    <header class="members-heading"><div><p>LUMEN / COMMUNITY MEMBERS</p><h1>{{ props.editOwn ? 'My profile' : 'Meet the people behind the servers.' }}</h1><span>Profiles are visible to everyone. Only you can edit yours.</span></div><button v-if="own" :disabled="saving" @click="edit">Edit my profile</button></header>
    <form class="member-search" @submit.prevent="directory(1)"><label for="member-search">Search names or Discord user IDs</label><div><input id="member-search" v-model="search" maxlength="60" placeholder="Find a member…"><button :disabled="loading || saving">Search</button></div></form>
    <p v-if="error" class="members-error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p><p v-if="loading" role="status">Loading members…</p>
    <div class="members-layout">
      <section class="members-directory" aria-label="Member search results"><button v-for="member in results" :key="member.id" :disabled="saving" @click="open(member.id)" :style="{ borderLeftColor: member.accent }"><img v-if="member.avatarUrl" :src="member.avatarUrl" alt="" referrerpolicy="no-referrer"><span v-else class="member-initial">{{ member.displayName.slice(0,2) }}</span><span><strong>{{ member.displayName }}</strong><small>@{{ member.username }}</small><em v-if="member.tier">{{ member.tier.name }}</em></span></button><p v-if="!loading && !results.length">No published profiles found.</p><nav v-if="total > 20"><button :disabled="page === 1 || loading || saving" @click="directory(page-1)">Previous</button><span>{{ page }} / {{ Math.ceil(total/20) }}</span><button :disabled="page*20 >= total || loading || saving" @click="directory(page+1)">Next</button></nav></section>
      <div>
        <article v-if="preview" class="member-profile" :style="{ '--profile-accent': preview.accent, '--profile-banner': preview.banner }">
          <div class="member-banner"><span v-if="editing">LIVE PREVIEW</span></div>
          <div class="member-profile-body"><img v-if="preview.avatarUrl" class="member-avatar" :src="preview.avatarUrl" alt="" referrerpolicy="no-referrer"><span v-else class="member-avatar member-initial">{{ preview.displayName.slice(0,2) }}</span>
            <h2>{{ preview.displayName }}</h2><p class="member-handle">@{{ preview.username }} <span v-if="preview.pronouns">· {{ preview.pronouns }}</span></p>
            <span v-if="preview.tier" class="profile-tier" :class="{ elite: preview.tier.id === 'elite' }">{{ preview.tier.name }}</span>
            <p v-if="preview.status" class="member-status">{{ preview.status }}</p><h3>About me</h3><p class="member-bio">{{ preview.bio || 'Nothing here yet.' }}</p>
            <p v-if="preview.favoritePlugin"><strong>Favorite plugin</strong> · {{ preview.favoritePlugin }}</p>
            <div class="member-links"><a v-if="preview.website && /^https:\/\//.test(preview.website)" :href="preview.website" target="_blank" rel="noopener noreferrer">Website ↗</a><a v-if="preview.showcase && /^https:\/\//.test(preview.showcase)" :href="preview.showcase" target="_blank" rel="noopener noreferrer">Server showcase ↗</a></div>
            <small>Profile created {{ new Date(preview.joinedAt).toLocaleDateString() }}</small><small v-if="preview.tierCheckedAt">Badge verified {{ new Date(preview.tierCheckedAt).toLocaleDateString() }} · refreshes from licensing</small>
            <button v-if="!editing" @click="copyLink">Copy profile link</button>
          </div>
        </article>
        <p v-else class="member-placeholder">Choose a member to open their profile, or edit your own after signing in.</p>
        <form v-if="editing && own" class="member-editor" @submit.prevent="save"><h2>Customize your profile</h2><fieldset :disabled="saving">
          <label>Display name<input v-model="draft.displayName" required maxlength="60"></label><label>Pronouns<input v-model="draft.pronouns" maxlength="40" placeholder="Optional"></label><label>Custom status<input v-model="draft.status" maxlength="80" placeholder="What are you building?"></label>
          <label>About me <small>{{ draft.bio.length }} / 600</small><textarea v-model="draft.bio" maxlength="600" rows="5" placeholder="Tell the community about yourself. No private information or credentials." /></label>
          <div class="member-colors"><label>Accent color<input v-model="draft.accent" type="color"></label><label>Banner color<input v-model="draft.banner" type="color"></label><button type="button" @click="resetAppearance">Reset colors</button></div>
          <label>Website<input v-model="draft.website" type="url" maxlength="500" placeholder="https://…"></label><label>Server showcase link<input v-model="draft.showcase" type="url" maxlength="500" placeholder="https://…"></label><label>Favorite plugin<input v-model="draft.favoritePlugin" maxlength="80"></label>
          <p>Your profile and badge are public. Only you can edit this information. Ticket content, licenses, purchases and last-online activity are never included.</p>
          <button type="submit">{{ saving ? 'Saving…' : 'Save profile' }}</button><button type="button" @click="editing=false">Cancel</button>
        </fieldset></form>
      </div>
    </div>
  </main>
</template>
<style scoped>
.members-layout>*{min-width:0}.members-directory button>span:last-child{min-width:0}.members-directory strong,.members-directory small,.member-profile h2,.member-handle,.member-status,.member-profile-body p{overflow-wrap:anywhere}.member-links{flex-wrap:wrap}
.members{max-width:1160px;margin:auto;padding:32px clamp(16px,3vw,32px) 64px}.members-heading{display:flex;gap:20px;align-items:center;justify-content:space-between;margin-bottom:24px}.members-heading p{font-size:11px;letter-spacing:.14em;color:var(--vp-c-brand-1)}.members h1{font-size:clamp(1.8rem,4vw,3rem);line-height:1.1;letter-spacing:-.04em}.members-heading span,.members p,.members small{color:var(--vp-c-text-2)}.members button{padding:9px 13px;border:1px solid var(--vp-c-divider);border-radius:9px;background:var(--vp-c-bg-soft);color:var(--vp-c-text-1);font-size:12px}.members button:disabled{opacity:.5}.members input:not([type=color],[type=checkbox]),.members textarea{width:100%;padding:10px;border:1px solid var(--vp-c-divider);border-radius:8px;background:var(--vp-c-bg);color:var(--vp-c-text-1)}.member-search>div{display:flex;gap:10px}.member-search label{display:block;margin-bottom:8px;font-size:12px}.members-layout{display:grid;grid-template-columns:minmax(200px,.7fr) minmax(0,1.3fr);gap:24px;margin-top:24px}.members-directory>button{display:flex;align-items:center;gap:12px;text-align:left;width:100%;padding:15px;margin-bottom:9px;border-left-width:3px}.members-directory img,.members-directory .member-initial{width:42px;height:42px;border-radius:50%;flex-shrink:0}.members-directory button>span:last-child{display:grid;gap:3px}.members-directory small{font-size:11px}.members-directory em{font-size:10px;font-style:normal;color:var(--vp-c-brand-1)}.members-directory nav{display:flex;align-items:center;gap:8px;font-size:11px}.member-profile{border:1px solid var(--profile-accent);border-radius:20px;overflow:hidden;background:var(--vp-c-bg-soft);box-shadow:0 12px 40px #0001}.member-banner{height:130px;background:linear-gradient(130deg,var(--profile-banner),var(--profile-accent));position:relative}.member-banner:after{content:"";position:absolute;inset:0;background:linear-gradient(135deg,transparent 50%,#ffffff12 50%);background-size:44px 44px}.member-banner>span{position:relative;z-index:1;padding:10px;font-size:10px;color:white}.member-profile-body{padding:0 24px 24px}.member-avatar{position:relative;width:80px;height:80px;border-radius:50%;border:6px solid var(--vp-c-bg-soft);margin-top:-40px;object-fit:cover}.member-initial{display:grid;place-items:center;background:var(--vp-c-brand-soft);font-weight:800;color:var(--vp-c-text-1)}.member-profile h2{margin:10px 0 4px;border:0;font-size:1.7rem}.member-handle{margin:0;font-size:12px}.profile-tier{display:inline-block;margin-top:12px;padding:4px 9px;border:1px solid var(--profile-accent);border-radius:6px;font-size:11px;font-weight:750}.profile-tier.elite{background:linear-gradient(110deg,#9f72ff22,#e7c76e22,#9f72ff22);background-size:200%;animation:member-elite 5s ease infinite}.member-status{padding:10px 12px;border:1px solid var(--vp-c-divider);border-radius:10px;font-size:13px}.member-profile h3{font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-top:22px}.member-bio{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;font-size:13px}.member-links{display:flex;gap:12px;margin:18px 0;font-size:12px}.member-profile-body>small{display:block;font-size:10px;margin:5px 0}.member-profile-body>button{margin-top:14px}.member-editor{padding:22px;margin-top:20px;border:1px solid var(--vp-c-divider);border-radius:16px}.member-editor h2{border:0;font-size:1.3rem}.member-editor fieldset{border:0;padding:0}.member-editor label{display:grid;gap:6px;margin:14px 0;font-size:12px}.member-colors{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.member-colors input{width:70px;height:36px}.member-editor .member-visibility{display:flex;align-items:flex-start;gap:8px;line-height:1.7}.member-editor p{font-size:11px;line-height:1.6}.member-editor button{margin-right:8px}.members-error{border:1px solid #d96176;padding:12px;border-radius:8px}.member-placeholder{padding:30px;border:1px dashed var(--vp-c-divider);border-radius:16px;font-size:13px}@keyframes member-elite{50%{background-position:100% 50%}}@media(max-width:700px){.members-layout{grid-template-columns:1fr}.members-heading{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){.profile-tier.elite{animation:none}}
</style>
