<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { studioRequest } from './studio-api'
import { getDiscordSession } from './discord-session'
import { clearStaffPreferences, readStaffPreferences, toggleStaffPreference } from './staff-preferences.mjs'
import RichContent from './RichContent.vue'

interface Guide { id: string; category: string; title: string; summary: string; body: string }
interface Actor { id: string; roleName: string; permissions: string[] }
const guides = ref<Guide[]>([])
const actor = ref<Actor | null>(null)
const query = ref('')
const category = ref('All guides')
const selected = ref('start-here')
const shelf = ref('All')
const preferences = ref<{ saved: string[]; read: string[] }>({ saved: [], read: [] })
const preferenceError = ref('')
const notice = ref('')
const focusReader = ref(false)
const reader = ref<HTMLElement | null>(null)
const checklist = [
  'Review open tickets and escalations',
  'Check incidents and current service status',
  'Confirm the next owner for unresolved work',
  'Review pending trial requests if authorized',
  'Leave a clear handover before signing off',
]
const completedSteps = ref<number[]>([])
const handoverTemplate = `STAFF HANDOVER
Ticket/reference:
Affected plugin and exact version:
Server software, build, and Java version:
Expected behavior:
Sanitized reproduction steps:
Checks already performed and their results:
Customer-safe next step:
Assigned staff member and next review:
Unverified or uncertain outcomes:

Exclude license keys, tokens, passwords, IP addresses, and customer personal data.`
const loading = ref(false)
const error = ref('')
const categories = ['All guides', 'Staff handbook', 'Developer desk', 'Plugin playbooks']
const filtered = computed(() => guides.value.filter(guide =>
  (category.value === 'All guides' || guide.category === category.value) &&
  (shelf.value === 'All' || (shelf.value === 'Saved' ? preferences.value.saved.includes(guide.id) : !preferences.value.read.includes(guide.id))) &&
  `${guide.title} ${guide.summary} ${guide.body}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const current = computed(() => filtered.value.find(guide => guide.id === selected.value) ?? filtered.value[0])
const currentIndex = computed(() => filtered.value.findIndex(guide => guide.id === current.value?.id))
const readCount = computed(() => guides.value.filter(guide => preferences.value.read.includes(guide.id)).length)
const sections = computed(() => {
  if (!current.value) return []
  return current.value.body.split(/^### /m).filter(Boolean).map((text, index) => {
    const split = text.indexOf('\n')
    return { id: `guide-section-${index}`, title: split < 0 ? text : text.slice(0, split), body: split < 0 ? '' : text.slice(split + 1).trim() }
  })
})
const readingMinutes = computed(() => Math.max(1, Math.ceil((current.value?.body.split(/\s+/).length || 0) / 180)))
const can = (permission: string) => actor.value?.permissions.includes(permission)
const actions = computed(() => [
  { title: 'Ticket queue', detail: 'Triage support and follow up.', href: '/admin/#tickets', permission: 'tickets.view' },
  { title: 'Customer access', detail: 'Check licenses and restrictions.', href: '/admin/', permission: 'customers.view' },
  { title: 'Plugins & products', detail: 'Manage registry and private builds.', href: '/admin/#products', permission: 'plugins.view' },
  { title: 'Website settings', detail: 'Manage intake and role policies.', href: '/admin/#settings', permission: 'settings.view' },
].filter(action => can('dashboard.view') && can(action.permission)))
let generation = 0
let session = ''
let timer: ReturnType<typeof setInterval> | undefined
let controller: AbortController | null = null
function readLocation() {
  const params = new URLSearchParams(window.location.search)
  const requestedCategory = params.get('category')
  category.value = requestedCategory && categories.includes(requestedCategory) ? requestedCategory : 'All guides'
  selected.value = params.get('guide') || 'start-here'
  query.value = ''; shelf.value = 'All'
}
function resetPrivateState() {
  actor.value = null; guides.value = []; preferences.value = { saved: [], read: [] }
  completedSteps.value = []; notice.value = ''; preferenceError.value = ''
}
async function load() {
  const id = ++generation
  const token = getDiscordSession()
  if (session !== token) resetPrivateState()
  session = token
  controller?.abort()
  controller = new AbortController()
  actor.value = null; guides.value = []; error.value = ''; loading.value = true
  try {
    const result = await studioRequest<{ actor: Actor; guides: Guide[] }>('/staff/docs', { signal: controller.signal })
    if (id !== generation || token !== getDiscordSession()) return
    actor.value = result.actor; guides.value = result.guides
    try { preferences.value = readStaffPreferences(localStorage, result.actor.id); preferenceError.value = '' }
    catch (value) { preferences.value = { saved: [], read: [] }; preferenceError.value = messageOf(value) }
  } catch (value) {
    if (id === generation) { resetPrivateState(); error.value = messageOf(value) }
  } finally { if (id === generation) loading.value = false }
}
function messageOf(value: unknown) { return value instanceof Error ? value.message : 'Staff tools could not complete this action.' }
function togglePreference(field: 'saved' | 'read') {
  if (!actor.value || !current.value) return
  try {
    preferences.value = toggleStaffPreference(localStorage, actor.value.id, field, current.value.id)
    preferenceError.value = ''
  } catch (value) { preferenceError.value = messageOf(value) }
}
function resetPreferences() {
  if (!actor.value) return
  try { clearStaffPreferences(localStorage, actor.value.id); preferences.value = { saved: [], read: [] }; preferenceError.value = '' }
  catch (value) { preferenceError.value = messageOf(value) }
}
async function chooseGuide(id: string) {
  selected.value = id
  await nextTick()
  reader.value?.focus({ preventScroll: true })
}
function moveGuide(offset: number) {
  const guide = filtered.value[currentIndex.value + offset]
  if (guide) void chooseGuide(guide.id)
}
function jumpToSection(id: string) {
  const section = document.getElementById(id)
  section?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })
  section?.focus({ preventScroll: true })
}
async function copyHandover() {
  notice.value = ''
  try { await navigator.clipboard.writeText(handoverTemplate); notice.value = 'Blank handover template copied. Complete it in a private staff ticket.' }
  catch (value) { notice.value = `Copy failed: ${messageOf(value)} Select the displayed template to copy manually.` }
}
function toggleStep(index: number) {
  completedSteps.value = completedSteps.value.includes(index) ? completedSteps.value.filter(step => step !== index) : [...completedSteps.value, index]
}
function changed() { if (session !== getDiscordSession()) void load() }
function recheck() { if (!document.hidden && !loading.value) void load() }
onMounted(() => {
  readLocation()
  void load()
  window.addEventListener('lumen-staff-route', readLocation)
  window.addEventListener('lumen-discord-user', changed)
  window.addEventListener('storage', changed)
  window.addEventListener('focus', recheck)
  timer = setInterval(recheck, 60000)
})
onUnmounted(() => {
  generation++; controller?.abort(); resetPrivateState()
  window.removeEventListener('lumen-staff-route', readLocation)
  window.removeEventListener('lumen-discord-user', changed)
  window.removeEventListener('storage', changed)
  window.removeEventListener('focus', recheck)
  clearInterval(timer)
})
</script>

<template>
  <main class="staff-knowledge" :class="{ 'is-focused': focusReader }">
    <header class="knowledge-hero">
      <div><p class="knowledge-kicker">LUMEN / STAFF CENTER</p><h1>Your shift.<br><span>Your command center.</span></h1><p>One home for studio operations, product support, and the knowledge your team needs.</p></div>
      <span class="knowledge-badge">{{ actor?.roleName || 'Staff access required' }}</span>
    </header>
    <nav class="knowledge-actions" aria-label="Staff shortcuts">
      <a href="/">Exit staff mode</a>
      <a v-if="can('dashboard.view')" href="/admin/">Staff Dashboard</a>
      <a v-if="can('tickets.view') && can('dashboard.view')" href="/admin/">Ticket queue</a>
      <button type="button" :disabled="loading" @click="load">Recheck access</button>
    </nav>
    <p v-if="loading" role="status" class="knowledge-message">Verifying staff access and loading private guides...</p>
    <p v-if="error" role="alert" class="knowledge-message">{{ error }} No private guides are shown without verified access.</p>
    <template v-if="actor">
      <section class="knowledge-overview" aria-label="Staff command center">
        <div class="knowledge-metrics"><span><strong>{{ guides.length }}</strong>private guides</span><span><strong>{{ readCount }}</strong>marked read</span><span><strong>{{ completedSteps.length }}/{{ checklist.length }}</strong>shift checks</span></div>
        <div v-if="actions.length" class="knowledge-launchpad">
          <a v-for="action in actions" :key="action.title" :href="action.href"><strong>{{ action.title }} <span aria-hidden="true">↗</span></strong><span>{{ action.detail }}</span></a>
        </div>
        <div class="knowledge-shift-tools">
          <section class="knowledge-tool-card">
            <p class="knowledge-kicker">SHIFT CHECKLIST</p><h2>Start prepared.</h2>
            <label v-for="(step, index) in checklist" :key="step"><input type="checkbox" :checked="completedSteps.includes(index)" @change="toggleStep(index)">{{ step }}</label>
            <p>Personal checklist for this visit, not an audit record.</p><button type="button" @click="completedSteps = []">Reset checklist</button>
          </section>
          <section class="knowledge-tool-card">
            <p class="knowledge-kicker">ESCALATION &amp; HANDOVER</p><h2>Make the next step clear.</h2><p>Copy a blank structured template. Complete it in a private ticket, never with credentials.</p>
            <button type="button" @click="copyHandover">Copy handover template</button>
            <details><summary>Preview template</summary><pre>{{ handoverTemplate }}</pre></details>
            <p v-if="notice" role="status">{{ notice }}</p>
          </section>
        </div>
      </section>
      <div class="knowledge-tools">
        <div class="knowledge-library-heading"><div><p class="knowledge-kicker">PRIVATE KNOWLEDGE LIBRARY</p><h2>Find the right playbook.</h2></div><button type="button" :aria-pressed="focusReader" @click="focusReader = !focusReader">{{ focusReader ? 'Show command center' : 'Focus on guides' }}</button></div>
        <label>Search staff knowledge<input v-model="query" type="search" placeholder="Licenses, tickets, builds, incidents..."></label>
        <nav aria-label="Guide categories"><button v-for="name in categories" :key="name" type="button" :aria-pressed="category === name" @click="category = name">{{ name }}</button></nav>
        <nav class="knowledge-shelves" aria-label="Personal guide filters"><button v-for="name in ['All', 'Saved', 'Unread']" :key="name" type="button" :aria-pressed="shelf === name" @click="shelf = name">{{ name }}</button><span>{{ filtered.length }} matching guides</span></nav>
        <p v-if="preferenceError" role="alert">{{ preferenceError }} <button type="button" @click="resetPreferences">Reset guide preferences</button></p>
      </div>
      <div class="knowledge-layout">
        <aside aria-label="Staff guides">
          <button v-for="guide in filtered" :key="guide.id" type="button" :aria-current="current?.id === guide.id ? 'page' : undefined" @click="chooseGuide(guide.id)">
            <small>{{ guide.category }} <span v-if="preferences.read.includes(guide.id)"> / READ</span><span v-if="preferences.saved.includes(guide.id)"> / SAVED</span></small><strong>{{ guide.title }}</strong><span>{{ guide.summary }}</span>
          </button>
          <p v-if="!filtered.length">No guides match. Try a shorter search.</p>
        </aside>
        <article v-if="current" ref="reader" class="knowledge-article" :key="current.id" tabindex="-1" aria-label="Selected staff guide">
          <header><p class="knowledge-kicker">{{ current.category }} / {{ readingMinutes }} MIN READ</p><h2>{{ current.title }}</h2><p class="knowledge-summary">{{ current.summary }}</p>
            <div class="knowledge-reader-actions"><button type="button" :aria-pressed="preferences.saved.includes(current.id)" @click="togglePreference('saved')">{{ preferences.saved.includes(current.id) ? 'Unsave guide' : 'Save guide' }}</button><button type="button" :aria-pressed="preferences.read.includes(current.id)" @click="togglePreference('read')">{{ preferences.read.includes(current.id) ? 'Mark unread' : 'Mark as read' }}</button></div>
          </header>
          <nav class="knowledge-contents" aria-label="In this guide"><strong>IN THIS GUIDE</strong><button v-for="section in sections" :key="section.id" type="button" @click="jumpToSection(section.id)">{{ section.title }}</button></nav>
          <section v-for="(section, index) in sections" :id="section.id" :key="section.id" class="knowledge-section" tabindex="-1"><span class="knowledge-section-number">{{ String(index + 1).padStart(2, '0') }}</span><div><h3>{{ section.title }}</h3><RichContent :text="section.body" /></div></section>
          <footer class="knowledge-reader-actions"><button type="button" :disabled="currentIndex <= 0" @click="moveGuide(-1)">Previous guide</button><span>{{ currentIndex + 1 }} / {{ filtered.length }}</span><button type="button" :disabled="currentIndex >= filtered.length - 1" @click="moveGuide(1)">Next guide</button></footer>
        </article>
      </div>
    </template>
  </main>
</template>

<style scoped>
.staff-knowledge{max-width:1300px;margin:auto;padding:32px clamp(16px,4vw,48px) 80px;min-height:80vh;color:#f4edf0}
.knowledge-hero{position:relative;overflow:hidden;display:flex;justify-content:space-between;gap:20px;padding:clamp(24px,5vw,56px);border:1px solid #b6394959;border-radius:24px;background:radial-gradient(ellipse at 90% 0,#b01d3b38,transparent 65%),#101015;animation:knowledge-enter .55s ease both}
.knowledge-hero:after{content:"";position:absolute;right:-50px;top:-120px;width:300px;height:300px;border:1px solid #ff4d6233;border-radius:50%;box-shadow:0 0 70px #cf244c18;animation:knowledge-pulse 6s ease-in-out infinite;pointer-events:none}
.knowledge-kicker{font-size:.7rem;letter-spacing:.13em;text-transform:uppercase;color:#ff7a82;font-weight:700}
.knowledge-hero h1{font-size:clamp(2rem,5vw,3.7rem);line-height:1.08;letter-spacing:-.04em;margin:18px 0}
.knowledge-hero h1 span{color:#ff6969}.knowledge-hero p:not(.knowledge-kicker){max-width:550px;color:#c1b2ba}
.knowledge-badge{align-self:flex-start;white-space:nowrap;border:1px solid #ac425366;border-radius:100px;padding:8px 14px;color:#ff8c95;font-size:.75rem}
.knowledge-actions,.knowledge-tools nav{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}
.knowledge-actions a,.knowledge-actions button,.knowledge-tools nav button{padding:9px 14px;border:1px solid #59303b;border-radius:9px;background:#171219;color:#f2dbe2;font-size:.85rem}
.knowledge-tools{margin:28px 0}.knowledge-tools label{display:grid;gap:8px;font-weight:600}.knowledge-tools input{padding:13px 15px;border:1px solid #59303b;border-radius:10px;background:#121116;color:#f4edf0;width:100%;min-width:0}
.knowledge-tools button[aria-pressed=true]{background:#8d2636;border-color:#ee6377}.knowledge-layout{display:grid;grid-template-columns:minmax(230px,320px) minmax(0,1fr);gap:24px}
.knowledge-layout aside{display:flex;flex-direction:column;gap:10px}.knowledge-layout aside button{text-align:left;border:1px solid #38232e;padding:18px;border-radius:13px;display:grid;gap:7px;background:#121116;color:#f4edf0;transition:transform .2s,border-color .2s}
.knowledge-layout aside button:hover{transform:translateX(3px);border-color:#bf4c60}.knowledge-layout aside button[aria-current=page]{border-color:#ee6377;background:#441b2855}
.knowledge-layout aside small{font-size:.65rem;text-transform:uppercase;letter-spacing:.08em;color:#ef8496}.knowledge-layout aside span{font-size:.8rem;line-height:1.5;color:#bba8b3}
.knowledge-article{min-width:0;padding:clamp(20px,4vw,38px);border:1px solid #59303b;border-radius:17px;background:#131116;animation:knowledge-enter .3s ease both}.knowledge-article h2{font-size:1.8rem;line-height:1.2}.knowledge-summary{color:#bba8b3;margin:14px 0 26px}.knowledge-article :deep(pre){overflow:auto}.knowledge-article :deep(a){color:#ff8896}.knowledge-message{padding:18px;border:1px solid #a4485759;border-radius:12px;background:#27151d}
.staff-knowledge :is(button,a,input):focus-visible{outline:2px solid #ff8896;outline-offset:3px}.staff-knowledge button:disabled{opacity:.5}
.staff-knowledge h2,.staff-knowledge h3{font-weight:700;letter-spacing:-.025em}
.knowledge-overview{margin:30px 0 44px}
.knowledge-metrics{display:flex;gap:28px;flex-wrap:wrap;padding:20px 0;border-bottom:1px solid #59303b;color:#bfb3ba;font-size:.8rem}
.knowledge-metrics span{display:flex;align-items:baseline;gap:9px}.knowledge-metrics strong{font-size:1.6rem;color:#ff8896}
.knowledge-launchpad{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:22px 0}
.knowledge-launchpad a{display:grid;align-content:start;gap:10px;min-width:0;padding:20px;border:1px solid #59303b;border-radius:14px;background:linear-gradient(145deg,#25131b,#111015);transition:transform .2s,border-color .2s}
.knowledge-launchpad a:hover{transform:translateY(-3px);border-color:#ff8896}.knowledge-launchpad strong{font-size:.9rem}.knowledge-launchpad strong span{color:#ff8896}.knowledge-launchpad a>span{font-size:.78rem;color:#bfb3ba;line-height:1.6}
.knowledge-shift-tools{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.knowledge-tool-card{min-width:0;padding:24px;border:1px solid #59303b;border-radius:17px;background:#131116}
.knowledge-tool-card h2,.knowledge-library-heading h2{font-size:1.5rem;margin:10px 0 18px;line-height:1.3}
.knowledge-tool-card p:not(.knowledge-kicker){font-size:.8rem;line-height:1.7;color:#bfb3ba}
.knowledge-tool-card label{display:flex;align-items:flex-start;gap:10px;margin:13px 0;line-height:1.6;font-size:.85rem}
.knowledge-tool-card input{flex-shrink:0;width:16px;height:16px;margin-top:4px}
.knowledge-tool-card button,.knowledge-library-heading button,.knowledge-reader-actions button,.knowledge-tools>p button{padding:9px 13px;border:1px solid #59303b;border-radius:9px;background:#28151f;color:#f2dbe2;font-size:.8rem}
.knowledge-tool-card details{margin-top:20px}.knowledge-tool-card summary{cursor:pointer;color:#ff8896;font-size:.8rem}.knowledge-tool-card pre{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:12px;font-size:.75rem;color:#bfb3ba}
.knowledge-library-heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:20px}
.knowledge-shelves{align-items:center}.knowledge-shelves>span{margin-left:auto;color:#bfb3ba;font-size:.78rem}
.knowledge-layout{align-items:start}.knowledge-layout aside{max-height:850px;overflow-y:auto;padding:2px 8px 4px 2px}
.knowledge-article{padding:0;overflow:hidden}.knowledge-article>header{padding:28px clamp(20px,3vw,36px);background:linear-gradient(135deg,#33172177,#131116);border-bottom:1px solid #59303b}
.knowledge-summary{line-height:1.7;font-size:.9rem;margin-bottom:20px}
.knowledge-reader-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.knowledge-reader-actions button[aria-pressed=true]{border-color:#ff8896;background:#8d2636}.knowledge-reader-actions span{color:#bfb3ba;font-size:.8rem}
.knowledge-article footer{justify-content:space-between;padding:24px;border-top:1px solid #59303b}
.knowledge-contents{display:grid;gap:9px;margin:24px clamp(20px,3vw,36px);padding:20px;border:1px solid #59303b;border-radius:12px;background:#0e0c10}
.knowledge-contents strong{font-size:.65rem;letter-spacing:.12em;color:#a6939c;margin-bottom:4px}
.knowledge-contents button{text-align:left;color:#ff8896;font-size:.85rem;line-height:1.5}
.knowledge-section{display:flex;gap:16px;margin:0 clamp(20px,3vw,36px);padding:28px 0;border-top:1px solid #38232e;scroll-margin-top:100px}
.knowledge-section-number{flex-shrink:0;display:grid;place-items:center;align-self:flex-start;width:30px;height:30px;border-radius:8px;background:#441b2855;color:#ff8896;font-size:.7rem;font-family:var(--vp-font-family-mono)}
.knowledge-section>div{min-width:0}.knowledge-section h3{font-size:1.13rem;line-height:1.4;margin:0 0 16px}
.knowledge-section :deep(.rich-content){font-size:.9rem;line-height:1.85;color:#d9cdd3}
.knowledge-section :deep(p){margin:0 0 14px}.knowledge-section :deep(ul),.knowledge-section :deep(ol){padding-left:22px;margin:12px 0;list-style:revert}.knowledge-section :deep(li){padding:4px 0}
.knowledge-section :deep(pre){padding:18px;border:1px solid #59303b;border-radius:10px;background:#09090c;font-size:.8rem;line-height:1.7}
.knowledge-section :deep(code){color:#ffabb5;font-family:var(--vp-font-family-mono);font-size:.86em}
.is-focused .knowledge-overview,.is-focused .knowledge-hero{display:none}
@media(max-width:1100px){.knowledge-launchpad{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:760px){.knowledge-shift-tools{grid-template-columns:1fr}.knowledge-layout aside{max-height:360px}.knowledge-library-heading{align-items:flex-start;flex-direction:column}.knowledge-section{gap:10px}.knowledge-section-number{width:24px;height:24px}}
@media(max-width:460px){.knowledge-launchpad{grid-template-columns:1fr}.knowledge-metrics{gap:16px}.knowledge-hero h1{font-size:2rem;overflow-wrap:anywhere}}
@keyframes knowledge-enter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes knowledge-pulse{50%{transform:scale(1.1);opacity:.55}}
@media(max-width:760px){.knowledge-layout{grid-template-columns:1fr}.knowledge-hero{flex-direction:column}.knowledge-layout aside{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:460px){.knowledge-layout aside{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.knowledge-hero,.knowledge-hero:after,.knowledge-article{animation:none}.knowledge-layout aside button,.knowledge-launchpad a{transition:none}.knowledge-layout aside button:hover,.knowledge-launchpad a:hover{transform:none}}
</style>
