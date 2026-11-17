<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { communityDate, communityRequest } from './community-api'
import { getDiscordSession } from './discord-session'

type WindowName = 'daily' | 'weekly' | 'monthly' | 'all-time'
type Leader = { id: string; name: string; level: number; windowXp: number; totalXp: number }
type Log = { staffId: string; staffName: string; points: number; source: 'ticket_close' | 'rating_bonus' | 'starter_bonus'; ticketId: string; createdAt: string }
const windowName = ref<WindowName>('weekly')
const leaderboard = ref<Leader[]>([])
const logs = ref<Log[]>([])
const currentStaff = ref({ level: 1, totalXp: 0 })
const loading = ref(false)
const error = ref('')
const periods: { id: WindowName; label: string; detail: string }[] = [
  { id: 'daily', label: 'Daily', detail: 'Resets at midnight UTC' },
  { id: 'weekly', label: 'Weekly', detail: 'Resets Monday at 00:00 UTC' },
  { id: 'monthly', label: 'Monthly', detail: 'Resets on the first of each month, UTC' },
  { id: 'all-time', label: 'All time', detail: 'Every earned point. No resets.' },
]
const labels: Record<WindowName, string> = { daily: 'Today', weekly: 'This week', monthly: 'This month', 'all-time': 'All time' }
const motionPaused = ref(false)
const podium = computed(() => leaderboard.value.slice(0, 3))
const remainingLeaders = computed(() => leaderboard.value.slice(3))
const periodXp = computed(() => leaderboard.value.reduce((sum, member) => sum + member.windowXp, 0))
const levelProgress = computed(() => currentStaff.value.totalXp % 100)
const formatNumber = (value: number) => value.toLocaleString()
const initials = (name: string) => name.trim().slice(0, 2).toUpperCase()
let generation = 0

async function load() {
  const request = ++generation, token = getDiscordSession()
  leaderboard.value = []; logs.value = []; currentStaff.value = { level: 1, totalXp: 0 }
  loading.value = true
  error.value = ''
  try {
    const result = await communityRequest<{
      leaderboard: Leader[]
      logs: Log[]
      currentStaff: { level: number; totalXp: number }
    }>(`/staff/progression?window=${windowName.value}`)
    if (request !== generation || token !== getDiscordSession()) return
    leaderboard.value = result.leaderboard
    logs.value = result.logs
    currentStaff.value = result.currentStaff
  } catch (requestError) {
    if (request === generation && token === getDiscordSession()) error.value = requestError instanceof Error ? requestError.message : 'Could not load the staff leaderboard.'
  } finally { if (request === generation) loading.value = false }
}

watch(windowName, () => { void load() })
function sessionChanged() { void load() }
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', sessionChanged); window.addEventListener('storage', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged); window.removeEventListener('storage', sessionChanged) })
</script>

