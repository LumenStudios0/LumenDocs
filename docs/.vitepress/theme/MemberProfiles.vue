<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { studioRequest, studioUrl } from './studio-api'
import { getDiscordSession } from './discord-session'
import LoyaltyBadge from './LoyaltyBadge.vue'
import ProfileBackdrop from './ProfileBackdrop.vue'
import ProfileAvatar from './ProfileAvatar.vue'
import ServerShowcases from './ServerShowcases.vue'
import type { ServerShowcase } from './profile-types'
import { backgrounds, frames, decorations } from '../../../shared/profile-cosmetics.mjs'
const props = defineProps<{ editOwn?: boolean }>()
interface Profile {
  id: string; username: string; displayName: string; avatarUrl: string; bio: string; pronouns: string; status: string;
  accent: string; banner: string; website: string; showcase: string; favoritePlugin: string;
  tier: { id: string; name: string } | null; badges: { id: string; name: string }[]; availableBadges?: { id: string; name: string }[];
  tierCheckedAt: string | null; joinedAt: string; public?: boolean; revision?: number
  appearance: { background: string; frame: string; decoration: string }; servers: ServerShowcase[]; bannerVersion: number | null;
  savedAppearance?: { background: string; frame: string; decoration: string };
  cosmeticAccess?: { backgrounds: boolean; frames: boolean; decorations: boolean };
  achievements?: { id: string; name: string; description: string; earned: boolean }[]
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
const bannerImage = ref<string | null | undefined>(undefined)
const processingBanner = ref(false)
const draft = reactive({ displayName: '', bio: '', pronouns: '', status: '', accent: '#9f72ff', banner: '#38205c', website: '', showcase: '', favoritePlugin: '', public: true, revision: 0, badgeIds: new Array<string>(),
  appearance: { background: 'none', frame: 'none', decoration: 'none' }, servers: new Array<ServerShowcase>() })
const preview = computed(() => editing.value && own.value
  ? { ...own.value, ...draft, appearance: {
    background: own.value.cosmeticAccess?.backgrounds ? draft.appearance.background : 'none',
    frame: own.value.cosmeticAccess?.frames ? draft.appearance.frame : 'none',
    decoration: own.value.cosmeticAccess?.decorations ? draft.appearance.decoration : 'none',
  }, badges: (own.value.availableBadges || []).filter(badge => draft.badgeIds.includes(badge.id)) }
  : selected.value)
const bannerSource = computed(() => {
  if (editing.value && bannerImage.value !== undefined) return bannerImage.value ? `data:image/webp;base64,${bannerImage.value}` : ''
  return preview.value?.bannerVersion != null ? studioUrl(`/profiles/media/${preview.value.id}?v=${preview.value.bannerVersion}`) : ''
})
let generation = 0
let initialization = 0
let token = ''
function fill(profile: Profile) {
  for (const key of ['displayName', 'bio', 'pronouns', 'status', 'accent', 'banner', 'website', 'showcase', 'favoritePlugin'] as const) draft[key] = profile[key]
  draft.public = true
  draft.revision = profile.revision ?? 0
  draft.badgeIds = (profile.badges ?? (profile.tier ? [profile.tier] : [])).map(badge => badge.id)
  draft.appearance = { ...(profile.savedAppearance || profile.appearance || { background: 'none', frame: 'none', decoration: 'none' }) }
  draft.servers = (profile.servers || []).map(server => ({ ...server, screenshots: server.screenshots.map(image => ({ ...image })) }))
  bannerImage.value = undefined
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
  if (!own.value || saving.value || processingBanner.value) return
  const session = getDiscordSession(), request = generation
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const data = await studioRequest<{ profile: Profile }>('/profiles/me', { method: 'PUT', body: JSON.stringify({ ...draft,
      ...(bannerImage.value === undefined ? {} : { bannerImage: bannerImage.value }) }) })
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
async function uploadBanner(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return
  const file = event.target.files?.[0]; event.target.value = ''
  if (!file || processingBanner.value) return
  const request = initialization, session = getDiscordSession()
  error.value = ''
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) {
    error.value = 'Choose a PNG, JPEG or WebP image up to 8 MiB.'; return
  }
  processingBanner.value = true
  let bitmap: ImageBitmap | undefined
  try {
    bitmap = await createImageBitmap(file)
    if (bitmap.width * bitmap.height > 25000000) throw new Error('Image dimensions are too large. Use a smaller image.')
    const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 400
    const context = canvas.getContext('2d')
    if (!context) throw new Error('This browser cannot prepare banner images.')
    const scale = Math.max(1200 / bitmap.width, 400 / bitmap.height)
    context.drawImage(bitmap, (1200-bitmap.width*scale)/2, (400-bitmap.height*scale)/2, bitmap.width*scale, bitmap.height*scale)
    let data = canvas.toDataURL('image/webp', .82)
    if (!data.startsWith('data:image/webp;base64,')) throw new Error('WebP conversion is not supported by this browser.')
    if (data.length > 349000) data = canvas.toDataURL('image/webp', .55)
    if (data.length > 349000) throw new Error('Image is too detailed. Choose a simpler image or resize it.')
    if (request !== initialization || session !== getDiscordSession()) return
    bannerImage.value = data.slice(data.indexOf(',')+1)
    notice.value = 'Banner prepared. Save your profile to upload it.'
  } catch (value) {
    if (request === initialization && session === getDiscordSession()) error.value = value instanceof Error ? value.message : 'Banner could not be prepared.'
  } finally { bitmap?.close(); processingBanner.value = false }
}
async function init() {
  const request = ++initialization
  generation++; selected.value = null; own.value = null; editing.value = false; notice.value = ''; error.value = ''
  bannerImage.value = undefined
  Object.assign(draft, { displayName: '', bio: '', pronouns: '', status: '', accent: '#9f72ff', banner: '#38205c', website: '', showcase: '', favoritePlugin: '', public: true, revision: 0, badgeIds: [],
    appearance: { background: 'none', frame: 'none', decoration: 'none' }, servers: [] })
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
    <header class="members-heading"><div><p>LUMEN / COMMUNITY MEMBERS</p><h1>{{ props.editOwn ? 'My profile' : 'Meet the people behind the servers.' }}</h1><span>Profiles are visible to everyone. Only you can edit yours.</span></div><button v-if="own" :disabled="saving || processingBanner" @click="edit">Edit my profile</button></header>
    <form class="member-search" @submit.prevent="directory(1)"><label for="member-search">Search names or Discord user IDs</label><div><input id="member-search" v-model="search" maxlength="60" placeholder="Find a member…"><button :disabled="loading || saving">Search</button></div></form>
    <p v-if="error" class="members-error" role="alert">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p><p v-if="loading" role="status">Loading members…</p>
    <div class="members-layout">
      <section class="members-directory" aria-label="Member search results"><button v-for="member in results" :key="member.id" :disabled="saving" @click="open(member.id)" :style="{ borderLeftColor: member.accent }"><img v-if="member.avatarUrl" :src="member.avatarUrl" alt="" referrerpolicy="no-referrer"><span v-else class="member-initial">{{ member.displayName.slice(0,2) }}</span><span><strong>{{ member.displayName }}</strong><small>@{{ member.username }}</small><span class="profile-badges"><LoyaltyBadge v-for="badge in member.badges ?? (member.tier ? [member.tier] : [])" :key="badge.id" :tier="badge" compact /></span></span></button><p v-if="!loading && !results.length">No published profiles found.</p><nav v-if="total > 20"><button :disabled="page === 1 || loading || saving" @click="directory(page-1)">Previous</button><span>{{ page }} / {{ Math.ceil(total/20) }}</span><button :disabled="page*20 >= total || loading || saving" @click="directory(page+1)">Next</button></nav></section>
      <div>
        <article v-if="preview" class="member-profile" :style="{ '--profile-accent': preview.accent, '--profile-banner': preview.banner }">
          <ProfileBackdrop :preset="preview.appearance?.background || 'none'" />
          <div class="member-banner"><img v-if="bannerSource" :src="bannerSource" alt="Profile banner"><span v-if="editing">LIVE PREVIEW</span></div>
          <div class="member-profile-body"><ProfileAvatar class="member-avatar-display" :name="preview.displayName" :url="preview.avatarUrl" :frame="preview.appearance?.frame || 'none'" :decoration="preview.appearance?.decoration || 'none'" />
            <h2>{{ preview.displayName }}</h2><p class="member-handle">@{{ preview.username }} <span v-if="preview.pronouns">· {{ preview.pronouns }}</span></p>
            <div class="profile-badges profile-loyalty"><LoyaltyBadge v-for="badge in preview.badges ?? (preview.tier ? [preview.tier] : [])" :key="badge.id" :tier="badge" /></div>
            <p v-if="preview.status" class="member-status">{{ preview.status }}</p><h3>About me</h3><p class="member-bio">{{ preview.bio || 'Nothing here yet.' }}</p>
            <p v-if="preview.favoritePlugin"><strong>Favorite plugin</strong> · {{ preview.favoritePlugin }}</p>
            <div class="member-links"><a v-if="preview.website && /^https:\/\//.test(preview.website)" :href="preview.website" target="_blank" rel="noopener noreferrer">Website ↗</a><a v-if="preview.showcase && /^https:\/\//.test(preview.showcase)" :href="preview.showcase" target="_blank" rel="noopener noreferrer">Server showcase ↗</a></div>
            <ServerShowcases v-if="preview.servers?.length" :servers="preview.servers" />
            <small>Profile created {{ new Date(preview.joinedAt).toLocaleDateString() }}</small><small v-if="preview.tierCheckedAt">Badge verified {{ new Date(preview.tierCheckedAt).toLocaleDateString() }} · refreshes from licensing</small>
            <button v-if="!editing" @click="copyLink">Copy profile link</button>
          </div>
        </article>
        <p v-else class="member-placeholder">Choose a member to open their profile, or edit your own after signing in.</p>
        <form v-if="editing && own" class="member-editor" @submit.prevent="save"><h2>Customize your profile</h2><fieldset :disabled="saving || processingBanner">
          <section class="profile-cosmetics" aria-label="Profile appearance">
            <h3>Profile appearance</h3>
            <p>Backgrounds and frames unlock at Spark. Avatar decorations unlock at Radiance. Higher tiers inherit these options.</p>
            <label>Upload banner image<input type="file" accept="image/png,image/jpeg,image/webp" @change="uploadBanner"></label>
            <p>PNG, JPEG or WebP up to 8 MiB. Center-cropped to 1200 x 400 and stored as a static WebP. Save to upload.</p>
            <button type="button" @click="bannerImage=null">Remove banner image</button>
            <label>Background<select v-model="draft.appearance.background" :disabled="!own.cosmeticAccess?.backgrounds"><option v-for="preset in backgrounds" :key="preset.id" :value="preset.id">{{ preset.name }} / {{ preset.animated ? 'Animated' : 'Static' }}</option></select></label>
            <div class="background-picker"><button v-for="preset in backgrounds.filter(preset=>preset.id!=='none')" :key="preset.id" type="button" :disabled="!own.cosmeticAccess?.backgrounds" :aria-pressed="draft.appearance.background===preset.id" @click="draft.appearance.background=preset.id"><ProfileBackdrop :preset="preset.id" /><span>{{ preset.name }}</span><small>{{ preset.animated ? 'Animated' : 'Static' }}</small></button></div>
            <button type="button" @click="draft.appearance.background='none'">Classic background</button>
            <label>Avatar frame<select v-model="draft.appearance.frame" :disabled="!own.cosmeticAccess?.frames"><option v-for="frame in frames" :key="frame.id" :value="frame.id">{{ frame.name }}</option></select></label>
            <div class="avatar-picker"><button v-for="frame in frames.filter(frame=>frame.id!=='none')" :key="frame.id" type="button" :disabled="!own.cosmeticAccess?.frames" :aria-pressed="draft.appearance.frame===frame.id" @click="draft.appearance.frame=frame.id"><ProfileAvatar :name="own.displayName" :url="own.avatarUrl" :frame="frame.id" decoration="none" compact /><span>{{ frame.name }}</span></button></div>
            <button type="button" @click="draft.appearance.frame='none'">No frame</button>
            <label>Avatar decoration<select v-model="draft.appearance.decoration" :disabled="!own.cosmeticAccess?.decorations"><option v-for="decoration in decorations" :key="decoration.id" :value="decoration.id">{{ decoration.name }}</option></select></label>
            <div class="avatar-picker"><button v-for="decoration in decorations.filter(decoration=>decoration.id!=='none')" :key="decoration.id" type="button" :disabled="!own.cosmeticAccess?.decorations" :aria-pressed="draft.appearance.decoration===decoration.id" @click="draft.appearance.decoration=decoration.id"><ProfileAvatar :name="own.displayName" :url="own.avatarUrl" frame="none" :decoration="decoration.id" compact /><span>{{ decoration.name }}</span></button></div>
            <button type="button" @click="draft.appearance.decoration='none'">No decoration</button>
          </section>
          <section class="badge-picker" aria-labelledby="profile-badge-picker"><h3 id="profile-badge-picker">Displayed badges</h3><p>Choose any unlocked badges and earned achievements. Higher tiers include lower tiers; staff ranks include lower staff badges. Owner can select all eight rank/tier badges. Badges never grant permissions or loyalty perks.</p>
            <div class="badge-options"><label v-for="badge in own.availableBadges || []" :key="badge.id"><input v-model="draft.badgeIds" type="checkbox" :value="badge.id"><LoyaltyBadge :tier="badge" compact /></label></div>
            <p v-if="!own.availableBadges?.length">No badges unlocked yet.</p>
            <button v-if="own.availableBadges?.length" type="button" @click="draft.badgeIds=own.availableBadges.map(badge=>badge.id)">Show all unlocked</button><button type="button" @click="draft.badgeIds=[]">Hide badges</button>
          </section>
          <section class="profile-achievements" aria-labelledby="profile-achievements"><h3 id="profile-achievements">Achievements</h3><p>Save your changes to unlock profile achievements, then select them above. Community achievements count only visible public posts.</p>
            <article v-for="achievement in own.achievements || []" :key="achievement.id" :class="{earned:achievement.earned}"><LoyaltyBadge :tier="achievement" compact /><span>{{ achievement.description }}</span><strong>{{ achievement.earned ? 'Earned' : 'Locked' }}</strong></article>
          </section>
          <label>Display name<input v-model="draft.displayName" required maxlength="60"></label><label>Pronouns<input v-model="draft.pronouns" maxlength="40" placeholder="Optional"></label><label>Custom status<input v-model="draft.status" maxlength="80" placeholder="What are you building?"></label>
          <label>About me <small>{{ draft.bio.length }} / 600</small><textarea v-model="draft.bio" maxlength="600" rows="5" placeholder="Tell the community about yourself. No private information or credentials." /></label>
          <div class="member-colors"><label>Accent color<input v-model="draft.accent" type="color"></label><label>Banner color<input v-model="draft.banner" type="color"></label><button type="button" @click="resetAppearance">Reset colors</button></div>
          <label>Website<input v-model="draft.website" type="url" maxlength="500" placeholder="https://…"></label><label>Server showcase link<input v-model="draft.showcase" type="url" maxlength="500" placeholder="https://…"></label><label>Favorite plugin<input v-model="draft.favoritePlugin" maxlength="80"></label>
          <ServerShowcases :servers="draft.servers" editable @change="draft.servers=$event" />
          <p>Your profile and badge are public. Only you can edit this information. Ticket content, licenses, purchases and last-online activity are never included.</p>
          <button type="submit">{{ saving ? 'Saving…' : 'Save profile' }}</button><button type="button" @click="editing=false">Cancel</button>
        </fieldset></form>
      </div>
    </div>
  </main>
</template>
<style scoped>
.member-profile{position:relative;isolation:isolate}.member-profile>.profile-backdrop{opacity:.65}.member-profile:has(>.profile-backdrop) .member-banner{background:linear-gradient(130deg,color-mix(in srgb,var(--profile-banner) 55%,transparent),color-mix(in srgb,var(--profile-accent) 40%,transparent))}.member-profile-body{position:relative;background:color-mix(in srgb,var(--vp-c-bg-soft) 65%,transparent)}.member-banner img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.member-avatar-display{margin-top:-40px;z-index:2}
.background-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.background-picker button{position:relative;isolation:isolate;min-height:80px;overflow:hidden;text-align:left}.background-picker .profile-backdrop{opacity:.7}.background-picker span:not(.profile-backdrop),.background-picker small{position:relative;display:block;font-size:10px}.background-picker span:not(.profile-backdrop){margin-top:26px;background:var(--vp-c-bg-soft)}
.avatar-picker{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.avatar-picker button{display:grid;justify-items:center;gap:9px;min-height:88px}.avatar-picker button>span:last-child{font-size:10px}.profile-cosmetics select{width:100%;padding:10px;background:var(--vp-c-bg);color:var(--vp-c-text-1);border:1px solid var(--vp-c-divider);border-radius:8px}.profile-cosmetics button[aria-pressed=true]{border-color:var(--vp-c-brand-1)}
.profile-achievements article{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:10px 0;border-bottom:1px solid var(--vp-c-divider);opacity:.6}.profile-achievements article.earned{opacity:1}.profile-achievements article>span:not(.loyalty-badge){font-size:11px;flex:1;min-width:120px}.profile-achievements strong{font-size:10px}
@media(max-width:480px){.background-picker,.avatar-picker{grid-template-columns:repeat(2,minmax(0,1fr))}}
.profile-badges{display:flex;flex-wrap:wrap;gap:6px}.badge-picker{margin-top:18px}.badge-options{display:flex;flex-wrap:wrap;gap:8px}.member-editor .badge-options label{display:flex;align-items:center;gap:8px;margin:0;padding:8px;border:1px solid var(--vp-c-divider);border-radius:8px}
.profile-loyalty{margin-top:12px}
.members-layout>*{min-width:0}.members-directory button>span:last-child{min-width:0}.members-directory strong,.members-directory small,.member-profile h2,.member-handle,.member-status,.member-profile-body p{overflow-wrap:anywhere}.member-links{flex-wrap:wrap}
.members{max-width:1160px;margin:auto;padding:32px clamp(16px,3vw,32px) 64px}.members-heading{display:flex;gap:20px;align-items:center;justify-content:space-between;margin-bottom:24px}.members-heading p{font-size:11px;letter-spacing:.14em;color:var(--vp-c-brand-1)}.members h1{font-size:clamp(1.8rem,4vw,3rem);line-height:1.1;letter-spacing:-.04em}.members-heading span,.members p,.members small{color:var(--vp-c-text-2)}.members button{padding:9px 13px;border:1px solid var(--vp-c-divider);border-radius:9px;background:var(--vp-c-bg-soft);color:var(--vp-c-text-1);font-size:12px}.members button:disabled{opacity:.5}.members input:not([type=color],[type=checkbox]),.members textarea{width:100%;padding:10px;border:1px solid var(--vp-c-divider);border-radius:8px;background:var(--vp-c-bg);color:var(--vp-c-text-1)}.member-search>div{display:flex;gap:10px}.member-search label{display:block;margin-bottom:8px;font-size:12px}.members-layout{display:grid;grid-template-columns:minmax(200px,.7fr) minmax(0,1.3fr);gap:24px;margin-top:24px}.members-directory>button{display:flex;align-items:center;gap:12px;text-align:left;width:100%;padding:15px;margin-bottom:9px;border-left-width:3px}.members-directory img,.members-directory .member-initial{width:42px;height:42px;border-radius:50%;flex-shrink:0}.members-directory button>span:last-child{display:grid;gap:3px}.members-directory small{font-size:11px}.members-directory em{font-size:10px;font-style:normal;color:var(--vp-c-brand-1)}.members-directory nav{display:flex;align-items:center;gap:8px;font-size:11px}.member-profile{border:1px solid var(--profile-accent);border-radius:20px;overflow:hidden;background:var(--vp-c-bg-soft);box-shadow:0 12px 40px #0001}.member-banner{height:130px;background:linear-gradient(130deg,var(--profile-banner),var(--profile-accent));position:relative}.member-banner:after{content:"";position:absolute;inset:0;background:linear-gradient(135deg,transparent 50%,#ffffff12 50%);background-size:44px 44px}.member-banner>span{position:relative;z-index:1;padding:10px;font-size:10px;color:white}.member-profile-body{padding:0 24px 24px}.member-avatar{position:relative;width:80px;height:80px;border-radius:50%;border:6px solid var(--vp-c-bg-soft);margin-top:-40px;object-fit:cover}.member-initial{display:grid;place-items:center;background:var(--vp-c-brand-soft);font-weight:800;color:var(--vp-c-text-1)}.member-profile h2{margin:10px 0 4px;border:0;font-size:1.7rem}.member-handle{margin:0;font-size:12px}.profile-tier{display:inline-block;margin-top:12px;padding:4px 9px;border:1px solid var(--profile-accent);border-radius:6px;font-size:11px;font-weight:750}.profile-tier.elite{background:linear-gradient(110deg,#9f72ff22,#e7c76e22,#9f72ff22);background-size:200%;animation:member-elite 5s ease infinite}.member-status{padding:10px 12px;border:1px solid var(--vp-c-divider);border-radius:10px;font-size:13px}.member-profile h3{font-size:11px;letter-spacing:.1em;text-transform:uppercase;margin-top:22px}.member-bio{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.7;font-size:13px}.member-links{display:flex;gap:12px;margin:18px 0;font-size:12px}.member-profile-body>small{display:block;font-size:10px;margin:5px 0}.member-profile-body>button{margin-top:14px}.member-editor{padding:22px;margin-top:20px;border:1px solid var(--vp-c-divider);border-radius:16px}.member-editor h2{border:0;font-size:1.3rem}.member-editor fieldset{border:0;padding:0}.member-editor label{display:grid;gap:6px;margin:14px 0;font-size:12px}.member-colors{display:flex;align-items:center;gap:20px;flex-wrap:wrap}.member-colors input{width:70px;height:36px}.member-editor .member-visibility{display:flex;align-items:flex-start;gap:8px;line-height:1.7}.member-editor p{font-size:11px;line-height:1.6}.member-editor button{margin-right:8px}.members-error{border:1px solid #d96176;padding:12px;border-radius:8px}.member-placeholder{padding:30px;border:1px dashed var(--vp-c-divider);border-radius:16px;font-size:13px}@keyframes member-elite{50%{background-position:100% 50%}}@media(max-width:700px){.members-layout{grid-template-columns:1fr}.members-heading{align-items:flex-start;flex-direction:column}}@media(prefers-reduced-motion:reduce){.profile-tier.elite{animation:none}}
</style>
