<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter, withBase } from 'vitepress'
import { getDiscordSession } from './discord-session'
import { studioRequest } from './studio-api'

interface Coupon { id: string; kind: 'loyalty' | 'review' | 'manual'; discount: number; state: 'issuing' | 'issued' | 'failed' | 'uncertain'; code: string | null; retryAt: string | null; createdAt: string; uses: number; resourceIds: string[] }
interface Check { status: 'pending' | 'ok' | 'error'; code: string | null; checkedAt: string | null }
interface Member { id: string; username: string; displayName: string }
const props = defineProps<{ staff?: boolean }>()
const router = useRouter()
const coupons = ref<Coupon[]>([])
const checks = ref<Record<string, Check>>({})
const signedIn = ref(false)
const loading = ref(false)
const error = ref('')
const configured = ref(false)
const page = ref(1)
const total = ref(0)
const canGrant = ref(false)
const canManageCoupons = ref(false)
const staffLevel = ref<number | null>(null)
const granting = ref(false)
const grantMessage = ref('')
const grantError = ref('')
const recipient = ref('')
const members = ref<Member[]>([])
const memberSearch = ref('')
const memberQuery = ref('')
const memberPage = ref(1)
const memberTotal = ref(0)
const membersLoading = ref(false)
const memberError = ref('')
const discount = ref(10)
const reason = ref('')
let requestId = ''
let grantPayload = ''
const checkNames: Record<string, string> = { reviews: 'Review rewards', loyalty: 'Loyalty rewards', usage: 'Coupon-use notifications', reconciliation: 'Pending coupon verification' }
const checkErrors = computed(() => Object.entries(checks.value).filter(([name, check]) => check.status === 'error' &&
  (name !== 'reconciliation' || props.staff || coupons.value.some(coupon => coupon.state === 'uncertain' || coupon.state === 'issuing'))))
function checkMessage(check: Check) {
  if (check.code === 'BBB_ACCESS') return 'BuiltByBit denied API access. Staff must enable the required creator API permissions.'
  if (check.code === 'BBB_RATE_LIMIT') return 'BuiltByBit is rate limiting checks. They will retry automatically.'
  if (check.code === 'BBB_REVIEWER') return 'BuiltByBit did not return verified reviewer details. Staff are investigating.'
  return 'The latest check could not finish. Previously issued coupons remain visible; checks retry automatically.'
}
let generation = 0
let memberGeneration = 0
let token = ''

async function loadMembers(target = 1) {
  const request = ++memberGeneration, session = getDiscordSession()
  members.value = []; recipient.value = ''; memberError.value = ''; membersLoading.value = true
  try {
    const data = await studioRequest<{ members: Member[]; total: number; page: number }>('/staff/coupons?page=' + target + '&query=' + encodeURIComponent(memberQuery.value))
    if (request !== memberGeneration || session !== getDiscordSession()) return
    members.value = data.members; memberTotal.value = data.total; memberPage.value = data.page
  } catch (value) {
    if (request === memberGeneration && session === getDiscordSession()) memberError.value = value instanceof Error ? value.message : 'Members could not be loaded.'
  } finally { if (request === memberGeneration) membersLoading.value = false }
}
function searchMembers() {
  memberQuery.value = memberSearch.value.trim()
  void loadMembers()
}
async function load(target = 1) {
  const request = ++generation
  memberGeneration++; members.value = []; recipient.value = ''; memberError.value = ''; membersLoading.value = false
  token = getDiscordSession()
  signedIn.value = !!token; coupons.value = []; checks.value = {}; error.value = ''; loading.value = false; configured.value = false; canGrant.value = false; canManageCoupons.value = false; staffLevel.value = null
  if (!token) return
  loading.value = true
  try {
    const data = await studioRequest<{ configured: boolean; canGrant: boolean; canManageCoupons: boolean; staffLevel: number | null; coupons: Coupon[]; checks: Record<string, Check>; total: number; page: number }>('/coupons?page=' + target)
    if (request !== generation || token !== getDiscordSession()) return
    if (typeof data.configured !== 'boolean' || !Array.isArray(data.coupons) || !data.checks || !Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.page)) throw new Error('Invalid coupon response.')
    configured.value = data.configured; canGrant.value = data.canGrant; canManageCoupons.value = data.canManageCoupons; staffLevel.value = data.staffLevel; coupons.value = data.coupons; checks.value = data.checks; total.value = data.total; page.value = data.page
    if (props.staff && data.canGrant) void loadMembers()
  } catch (value) {
    if (request === generation) error.value = value instanceof Error ? value.message : 'Coupons could not be loaded.'
  } finally { if (request === generation) loading.value = false }
}
async function grant() {
  if (granting.value || !canGrant.value) return
  const session = getDiscordSession()
  const payload = JSON.stringify({ userId: recipient.value, type: 'percent', discount: discount.value, reason: reason.value.trim() })
  if (payload !== grantPayload || !requestId) { grantPayload = payload; requestId = crypto.randomUUID() }
  granting.value = true; grantError.value = ''; grantMessage.value = ''
  try {
    const result = await studioRequest<{ state: string; message: string }>('/staff/coupons', { method: 'POST', body: JSON.stringify({ ...JSON.parse(payload), requestId }) })
    if (session === getDiscordSession()) grantMessage.value = result.message
  } catch (value) {
    if (session === getDiscordSession()) grantError.value = value instanceof Error ? value.message : 'Coupon grant failed.'
  } finally { granting.value = false }
}
function changed() {
  if (getDiscordSession() !== token) {
    grantMessage.value = ''; grantError.value = ''; recipient.value = ''; reason.value = ''; requestId = ''; grantPayload = ''; memberSearch.value = ''; memberQuery.value = ''
    void load()
  }
}
onMounted(() => {
  if (!props.staff && window.location.hash === '#staff-grants') void router.go(withBase('/admin/coupons'))
  else void load()
  window.addEventListener('lumen-discord-user', changed); window.addEventListener('storage', changed)
})
onUnmounted(() => { generation++; memberGeneration++; window.removeEventListener('lumen-discord-user', changed); window.removeEventListener('storage', changed) })
</script>

