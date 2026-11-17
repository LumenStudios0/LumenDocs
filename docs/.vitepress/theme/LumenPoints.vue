<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { studioRequest } from './studio-api'

type Period = 'daily' | 'weekly' | 'monthly'
interface Summary {
  balance: number
  referralCode: string
  successfulReferrals: number
  redeemedAt: string | null
  eligibleReferralPoints: number
  referralExpiresAt: string | null
  purchaseCheckedAt: string | null
  tierCheckedAt: string | null
  purchasePoints: number
  referralPoints: number
  milestones: { id: string; name: string; count: number | null; points: number; awarded: boolean }[]
  periods: Record<Period, { purchasePoints: number; referralPoints: number; referrals: number }>
  history: { id: number; label: string; points: number; createdAt: string }[]
  checks?: Record<string, { ok: boolean; error?: string }>
}
const status = ref<Summary | null>(null)
const signedIn = ref(false)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const referralCode = ref('')
const period = ref<Period>('daily')
const motionPaused = ref(false)
const periods: { id: Period; label: string; reset: string }[] = [
  { id: 'daily', label: 'Daily', reset: 'Today, from midnight UTC' },
  { id: 'weekly', label: 'Weekly', reset: 'This week, from Monday UTC' },
  { id: 'monthly', label: 'Monthly', reset: 'This calendar month, UTC' },
]
const activity = computed(() => status.value?.periods[period.value])
const checkErrors = computed(() => Object.entries(status.value?.checks || {}).filter(([, check]) => !check.ok)
  .map(([name, check]) => `${name === 'purchases' ? 'Purchase verification' : 'Loyalty verification'}: ${check.error || 'Unavailable. Please try again later.'}`))
const formatPoints = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })
const date = (value: string) => new Date(value).toLocaleString()
let generation = 0
let session = ''

async function load() {
  const request = ++generation, token = getDiscordSession()
  session = token
  signedIn.value = !!token
  status.value = null
  referralCode.value = ''
  error.value = ''; notice.value = ''; busy.value = false; loading.value = true
  if (!token) { loading.value = false; return }
  try {
    const saved = await studioRequest<Summary>('/points')
    if (request !== generation || token !== getDiscordSession()) return
    status.value = saved
    await update('sync')
  } catch (value) {
    if (request === generation && token === getDiscordSession()) error.value = value instanceof Error ? value.message : 'Lumen Points could not be loaded.'
  } finally { if (request === generation) loading.value = false }
}
async function update(action: 'sync' | 'referral') {
  if (busy.value) return
  const request = generation, token = getDiscordSession()
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await studioRequest<Summary>(`/points/${action}`, {
      method: 'POST', body: JSON.stringify(action === 'referral' ? { code: referralCode.value.trim() } : {}),
    })
    if (request !== generation || token !== getDiscordSession()) return
    status.value = result
    if (action === 'referral') {
      referralCode.value = ''
      notice.value = 'Referral redeemed. Your referrer received their bonus, and you kept all your purchase points.'
    } else if (!Object.values(result.checks || {}).some(check => !check.ok)) notice.value = 'Your verified earnings are up to date.'
  } catch (value) {
    if (request === generation && token === getDiscordSession()) error.value = `${value instanceof Error ? value.message : 'The points check failed.'} Refresh to check the latest balance before retrying.`
  } finally { if (request === generation) busy.value = false }
}
async function copyCode() {
  if (!status.value) return
  const token = getDiscordSession(), code = status.value.referralCode, request = generation
  try {
    await navigator.clipboard.writeText(code)
    if (request === generation && token === getDiscordSession()) notice.value = 'Referral code copied.'
  } catch {
    if (request === generation && token === getDiscordSession()) error.value = 'Clipboard access was blocked. Select and copy the referral code manually.'
  }
}
function sessionChanged() { if (getDiscordSession() !== session) void load() }
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', sessionChanged); window.addEventListener('storage', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged); window.removeEventListener('storage', sessionChanged) })
</script>

