<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { studioRequest } from './studio-api'
import { getDiscordSession } from './discord-session'
import RichContent from './RichContent.vue'

interface Guide { id: string; category: string; title: string; summary: string; body: string }
interface Actor { roleName: string; permissions: string[] }
const guides = ref<Guide[]>([])
const actor = ref<Actor | null>(null)
const query = ref('')
const category = ref('All guides')
const selected = ref('start-here')
const loading = ref(false)
const error = ref('')
const categories = ['All guides', 'Staff handbook', 'Developer desk']
const filtered = computed(() => guides.value.filter(guide =>
  (category.value === 'All guides' || guide.category === category.value) &&
  `${guide.title} ${guide.summary} ${guide.body}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const current = computed(() => filtered.value.find(guide => guide.id === selected.value) ?? filtered.value[0])
const can = (permission: string) => actor.value?.permissions.includes(permission)
let generation = 0
let session = ''
let timer: ReturnType<typeof setInterval> | undefined
let controller: AbortController | null = null
async function load() {
  const id = ++generation
  const token = getDiscordSession()
  session = token
  controller?.abort()
  controller = new AbortController()
  actor.value = null; guides.value = []; error.value = ''; loading.value = true
  try {
    const result = await studioRequest<{ actor: Actor; guides: Guide[] }>('/staff/docs', { signal: controller.signal })
    if (id !== generation || token !== getDiscordSession()) return
    actor.value = result.actor; guides.value = result.guides
  } catch (value) {
    if (id === generation) error.value = value instanceof Error ? value.message : 'Staff guides could not be loaded.'
  } finally { if (id === generation) loading.value = false }
}
function changed() { if (session !== getDiscordSession()) void load() }
function recheck() { if (!document.hidden && !loading.value) void load() }
onMounted(() => {
  document.documentElement.classList.add('lumen-staff-mode')
  void load()
  window.addEventListener('lumen-discord-user', changed)
  window.addEventListener('storage', changed)
  window.addEventListener('focus', recheck)
  timer = setInterval(recheck, 60000)
})
onUnmounted(() => {
  generation++; controller?.abort(); guides.value = []; actor.value = null
  document.documentElement.classList.remove('lumen-staff-mode')
  window.removeEventListener('lumen-discord-user', changed)
  window.removeEventListener('storage', changed)
  window.removeEventListener('focus', recheck)
  clearInterval(timer)
})
</script>

<template>
  <main class="staff-knowledge">
    <header class="knowledge-hero">
      <div><p class="knowledge-kicker">LUMEN / STAFF MODE</p><h1>Behind the studio.<br><span>Ready to help.</span></h1><p>Private playbooks, developer references, and clear next steps for the team.</p></div>
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
      <div class="knowledge-tools">
        <label>Search staff knowledge<input v-model="query" type="search" placeholder="Licenses, tickets, builds, incidents..."></label>
        <nav aria-label="Guide categories"><button v-for="name in categories" :key="name" type="button" :aria-pressed="category === name" @click="category = name">{{ name }}</button></nav>
      </div>
      <div class="knowledge-layout">
        <aside aria-label="Staff guides">
          <button v-for="guide in filtered" :key="guide.id" type="button" :aria-current="selected === guide.id ? 'page' : undefined" @click="selected = guide.id">
            <small>{{ guide.category }}</small><strong>{{ guide.title }}</strong><span>{{ guide.summary }}</span>
          </button>
          <p v-if="!filtered.length">No guides match. Try a shorter search.</p>
        </aside>
        <article v-if="current" class="knowledge-article" :key="current.id">
          <p class="knowledge-kicker">{{ current.category }}</p><h2>{{ current.title }}</h2><p class="knowledge-summary">{{ current.summary }}</p>
          <RichContent :text="current.body" />
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
@keyframes knowledge-enter{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}@keyframes knowledge-pulse{50%{transform:scale(1.1);opacity:.55}}
@media(max-width:760px){.knowledge-layout{grid-template-columns:1fr}.knowledge-hero{flex-direction:column}.knowledge-layout aside{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:460px){.knowledge-layout aside{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){.knowledge-hero,.knowledge-hero:after,.knowledge-article{animation:none}.knowledge-layout aside button{transition:none}.knowledge-layout aside button:hover{transform:none}}
</style>