<template>
  <main class="coupons">
    <header><p>LUMEN STUDIOS / {{ staff ? 'STAFF TOOLS' : 'REWARDS' }}</p><h1>{{ staff ? 'Grant coupons.' : 'Your coupons.' }}</h1><p>{{ staff ? 'Grant a registered member a private, single-use BuiltByBit coupon.' : 'Your private BuiltByBit coupon codes appear here when issued.' }}</p><button type="button" :disabled="loading" @click="load(page)">Refresh</button></header>
    <p v-if="!signedIn">Sign in with Discord to view your coupons.</p>
    <p v-if="error" class="coupon-error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Loading coupons…</p>
    <template v-if="signedIn && !error && !loading">
      <p v-if="!configured" class="coupon-error" role="alert">Coupon integration is not configured. Staff must configure BuiltByBit creator authorization and resource IDs.</p>
      <p v-for="[name, check] in checkErrors" :key="name" class="coupon-error" role="alert">{{ checkNames[name] || name }}: {{ checkMessage(check) }}</p>
      <p v-if="!checks.reviews || !checks.loyalty">Reward checks are still starting. Refresh later.</p>
      <p v-if="!staff && !coupons.length">No coupons have been issued to this account yet. Eligibility is checked periodically.</p>
      <article v-for="coupon in (staff ? [] : coupons)" :key="coupon.id">
        <div><strong>{{ coupon.discount }}% {{ coupon.kind === 'review' ? 'review reward' : coupon.kind === 'manual' ? 'staff-granted coupon' : 'loyalty reward' }}</strong><p>{{ coupon.kind !== 'loyalty' ? 'One total use.' : 'Permanent coupon.' }} BuiltByBit checks availability and usage limits at checkout.</p><p v-if="coupon.state === 'issued'">{{ coupon.uses }} recorded use{{ coupon.uses === 1 ? '' : 's' }}. Usage updates periodically.</p></div>
        <div v-if="coupon.state === 'issued' && coupon.code"><code>{{ coupon.code }}</code><p>Eligible BuiltByBit products: <a v-for="id in coupon.resourceIds" :key="id" :href="`https://builtbybit.com/resources/${id}/`" target="_blank" rel="noopener noreferrer">Product #{{ id }} </a></p></div>
        <p v-else-if="coupon.state === 'failed' && coupon.retryAt" class="coupon-error">BuiltByBit declined this request. We will retry automatically; contact support if it continues.</p>
        <p v-else-if="coupon.state === 'failed'" class="coupon-error">BuiltByBit declined this request. Contact support.</p>
        <p v-else class="coupon-error">Coupon issuance is pending or could not be confirmed. If it does not resolve, contact support; do not request another code.</p>
      </article>
      <nav v-if="!staff && total > 20" aria-label="Coupon pages"><button type="button" :disabled="page <= 1" @click="load(page - 1)">Previous</button> Page {{ page }} / {{ Math.ceil(total / 20) }} <button type="button" :disabled="page * 20 >= total" @click="load(page + 1)">Next</button></nav>
    </template>
    <section v-if="staff && signedIn && !loading && !error" id="staff-grants">
      <h2>Staff coupon grants</h2>
      <p v-if="!canManageCoupons" class="coupon-error" role="alert">Support rank or above with coupon-grant permission is required.</p>
      <template v-else>
      <p>Support staff require level 2 (100 XP). Studio Lead and Owner can grant at any XP level. Every grant and its reason is logged; self-grants are blocked.</p>
      <p v-if="!canGrant" role="status">Your current staff level is {{ staffLevel }}. Reach level 2 to enable this form.</p>
      <p>Choose from members who have signed into the website, excluding yourself. Search or change pages to find any registered member; they do not need to be online now.</p>
      <form v-if="canGrant" @submit.prevent="searchMembers">
        <label>Find a member<input v-model="memberSearch" maxlength="120" placeholder="Name, username, or Discord ID"></label>
        <button type="submit" :disabled="membersLoading || granting">Search members</button>
      </form>
      <p v-if="membersLoading" role="status">Loading members…</p>
      <p v-if="memberError" class="coupon-error" role="alert">{{ memberError }}</p>
      <nav v-if="canGrant && memberTotal > 50" aria-label="Member pages"><button type="button" :disabled="memberPage <= 1 || membersLoading || granting" @click="loadMembers(memberPage - 1)">Previous members</button> Page {{ memberPage }} / {{ Math.ceil(memberTotal / 50) }} <button type="button" :disabled="memberPage * 50 >= memberTotal || membersLoading || granting" @click="loadMembers(memberPage + 1)">Next members</button></nav>
      <form @submit.prevent="grant"><fieldset :disabled="!canGrant || granting">
        <label>Member<select v-model="recipient" required :disabled="membersLoading || granting || !members.length"><option value="" disabled>{{ membersLoading ? 'Loading members…' : members.length ? 'Select a member' : 'No matching members' }}</option><option v-for="member in members" :key="member.id" :value="member.id">{{ member.displayName || member.username || member.id }}{{ member.username ? ` (@${member.username})` : '' }} · {{ member.id }}</option></select></label>
        <label>Discount type<select aria-describedby="coupon-provider-limit"><option value="percent">Percentage off (%)</option><option value="fixed" disabled>Fixed dollars off ($) — unavailable via BuiltByBit API</option></select></label>
        <label>Discount (%)<input v-model.number="discount" type="number" min="1" max="50" step="1" required></label>
        <p id="coupon-provider-limit">BuiltByBit's coupon-creation API supports 1–50% only. It cannot create 95% or fixed-dollar discounts such as $3 off.</p>
        <label>Reason<textarea v-model="reason" required minlength="5" maxlength="300" :disabled="granting" /></label>
        <button type="submit" :disabled="granting || membersLoading || !recipient">{{ granting ? 'Granting…' : 'Grant coupon' }}</button>
      </fieldset></form>
      <p v-if="grantMessage" role="status">{{ grantMessage }}</p><p v-if="grantError" class="coupon-error" role="alert">{{ grantError }}</p>
      </template>
    </section>
    <template v-if="!staff">
      <section><h2>Loyalty coupon policy</h2><p>If found sharing this code with other users, your benefits and coupon will be taken away. All discount uses are logged.</p><p>BuiltByBit tracks coupon usage counts; this site does not verify who redeems a code. Codes are not locked to a BuiltByBit account. Do not share them. If your tier changes, older codes may remain valid until staff deactivate them on BuiltByBit.</p></section>
      <p>Review rewards require a website account and a BuiltByBit account linked to the same Discord account. Rewards are independent of star rating. Each review can earn one single-use code.</p>
      <a href="/account/loyalty">Explore Lumen Loyalty →</a>
    </template>
    <a v-else href="/admin/">Return to Staff Dashboard →</a>
  </main>