<template>
  <div class="points" :class="{ 'effects-paused': motionPaused }">
    <header class="points-hero">
      <div class="points-aurora" aria-hidden="true"></div>
      <div class="points-orbit" aria-hidden="true"><span>LP</span><i></i><i></i></div>
      <div class="points-intro"><p class="points-eyebrow">LUMEN STUDIOS / MEMBER REWARDS</p><h1>Your loyalty.<br><span>More rewarding.</span></h1><p>Meet Lumen Points. Earn from real purchases, bring your friends, and celebrate every milestone.</p></div>
      <div class="points-wallet">
        <span>YOUR LUMEN POINTS</span>
        <strong aria-live="polite">{{ status ? formatPoints(status.balance) : '—' }}<small>LP</small></strong>
        <div><span class="points-dot" aria-hidden="true"></span> $1 USD spent = 10 points</div>
        <button type="button" :disabled="!signedIn || busy || loading" @click="update('sync')">{{ busy ? 'Verifying earnings...' : 'Check earnings' }}</button>
      </div>
      <button class="points-effects" type="button" :aria-pressed="motionPaused" @click="motionPaused = !motionPaused">{{ motionPaused ? 'Resume effects' : 'Pause effects' }}</button>
    </header>
    <p v-if="!signedIn && !loading" class="points-message">Sign in with Discord using Login / Signup to get your personal referral code and start earning points.</p>
    <p v-if="loading && !status" class="points-message" role="status">Opening your points wallet...</p>
    <p v-if="error" class="points-message is-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="points-message" role="status">{{ notice }}</p>
    <p v-for="message in checkErrors" :key="message" class="points-message is-error" role="alert">{{ message }} Your saved balance remains visible.</p>
    <template v-if="status">
      <div class="points-stats">
        <div><span>PURCHASE POINTS</span><strong>{{ formatPoints(status.purchasePoints) }} <small>LP</small></strong></div>
        <div><span>REFERRAL POINTS</span><strong>{{ formatPoints(status.referralPoints) }} <small>LP</small></strong></div>
        <div><span>SUCCESSFUL REFERRALS</span><strong>{{ status.successfulReferrals }}</strong></div>
      </div>
      <section class="points-referrals" aria-labelledby="points-referrals-title">
        <div class="points-section-heading"><div><p class="points-eyebrow">BETTER TOGETHER</p><h2 id="points-referrals-title">Share Lumen. Earn together.</h2></div><span class="points-pill">50% referral bonus</span></div>
        <div class="points-referral-grid">
          <article class="points-card"><span class="points-step">01 / YOUR INVITE</span><h3>My referral code</h3><p>Your code is yours automatically. Give it to a friend before they shop.</p>
            <div class="points-code"><input aria-label="My referral code" :value="status.referralCode" readonly @focus="($event.target as HTMLInputElement).select()"><button type="button" @click="copyCode">Copy code</button></div>
            <p class="points-fine">When they redeem it after a purchase, you earn 50% of their eligible purchase points. They keep 100%.</p>
          </article>
          <article class="points-card"><span class="points-step">02 / PAY IT FORWARD</span><h3>Enter a referral</h3>
            <p v-if="status.redeemedAt">You redeemed a referral on {{ date(status.redeemedAt) }}. Thank you for supporting another member.</p>
            <template v-else>
              <p>Made a purchase in the last 24 hours? Enter the code of the member who referred you.</p>
              <form class="points-code" @submit.prevent="update('referral')"><input v-model="referralCode" aria-label="Another member's referral code" placeholder="LP-XXXXXXXXXXXX" maxlength="15" pattern="[Ll][Pp]-[A-Fa-f0-9]{12}" required autocomplete="off" :disabled="busy"><button type="submit" :disabled="busy || !referralCode.trim()">{{ busy ? 'Checking...' : 'Redeem code' }}</button></form>
              <p v-if="status.eligibleReferralPoints > 0 && status.referralExpiresAt" class="points-fine">Your referrer can receive {{ formatPoints(status.eligibleReferralPoints) }} LP now. Earliest qualifying purchase expires {{ date(status.referralExpiresAt) }}.</p>
              <p v-else class="points-fine">No verified paid purchase in the last 24 hours yet. Purchase first, then check earnings.</p>
            </template>
          </article>
        </div>
        <p class="points-fine">One referral redemption per buyer. No self-referrals. The bonus covers eligible purchase points from the preceding 24 hours at redemption, not future purchases or tier bonuses.</p>
      </section>
      <section aria-labelledby="points-tasks-title">
        <div class="points-section-heading"><div><p class="points-eyebrow">YOUR NEXT MOVE</p><h2 id="points-tasks-title">Earn at your own pace.</h2></div></div>
        <div class="points-tabs" role="group" aria-label="Points task period"><button v-for="item in periods" :key="item.id" type="button" :aria-pressed="period === item.id" @click="period = item.id">{{ item.label }}</button></div>
        <p class="points-fine">{{ periods.find(item => item.id === period)?.reset }}. These track the same earnings; switching periods does not award extra points.</p>
        <div class="points-task-grid">
          <article class="points-card points-task"><span class="points-task-icon" aria-hidden="true">$</span><div><span class="points-step">PURCHASE / REPEATABLE</span><h3>Grow your plugin collection</h3><p>Earn 10 LP for each $1 USD actually paid for eligible BuiltByBit plugins, after discounts.</p></div><strong>{{ formatPoints(activity?.purchasePoints || 0) }} LP <small>earned this period</small></strong><a href="/plugins/">Explore plugins <span aria-hidden="true">&#8594;</span></a></article>
          <article class="points-card points-task"><span class="points-task-icon" aria-hidden="true">+</span><div><span class="points-step">REFERRALS / REPEATABLE</span><h3>Bring someone new</h3><p>Different buyers can redeem your code after purchasing. Each buyer may redeem one code, once.</p></div><strong>{{ activity?.referrals || 0 }} {{ activity?.referrals === 1 ? 'referral' : 'referrals' }} <small>{{ formatPoints(activity?.referralPoints || 0) }} LP earned this period</small></strong><button type="button" @click="copyCode">Copy my code <span aria-hidden="true">&#8594;</span></button></article>
        </div>
      </section>
      <section aria-labelledby="points-milestones-title">
        <div class="points-section-heading"><div><p class="points-eyebrow">ONE-TIME UNLOCKS</p><h2 id="points-milestones-title">Reach a tier. Take the bonus.</h2></div><a href="/account/loyalty">Lumen Loyalty &#8594;</a></div>
        <div class="points-milestones">
          <article v-for="milestone in status.milestones" :key="milestone.id" class="points-card" :class="{ 'is-awarded': milestone.awarded }"><span class="points-step">{{ milestone.awarded ? 'AWARDED' : 'MILESTONE' }}</span><h3>{{ milestone.name }}</h3><strong>+{{ milestone.points }} <small>LP</small></strong><p>{{ milestone.count ? `${milestone.count} active eligible products` : 'Own every active eligible product' }}</p><span class="points-pill">{{ milestone.awarded ? 'Bonus secured' : 'Not yet earned' }}</span></article>
        </div>
        <p class="points-fine">Each milestone pays once per account, never daily, weekly, or monthly. Eligibility follows Lumen Loyalty, where active trials and staff grants currently count. Purchase points require actual paid purchases.</p>
      </section>
      <section aria-labelledby="points-history-title">
        <div class="points-section-heading"><div><p class="points-eyebrow">EVERY POINT ACCOUNTED FOR</p><h2 id="points-history-title">Your recent activity</h2></div><span class="points-fine">Latest 50 changes</span></div>
        <ul v-if="status.history.length" class="points-history"><li v-for="entry in status.history" :key="entry.id"><span class="points-history-icon" aria-hidden="true">{{ entry.points > 0 ? '+' : '-' }}</span><div><strong>{{ entry.label }}</strong><time :datetime="entry.createdAt">{{ date(entry.createdAt) }}</time></div><span :class="{ 'is-negative': entry.points < 0 }">{{ entry.points > 0 ? '+' : '' }}{{ formatPoints(entry.points) }} LP</span></li></ul>
        <p v-else class="points-empty">Your story starts here. Check earnings after your next purchase or referral.</p>
      </section>
    </template>
    <footer class="points-footer"><strong>Real purchases. Real rewards.</strong><p>Purchase checks use verified BuiltByBit buyer identities and final USD amounts. Link the same Discord account on BuiltByBit. Free licenses, trials, and staff grants do not earn purchase points. Invalidated or missing purchases and their referral bonuses are adjusted on verification. Points are not cash; spending/redemption rewards are not available yet.</p><p v-if="status?.purchaseCheckedAt">Purchases last verified {{ date(status.purchaseCheckedAt) }}. Checks are cached for one minute.</p></footer>
  </div>
