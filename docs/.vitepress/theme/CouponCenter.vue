<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { studioRequest } from './studio-api'

interface Coupon { id: string; kind: 'loyalty' | 'review'; discount: number; state: 'issuing' | 'issued' | 'failed' | 'uncertain'; code: string | null; retryAt: string | null; createdAt: string }
interface Check { status: 'pending' | 'ok' | 'error'; checkedAt: string | null }
const coupons = ref<Coupon[]>([])
const checks = ref<Record<string, Check>>({})
const signedIn = ref(false)
const loading = ref(false)
const error = ref('')
const configured = ref(false)
const page = ref(1)
const total = ref(0)
let generation = 0
let token = ''

async function load(target = 1) {
  const request = ++generation
  token = getDiscordSession()
  signedIn.value = !!token; coupons.value = []; checks.value = {}; error.value = ''; loading.value = false; configured.value = false
  if (!token) return
  loading.value = true
  try {
    const data = await studioRequest<{ configured: boolean; coupons: Coupon[]; checks: Record<string, Check>; total: number; page: number }>('/coupons?page=' + target)
    if (request !== generation || token !== getDiscordSession()) return
    if (typeof data.configured !== 'boolean' || !Array.isArray(data.coupons) || !data.checks || !Number.isSafeInteger(data.total) || !Number.isSafeInteger(data.page)) throw new Error('Invalid coupon response.')
    configured.value = data.configured; coupons.value = data.coupons; checks.value = data.checks; total.value = data.total; page.value = data.page
  } catch (value) {
    if (request === generation) error.value = value instanceof Error ? value.message : 'Coupons could not be loaded.'
  } finally { if (request === generation) loading.value = false }
}
function changed() { if (getDiscordSession() !== token) void load() }
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', changed); window.addEventListener('storage', changed) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', changed); window.removeEventListener('storage', changed) })
</script>

<template>
  <main class="coupons">
    <header><p>LUMEN STUDIOS / REWARDS</p><h1>Your coupons.</h1><p>Your private BuiltByBit coupon codes appear here when issued.</p><button type="button" :disabled="loading" @click="load(page)">Refresh</button></header>
    <p v-if="!signedIn">Sign in with Discord to view your coupons.</p>
    <p v-if="error" class="coupon-error" role="alert">{{ error }}</p>
    <p v-if="loading" role="status">Loading coupons…</p>
    <template v-if="signedIn && !error && !loading">
      <p v-if="!configured || checks.reviews?.status === 'error' || checks.loyalty?.status === 'error'" class="coupon-error" role="alert">Some reward checks are unavailable. Please try again later or contact support.</p>
      <p v-if="!checks.reviews || !checks.loyalty">Reward checks are still starting. Refresh later.</p>
      <p v-if="!coupons.length">No coupons have been issued to this account yet. Eligibility is checked periodically.</p>
      <article v-for="coupon in coupons" :key="coupon.id">
        <div><strong>{{ coupon.discount }}% {{ coupon.kind === 'review' ? 'review reward' : 'loyalty reward' }}</strong><p>{{ coupon.kind === 'review' ? 'One total use.' : 'Permanent coupon.' }} BuiltByBit checks availability and usage limits at checkout.</p></div>
        <code v-if="coupon.state === 'issued' && coupon.code">{{ coupon.code }}</code>
        <p v-else-if="coupon.state === 'failed' && coupon.retryAt" class="coupon-error">BuiltByBit declined this request. We will retry automatically; contact support if it continues.</p>
        <p v-else-if="coupon.state === 'failed'" class="coupon-error">BuiltByBit declined this request. Contact support.</p>
        <p v-else class="coupon-error">Coupon issuance is pending or could not be confirmed. If it does not resolve, contact support; do not request another code.</p>
      </article>
      <nav v-if="total > 20" aria-label="Coupon pages"><button type="button" :disabled="page <= 1" @click="load(page - 1)">Previous</button> Page {{ page }} / {{ Math.ceil(total / 20) }} <button type="button" :disabled="page * 20 >= total" @click="load(page + 1)">Next</button></nav>
    </template>
    <section><h2>Loyalty coupon policy</h2><p>If found sharing this code with other users, your benefits and coupon will be taken away. All discount uses are logged.</p><p>BuiltByBit tracks coupon usage counts; this site does not verify who redeems a code. Codes are not locked to a BuiltByBit account. Do not share them. If your tier changes, older codes may remain valid until staff deactivate them on BuiltByBit.</p></section>
    <p>Review rewards require a website account and a BuiltByBit account linked to the same Discord account. Rewards are independent of star rating. Each review can earn one single-use code.</p>
    <a href="/account/loyalty">Explore Lumen Loyalty →</a>
  </main>
</template>

<style scoped>
.coupons{max-width:850px;margin:auto;padding:32px clamp(16px,3vw,32px) 64px}.coupons header,.coupons section,.coupons article{padding:24px;margin-bottom:16px;border:1px solid #9a6bf344;border-radius:16px;background:var(--vp-c-bg-soft)}.coupons header{background:radial-gradient(ellipse at 90% 0,#7b3ff22a,transparent 58%),var(--vp-c-bg-soft)}.coupons header>p:first-child{color:var(--vp-c-brand-1);font-size:.7rem;letter-spacing:.14em}.coupons h1{font-size:clamp(2rem,5vw,3rem)}.coupons h2{border:0}.coupons p{color:var(--vp-c-text-2);line-height:1.6}.coupons article{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.coupons code{padding:10px;border:1px solid var(--vp-c-brand-1);border-radius:8px;overflow-wrap:anywhere;user-select:all}.coupons button{padding:8px 14px;border:1px solid #9a6bf366;border-radius:8px;background:var(--vp-c-brand-soft)}.coupon-error{padding:12px;border:1px solid #d96176;border-radius:8px}
</style>