<template>
  <section id="staff-leaderboard" class="website-panel staff-progression" :class="{ 'motion-paused': motionPaused }" aria-labelledby="staff-progression-title">
    <div class="xp-atmosphere" aria-hidden="true"><span v-for="spark in 10" :key="spark" :style="{ '--spark': spark }"></span></div>
    <header class="xp-hero">
      <div>
        <p class="xp-eyebrow"><span class="xp-signal" aria-hidden="true"></span> LUMEN / STAFF ARENA</p>
        <h3 id="staff-progression-title">Great support.<br><span>Legendary impact.</span></h3>
        <p class="xp-subtitle">Every ticket makes a difference. This is where your work shines.</p>
      </div>
      <div class="xp-hero-controls">
        <span class="xp-season">STAFF LEADERBOARD</span>
        <button type="button" class="xp-motion" :aria-pressed="motionPaused" @click="motionPaused = !motionPaused">{{ motionPaused ? 'Resume effects' : 'Pause effects' }}</button>
      </div>
    </header>
    <div class="xp-toolbar">
      <div class="xp-periods" role="group" aria-label="Leaderboard period">
        <button v-for="period in periods" :key="period.id" type="button" :aria-pressed="windowName === period.id" @click="windowName = period.id">{{ period.label }}</button>
      </div>
      <button type="button" class="xp-refresh" :disabled="loading" @click="load"><span aria-hidden="true">&#8635;</span> {{ loading ? 'Refreshing...' : 'Refresh' }}</button>
    </div>
    <p class="xp-reset">{{ periods.find(period => period.id === windowName)?.detail }} <span>Ranked by XP earned {{ labels[windowName].toLowerCase() }}</span></p>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <div v-else-if="loading" class="xp-loading" role="status"><span aria-hidden="true"></span>Loading the arena...</div>
    <template v-else>
      <div class="xp-overview">
        <section class="xp-personal" aria-label="Your staff progression">
          <div class="xp-level"><small>LVL</small><strong>{{ formatNumber(currentStaff.level) }}</strong></div>
          <div class="xp-personal-detail">
            <div><strong>Your next chapter</strong><span>{{ formatNumber(currentStaff.totalXp) }} lifetime XP</span></div>
            <div class="xp-progress" role="progressbar" aria-label="Progress to next level" :aria-valuenow="levelProgress" :aria-valuemin="0" :aria-valuemax="100"><span :style="{ width: `${levelProgress}%` }"></span></div>
            <small>{{ 100 - levelProgress }} XP to level {{ formatNumber(currentStaff.level + 1) }} <span>No level cap</span></small>
          </div>
        </section>
        <div class="xp-team-total"><small>{{ labels[windowName] }} / TEAM XP</small><strong>{{ formatNumber(periodXp) }}<span> XP</span></strong><span>{{ leaderboard.length }} ranked {{ leaderboard.length === 1 ? 'member' : 'members' }}</span></div>
      </div>
      <div class="xp-section-title"><h4>The front runners</h4><span>{{ labels[windowName] }}</span></div>
      <div v-if="podium.length" class="xp-podium" :class="{ 'is-solo': podium.length === 1 }">
        <article v-for="(member, index) in podium" :key="`${windowName}-${member.id}`" class="xp-contender" :class="`place-${index + 1}`">
          <div class="xp-card-sheen" aria-hidden="true"></div>
          <div class="xp-place"><span>#{{ index + 1 }}</span><small>{{ index === 0 ? 'TOP CONTRIBUTOR' : index === 1 ? 'RUNNER UP' : 'THIRD PLACE' }}</small></div>
          <svg v-if="index === 0" class="xp-crown" viewBox="0 0 32 26" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m3 6 6 7L16 3l7 10 6-7-3 16H6L3 6Z" /><path d="M7 25h18" /></svg>
          <div class="xp-avatar" aria-hidden="true">{{ initials(member.name) }}<span></span></div>
          <h5>{{ member.name }}</h5>
          <span class="xp-level-chip">LEVEL {{ formatNumber(member.level) }}</span>
          <p class="xp-score">{{ formatNumber(member.windowXp) }}<small>XP {{ labels[windowName].toLowerCase() }}</small></p>
          <p class="xp-lifetime">{{ formatNumber(member.totalXp) }} lifetime XP</p>
        </article>
      </div>
      <p v-else class="xp-empty">The arena is open. Close an eligible ticket to put your name on the board.</p>
      <ol v-if="remainingLeaders.length" class="xp-rankings" start="4" aria-label="More staff rankings">
        <li v-for="(member, index) in remainingLeaders" :key="member.id">
          <span class="xp-rank">#{{ index + 4 }}</span><span class="xp-row-avatar" aria-hidden="true">{{ initials(member.name) }}</span>
          <div class="xp-row-name"><strong>{{ member.name }}</strong><small>Level {{ formatNumber(member.level) }} / {{ formatNumber(member.totalXp) }} lifetime XP</small></div>
          <strong class="xp-row-score">{{ formatNumber(member.windowXp) }} <small>XP</small></strong>
        </li>
      </ol>
      <section class="xp-activity" aria-labelledby="staff-xp-log-title">
        <div class="xp-section-title"><h4 id="staff-xp-log-title">Recent staff XP awards</h4><span>All periods</span></div>
        <ul v-if="logs.length">
          <li v-for="(entry, index) in logs" :key="`${entry.ticketId}-${entry.source}-${index}`">
            <span class="xp-award-icon" aria-hidden="true">{{ entry.source === 'ticket_close' ? '+' : '&#9734;' }}</span>
            <div><strong>{{ entry.staffName }}</strong><p>{{ entry.source === 'starter_bonus' ? 'One-time staff starter bonus' : `${entry.source === 'ticket_close' ? 'Ticket closure' : 'Ticket rating bonus'} / #${entry.ticketId.slice(0, 8)}` }}</p><time :datetime="entry.createdAt">{{ communityDate(entry.createdAt) }}</time></div>
            <span class="xp-award-points">+{{ entry.points }} XP</span>
          </li>
        </ul>
        <p v-else class="xp-empty">Your team's next great moment will appear here.</p>
      </section>
    </template>
    <details class="xp-rules"><summary>How to earn XP</summary><p>Close a customer's ticket assigned to you after at least six of your public replies to earn 100 XP. Their one-time rating adds 20 XP per star. Each ticket awards XP only once. Levels use lifetime XP: every 100 XP earns another level, with no cap.</p></details>
  </section>