</template>

<style scoped>
.coupons{max-width:850px;margin:auto;padding:32px clamp(16px,3vw,32px) 64px}.coupons header,.coupons section,.coupons article{padding:24px;margin-bottom:16px;border:1px solid #9a6bf344;border-radius:16px;background:var(--vp-c-bg-soft)}.coupons header{background:radial-gradient(ellipse at 90% 0,#7b3ff22a,transparent 58%),var(--vp-c-bg-soft)}.coupons header>p:first-child{color:var(--vp-c-brand-1);font-size:.7rem;letter-spacing:.14em}.coupons h1{font-size:clamp(2rem,5vw,3rem)}.coupons h2{border:0}.coupons p{color:var(--vp-c-text-2);line-height:1.6}.coupons article{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.coupons code{padding:10px;border:1px solid var(--vp-c-brand-1);border-radius:8px;overflow-wrap:anywhere;user-select:all}.coupons button{padding:8px 14px;border:1px solid #9a6bf366;border-radius:8px;background:var(--vp-c-brand-soft)}.coupon-error{padding:12px;border:1px solid #d96176;border-radius:8px}
.coupons form,.coupons fieldset,.coupons label{display:grid;gap:8px}.coupons form,.coupons fieldset{gap:16px}.coupons fieldset{border:0;padding:0;min-width:0}.coupons input,.coupons textarea,.coupons select{padding:10px;border:1px solid var(--vp-c-divider);border-radius:8px;background:var(--vp-c-bg);color:var(--vp-c-text-1)}
</style>