</template>

<style scoped>
.points { --points-accent: #bb94ff; max-width: 1160px; margin: auto; padding: 28px clamp(12px, 3vw, 32px) 60px; color: var(--vp-c-text-1); }
.points-hero { position: relative; isolation: isolate; overflow: hidden; display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); align-items: center; gap: 30px; padding: clamp(24px, 4vw, 42px) clamp(20px, 4vw, 38px) 60px; border: 1px solid #6c459d70; border-radius: 24px; background: #100d1b; color: #f7efff; }
.points-aurora { position: absolute; z-index: -1; inset: -50%; pointer-events: none; background: conic-gradient(from 25deg, transparent, #9b42ee25, transparent 40%, #6046e718, transparent 75%); animation: points-orbit 36s linear infinite; }
.points-orbit { position: absolute; z-index: -1; top: -40px; right: -40px; display: grid; place-items: center; width: 280px; height: 280px; border: 1px solid #b88aff18; border-radius: 50%; color: #bf91ff0b; font-size: 7rem; font-weight: 900; }
.points-orbit i { position: absolute; inset: 20px; border: 1px dashed #bb94ff25; border-radius: 50%; animation: points-orbit 45s linear infinite; }
.points-orbit i::after { content: ''; position: absolute; top: 27px; left: 27px; width: 7px; height: 7px; border-radius: 50%; background: #bc87ff; box-shadow: 0 0 18px #ac60ff; }
.points-orbit i:last-child { inset: -20px; animation-direction: reverse; animation-duration: 60s; }
.points-eyebrow { margin: 0 0 12px; color: var(--points-accent); font: 650 .58rem/1.6 var(--vp-font-family-mono); letter-spacing: .13em; }
.points h1 { margin: 0; font-size: clamp(2.1rem, 4.5vw, 3.6rem); line-height: 1.05; letter-spacing: -.055em; }
.points h1 span { color: #c3a0ff; }
.points-intro > p:last-child { max-width: 360px; margin: 18px 0 0; color: #bfb0d0; font-size: .82rem; line-height: 1.8; }
.points-wallet { position: relative; overflow: hidden; min-width: 0; padding: 25px; border: 1px solid #b78aef60; border-radius: 18px; background: linear-gradient(130deg, #46246780, #1d142880); box-shadow: 0 12px 40px #0003, inset 0 1px 0 #e7c4ff15; }
.points-wallet::before { content: ''; position: absolute; inset: 0; pointer-events: none; background: linear-gradient(110deg, transparent 30%, #d2a3ff0d 50%, transparent 70%); animation: points-shine 8s ease-in-out infinite; }
.points-wallet > span { color: #ceb9e7; font: .6rem var(--vp-font-family-mono); letter-spacing: .12em; }
.points-wallet > strong { display: block; margin: 16px 0 12px; font-size: clamp(2rem, 4vw, 3rem); letter-spacing: -.055em; line-height: 1.1; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.points-wallet strong small { margin-left: 9px; color: #bf9ee7; font-size: .8rem; letter-spacing: .02em; }
.points-wallet > div { display: flex; align-items: center; gap: 7px; color: #c8b3db; font-size: .65rem; }
.points-dot { width: 5px; height: 5px; border-radius: 50%; background: #c4a0ff; box-shadow: 0 0 0 4px #b58aff12; animation: points-pulse 4s ease-in-out infinite; }
.points button { position: relative; padding: 9px 13px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: inherit; font-size: .73rem; font-weight: 600; cursor: pointer; }
.points button:disabled { opacity: .5; cursor: not-allowed; }
.points button:hover:not(:disabled) { border-color: var(--points-accent); }
.points :is(button,input,a):focus-visible { outline: 2px solid var(--points-accent); outline-offset: 3px; }
.points-wallet > button { width: 100%; margin-top: 20px; border-color: #b58bdf50; background: #aa71ed20; color: #f2e3ff; }
.points .points-effects { position: absolute; right: 24px; bottom: 17px; padding: 3px; border: 0; background: transparent; color: #bca3d1; font-size: .6rem; }
.points-message { margin: 16px 0; padding: 14px 18px; border: 1px solid var(--vp-c-brand-2); border-radius: 11px; background: var(--vp-c-brand-soft); font-size: .78rem; line-height: 1.7; overflow-wrap: anywhere; }
.points-message.is-error { border-color: var(--vp-c-danger-2); background: var(--vp-c-danger-soft); color: var(--vp-c-danger-1); }
.points-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 20px 0 36px; }
.points-stats > div { display: grid; gap: 9px; padding: 20px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg-soft); }
.points-stats span { color: var(--vp-c-text-2); font: .54rem/1.5 var(--vp-font-family-mono); letter-spacing: .05em; }
.points-stats strong { font-size: 1.5rem; overflow-wrap: anywhere; }.points-stats small { color: var(--points-accent); font-size: .65rem; }
.points-section-heading { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; margin: 34px 0 18px; }
.points-section-heading .points-eyebrow { margin-bottom: 5px; }
.points h2 { margin: 0; padding: 0; border: 0; font-size: clamp(1.15rem, 2.5vw, 1.5rem); letter-spacing: -.035em; }
.points-section-heading a { color: var(--vp-c-brand-1); font-size: .72rem; }
.points-referral-grid, .points-task-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.points-card { min-width: 0; padding: clamp(18px, 2.5vw, 24px); border: 1px solid var(--vp-c-divider); border-radius: 15px; background: var(--vp-c-bg-soft); }
.points-step { color: var(--points-accent); font: .55rem/1.5 var(--vp-font-family-mono); letter-spacing: .07em; }
.points h3 { margin: 10px 0; font-size: 1rem; letter-spacing: -.025em; }.points-card p { color: var(--vp-c-text-2); font-size: .74rem; line-height: 1.8; }
.points-code { display: flex; gap: 8px; margin: 18px 0 12px; }.points-code input { display: block; flex: 1; width: 100%; min-width: 0; padding: 11px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg); color: var(--vp-c-text-1); font: .76rem var(--vp-font-family-mono); text-transform: uppercase; }
.points-code button { flex-shrink: 0; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.points .points-fine { color: var(--vp-c-text-2); font-size: .66rem; line-height: 1.8; }
.points-pill { display: inline-block; padding: 5px 9px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-brand-soft); color: var(--points-accent); font-size: .6rem; }
.points-tabs { display: inline-flex; gap: 4px; padding: 5px; border: 1px solid var(--vp-c-divider); border-radius: 11px; background: var(--vp-c-bg-soft); }
.points-tabs button { padding: 9px 20px; border-color: transparent; background: none; color: var(--vp-c-text-2); }
.points-tabs button[aria-pressed=true] { border-color: var(--vp-c-brand-2); background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.points-task { display: grid; align-content: start; gap: 12px; }.points-task-icon { display: grid; place-items: center; width: 38px; height: 38px; border: 1px solid var(--vp-c-brand-2); border-radius: 11px; background: var(--vp-c-brand-soft); color: var(--points-accent); font-size: 1.15rem; }
.points-task h3 { margin-top: 6px; }.points-task strong { color: var(--points-accent); font-size: 1.1rem; }.points-task strong small { display: block; margin-top: 4px; color: var(--vp-c-text-2); font-size: .62rem; font-weight: 400; }
.points-task > a, .points-task > button { justify-self: start; color: var(--vp-c-brand-1); font-size: .72rem; text-decoration: none; }
.points-task > a { padding: 9px 0; }.points-task > button { border: 0; padding: 9px 0; background: none; }
.points-milestones { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }.points-milestones h3 { font-size: .92rem; }.points-milestones strong { display: block; color: var(--points-accent); font-size: 1.6rem; }.points-milestones small { font-size: .62rem; }
.points-milestones p { min-height: 40px; font-size: .65rem; }.points-card.is-awarded { border-color: var(--vp-c-brand-2); background: linear-gradient(135deg, var(--vp-c-brand-soft), var(--vp-c-bg-soft)); }
.points-history { margin: 0; padding: 0; list-style: none; }.points-history li { display: flex; align-items: center; gap: 13px; padding: 16px 0; border-bottom: 1px solid var(--vp-c-divider); }.points-history-icon { display: grid; flex-shrink: 0; place-items: center; width: 30px; height: 30px; border-radius: 9px; background: var(--vp-c-brand-soft); color: var(--points-accent); }.points-history li > div { flex: 1; min-width: 0; }.points-history strong { font-size: .75rem; overflow-wrap: anywhere; }.points-history time { display: block; margin-top: 3px; color: var(--vp-c-text-2); font-size: .6rem; }.points-history li > span:last-child { color: var(--points-accent); font-size: .75rem; font-weight: 650; }.points-history li > span.is-negative { color: var(--vp-c-danger-1); }
.points-empty { padding: 25px; border: 1px dashed var(--vp-c-divider); border-radius: 12px; color: var(--vp-c-text-2); font-size: .75rem; text-align: center; }
.points-footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid var(--vp-c-divider); }.points-footer strong { font-size: .78rem; }.points-footer p { max-width: 800px; color: var(--vp-c-text-2); font-size: .66rem; line-height: 1.8; }
@keyframes points-orbit { to { transform: rotate(360deg); } }@keyframes points-shine { 0%, 15% { transform: translateX(-100%); } 85%,100% { transform: translateX(100%); } }@keyframes points-pulse { 50% { opacity: .4; } }
.effects-paused *, .effects-paused *::before, .effects-paused *::after { animation-play-state: paused !important; }
@media(max-width:900px) { .points-hero { grid-template-columns: minmax(0, 1fr); }.points-milestones { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media(max-width:600px) { .points-referral-grid,.points-task-grid { grid-template-columns: minmax(0,1fr); }.points-stats { gap: 7px; }.points-stats > div { padding: 13px 10px; }.points-stats strong { font-size: 1.15rem; }.points-code { flex-wrap: wrap; }.points-code input { flex-basis: 100%; }.points-code button { width: 100%; }.points-tabs { display:flex; }.points-tabs button { flex:1;padding:9px 12px; }.points-history li { gap: 9px; } }
@media(prefers-reduced-motion:reduce) { .points *, .points *::before, .points *::after { animation: none !important; } }
</style>