</template>

<style scoped>
.staff-progression.website-panel { --xp-accent: #ff746f; --xp-gold: #ffd28b; position: relative; isolation: isolate; overflow: hidden; max-width: 1200px; padding: clamp(20px, 4vw, 42px); border: 1px solid #553038; border-radius: 24px; background: #101015; color: #f5eef1; }
.staff-progression > :not(.xp-atmosphere) { position: relative; z-index: 1; }
.xp-atmosphere { position: absolute; z-index: 0; inset: 0; overflow: hidden; pointer-events: none; background: radial-gradient(ellipse at 10% 0, #9f283c28, transparent 48%), radial-gradient(ellipse at 100% 45%, #db653512, transparent 45%); }
.xp-atmosphere::before { content: ''; position: absolute; inset: -25%; background: conic-gradient(from 0deg, transparent 0 65%, #fa6b6b0b 75%, transparent 85%); animation: xp-orbit 36s linear infinite; }
.xp-atmosphere > span { position: absolute; left: calc(var(--spark) * 9%); bottom: -12px; width: 3px; height: 3px; border-radius: 50%; background: var(--xp-accent); box-shadow: 0 0 12px #ff746f70; opacity: 0; animation: xp-embers calc(8s + var(--spark) * 1.1s) calc(var(--spark) * -2s) linear infinite; }
.xp-hero { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 30px; }
.xp-eyebrow { display: flex; align-items: center; gap: 9px; margin: 0 0 18px; color: var(--xp-accent); font: 650 .62rem/1.5 var(--vp-font-family-mono); letter-spacing: .13em; }
.xp-signal { width: 6px; height: 6px; border-radius: 50%; background: var(--xp-accent); box-shadow: 0 0 0 4px #ff746f16; animation: xp-glow 4s ease-in-out infinite; }
.staff-progression h3 { margin: 0; color: #fff3f4; font-size: clamp(1.9rem, 4vw, 3.3rem); line-height: 1.08; letter-spacing: -.055em; }
.staff-progression h3 span { color: var(--xp-accent); }
.xp-subtitle { max-width: 380px; margin: 16px 0 0; color: #b6a7af; font-size: .82rem; line-height: 1.7; }
.xp-hero-controls { display: flex; align-items: flex-end; flex-direction: column; justify-content: space-between; gap: 16px; }
.xp-season { padding: 7px 10px; border: 1px solid #583039; border-radius: 6px; color: #e4a6a4; font: .56rem/1.5 var(--vp-font-family-mono); letter-spacing: .08em; white-space: nowrap; }
.staff-progression button { font: inherit; cursor: pointer; transition: background .2s, border-color .2s; }
.staff-progression button:disabled { opacity: .5; cursor: not-allowed; }
.staff-progression :is(button, summary):focus-visible { outline: 2px solid var(--xp-accent); outline-offset: 4px; }
.staff-progression .xp-motion { padding: 4px; border: 0; background: none; color: #beabb5; font-size: .65rem; }
.xp-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.xp-periods { display: flex; flex-wrap: wrap; gap: 4px; padding: 5px; border: 1px solid #34232b; border-radius: 12px; background: #0a0a0e; }
.xp-periods button { padding: 9px 16px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: #bbaab3; font-size: .75rem; font-weight: 650; }
.xp-periods button[aria-pressed=true] { border-color: #9e4b51; background: #57272f; color: #fff0ef; box-shadow: inset 0 1px 0 #ffffff0d, 0 2px 12px #0005; }
.xp-periods button:hover { color: white; background: #382028; }
.staff-progression .xp-refresh { display: flex; align-items: center; gap: 7px; padding: 9px 13px; border: 1px solid #49303a; border-radius: 8px; background: #171219; color: #e4cdd5; font-size: .7rem; }
.xp-refresh > span { font-size: 1.1rem; }
.xp-reset { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 7px; margin: 12px 0 24px; color: #b4a1ad; font-size: .63rem; }
.xp-reset > span { color: #dd9d9c; }
.xp-overview { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 14px; margin-bottom: 30px; }
.xp-personal { display: flex; align-items: center; gap: 18px; padding: 22px; border: 1px solid #5b303c; border-radius: 15px; background: linear-gradient(120deg, #371c29c0, #171219); }
.xp-level { display: grid; flex-shrink: 0; align-content: center; justify-items: center; min-width: 64px; min-height: 70px; padding: 8px; border: 1px solid #c46b73; border-radius: 14px; background: #ff746f0d; box-shadow: 0 0 24px #ff746f0c; }
.xp-level small { color: var(--xp-accent); font-size: .55rem; letter-spacing: .15em; }
.xp-level strong { font-size: 1.8rem; line-height: 1.2; }
.xp-personal-detail { flex: 1; min-width: 0; }
.xp-personal-detail > div:first-child, .xp-personal-detail > small { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; }
.xp-personal-detail strong { font-size: .8rem; }
.xp-personal-detail :is(span, small) { color: #bca9b5; font-size: .62rem; }
.xp-progress { height: 6px; overflow: hidden; margin: 12px 0 9px; border-radius: 6px; background: #ffffff0d; }
.xp-progress > span { display: block; position: relative; height: 100%; overflow: hidden; border-radius: inherit; background: linear-gradient(90deg, #c44e6b, #ff9a79); }
.xp-progress > span::after { content: ''; position: absolute; inset: 0; background: linear-gradient(100deg, transparent, #fff8, transparent); animation: xp-shine 4s ease-in-out infinite; }
.xp-team-total { display: grid; align-content: center; gap: 5px; padding: 20px; border: 1px solid #3e2a35; border-radius: 15px; background: #171219b0; }
.xp-team-total > small { color: #c7a6b0; font-size: .58rem; text-transform: uppercase; letter-spacing: .07em; }
.xp-team-total > strong { color: #ffe4d5; font-size: clamp(1.4rem, 3vw, 2rem); line-height: 1.2; overflow-wrap: anywhere; }
.xp-team-total strong span { color: #c8a9b5; font-size: .7rem; }
.xp-team-total > span { color: #bca9b5; font-size: .62rem; }
.xp-section-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 22px 0 16px; }
.staff-progression .xp-section-title h4 { margin: 0; color: #f2e2e8; font-size: 1rem; letter-spacing: -.025em; }
.xp-section-title > span { color: #b8a4af; font-size: .63rem; }
.xp-podium { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 12px; padding-top: 15px; }
.xp-podium.is-solo { grid-template-columns: minmax(0, 1fr); max-width: 420px; margin: auto; }
.xp-contender { --place: #d3a6a9; position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; min-width: 0; padding: 20px 14px; border: 1px solid #62424e; border-radius: 16px; background: linear-gradient(160deg, #2c202a, #111015 65%); text-align: center; }
.xp-contender.place-1 { --place: var(--xp-gold); order: 2; padding-top: 24px; padding-bottom: 30px; border-color: #b17c42; background: radial-gradient(ellipse at 50% 0, #91602b38, transparent 65%), #171216; box-shadow: 0 0 32px #ffbd5b0d, inset 0 1px 0 #ffdb9c33; }
.xp-contender.place-2 { --place: #cfdaee; order: 1; }
.xp-contender.place-3 { --place: #eab094; order: 3; }
.xp-place { display: flex; justify-content: space-between; align-items: center; gap: 6px; width: 100%; color: var(--place); }
.xp-place > span { font: 700 .8rem var(--vp-font-family-mono); }
.xp-place small { font-size: .48rem; font-weight: 650; letter-spacing: .08em; }
.xp-crown { width: 30px; height: 26px; margin: 14px 0 -7px; color: var(--xp-gold); filter: drop-shadow(0 0 8px #fbbd6250); animation: xp-hover 5s ease-in-out infinite; }
.xp-avatar { position: relative; display: grid; place-items: center; width: 66px; height: 66px; margin: 25px 0 16px; border: 1px solid var(--place); border-radius: 21px; background: #ffffff08; color: var(--place); font-size: 1.2rem; font-weight: 750; }
.place-1 .xp-avatar { width: 78px; height: 78px; font-size: 1.5rem; }
.xp-avatar > span { position: absolute; inset: -6px; border: 1px dashed var(--place); border-radius: 27px; opacity: .3; animation: xp-glow 6s ease-in-out infinite; }
.staff-progression .xp-contender h5 { max-width: 100%; margin: 0 0 8px; color: #fff1f4; font-size: .9rem; overflow-wrap: anywhere; }
.xp-level-chip { padding: 3px 8px; border: 1px solid #ffffff17; border-radius: 5px; color: #cbb6c3; font: .55rem/1.5 var(--vp-font-family-mono); }
.xp-score { margin: 20px 0 0; color: var(--place); font-size: clamp(1.6rem, 3vw, 2.4rem); font-weight: 750; line-height: 1.2; overflow-wrap: anywhere; }
.xp-score small { display: block; margin-top: 5px; color: #c7b1be; font-size: .6rem; font-weight: 400; }
.xp-lifetime { margin: 15px 0 0; color: #a38e9d; font-size: .57rem; }
.xp-card-sheen { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.xp-card-sheen::after { content: ''; position: absolute; inset: -60%; background: linear-gradient(110deg, transparent 40%, #fff6cf07 50%, transparent 60%); animation: xp-shine 9s ease-in-out infinite; }
.place-2 .xp-card-sheen::after { animation-delay: -3s; }
.place-3 .xp-card-sheen::after { animation-delay: -6s; }
.xp-rankings, .xp-activity ul { list-style: none; padding: 0; margin: 18px 0 0; }
.xp-rankings li { display: flex; align-items: center; gap: 14px; margin: 8px 0; padding: 15px 18px; border: 1px solid #35252f; border-radius: 12px; background: #131017b0; }
.xp-rank { min-width: 25px; color: #c8a0b0; font: .75rem var(--vp-font-family-mono); }
.xp-row-avatar { display: grid; flex-shrink: 0; place-items: center; width: 36px; height: 36px; border: 1px solid #63404e; border-radius: 11px; background: #ff746f0b; color: #f0b6b2; font-size: .7rem; }
.xp-row-name { flex: 1; min-width: 0; }
.xp-row-name strong { display: block; font-size: .78rem; overflow-wrap: anywhere; }
.xp-row-name small { color: #b6a0ad; font-size: .58rem; }
.xp-row-score { color: var(--xp-accent); font-size: .9rem; }
.xp-row-score small { font-size: .55rem; }
.xp-activity { margin-top: 30px; padding-top: 5px; border-top: 1px solid #36232f; }
.xp-activity li { display: flex; align-items: flex-start; gap: 12px; padding: 15px 0; border-bottom: 1px solid #ffffff08; }
.xp-award-icon { display: grid; flex-shrink: 0; place-items: center; width: 30px; height: 30px; border: 1px solid #573340; border-radius: 9px; color: var(--xp-accent); background: #ff746f08; }
.xp-activity li > div { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.xp-activity li strong { font-size: .75rem; }
.xp-activity li p { margin: 3px 0; color: #c0a8b7; font-size: .65rem; }
.xp-activity time { color: #aa96a4; font-size: .58rem; }
.xp-award-points { flex-shrink: 0; padding: 4px 8px; border-radius: 6px; background: #ff746f0d; color: var(--xp-accent); font: 650 .65rem/1.5 var(--vp-font-family-mono); }
.xp-rules { margin-top: 26px; padding-top: 18px; border-top: 1px solid #35222d; color: #c7afbd; font-size: .72rem; }
.xp-rules summary { cursor: pointer; }
.xp-rules p { max-width: 720px; margin: 12px 0 0; font-size: .72rem; line-height: 1.8; }
.xp-empty, .xp-loading { padding: 28px 18px; border: 1px dashed #54303f; border-radius: 12px; color: #c4aebc; font-size: .78rem; text-align: center; line-height: 1.7; }
.xp-loading { display: flex; align-items: center; justify-content: center; gap: 12px; }
.xp-loading > span { width: 16px; height: 16px; border: 2px solid #643543; border-top-color: var(--xp-accent); border-radius: 50%; animation: xp-orbit 1.2s linear infinite; }
@keyframes xp-orbit { to { transform: rotate(360deg); } }
@keyframes xp-embers { 0% { opacity: 0; transform: translate3d(0, 0, 0); } 20%, 70% { opacity: .4; } 100% { opacity: 0; transform: translate3d(30px, -900px, 0); } }
@keyframes xp-glow { 0%, 100% { opacity: .35; } 50% { opacity: .8; } }
@keyframes xp-shine { 0%, 20% { transform: translateX(-100%); } 80%, 100% { transform: translateX(100%); } }
@keyframes xp-hover { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
.motion-paused *, .motion-paused *::before, .motion-paused *::after { animation-play-state: paused !important; }
@media (max-width: 700px) {
  .xp-hero { flex-direction: column; }.xp-hero-controls { flex-direction: row; align-items: center; }
  .xp-overview { grid-template-columns: minmax(0, 1fr); }.xp-team-total { grid-template-columns: 1fr auto; align-items: center; }.xp-team-total > strong { grid-column: 2; grid-row: 1 / 3; }
  .xp-podium { grid-template-columns: minmax(0, 1fr); }.xp-contender { order: initial !important; }.xp-podium.is-solo { max-width: none; }
  .xp-periods { flex: 1 0 100%; }.xp-periods button { flex: 1; min-width: 0; padding: 9px 7px; white-space: nowrap; }.xp-personal { padding: 16px; gap: 12px; }
  .xp-rankings li { gap: 9px; padding: 13px 10px; }.xp-row-score { font-size: .75rem; }
}
@media (prefers-reduced-motion: reduce) { .staff-progression *, .staff-progression *::before, .staff-progression *::after { animation: none !important; transition: none !important; } }
</style>
