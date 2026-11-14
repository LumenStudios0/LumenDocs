<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { communityRequest, communityDate, type CommunityPage, type TrialRequest } from './community-api'
import { getDiscordSession } from './discord-session'
import { useSiteDialog } from './site-dialog'
import { trialProducts as products } from '../../../shared/trial-products.mjs'
const props = defineProps<{ staff?: boolean }>()
const { confirm } = useSiteDialog()
const items = ref<TrialRequest[]>([]), page = ref(1), total = ref(0), loading = ref(false), busy = ref(false)
const productId = ref(''), reason = ref(''), requestedDuration = ref(7), reviewNote = ref(''), durations = ref<Record<string, number>>({}), error = ref(''), notice = ref('')
const signedIn = ref(false)
let generation = 0, token = ''
function session() { try { return getDiscordSession() } catch { return '' } }
function productName(id: string) { return products.find(product => product.productId === id)?.name || id }
function reviewDuration(item: TrialRequest) { return durations.value[item.id] ?? item.requestedDurationDays ?? 7 }
function setReviewDuration(item: TrialRequest, event: Event) { durations.value[item.id] = (event.target as HTMLInputElement).valueAsNumber }
async function load(target = 1) {
  const id = ++generation
  token = session(); signedIn.value = !!token; items.value = []; error.value = ''; loading.value = true
  if (!token) { loading.value = false; return }
  try {
    const result = await communityRequest<CommunityPage<TrialRequest>>(`${props.staff ? '/staff' : ''}/trials?page=${target}&pageSize=20`)
    if (id === generation) { items.value = result.items; page.value = result.page; total.value = result.total }
  } catch (e) { if (id === generation) error.value = e instanceof Error ? e.message : 'Could not load trial requests.' }
  finally { if (id === generation) loading.value = false }
}
async function submit() {
  if (busy.value || !products.some(product => product.productId === productId.value)) return
  const captured = session()
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await communityRequest('/trials', { method: 'POST', body: JSON.stringify({ productId: productId.value.trim(), reason: reason.value, requestedDurationDays: requestedDuration.value }) })
    if (captured !== session()) return
    productId.value = ''; reason.value = ''; requestedDuration.value = 7; await load()
    notice.value = error.value ? 'Request submitted, but the list could not refresh. Do not repeat the request.' : 'Trial request submitted for review.'
  } catch (e) { if (captured === session()) error.value = e instanceof Error ? e.message : 'Could not submit request.' }
  finally { busy.value = false }
}
async function review(item: TrialRequest, status: 'approved' | 'declined') {
  if (busy.value || item.status !== 'pending') return
  const captured = session()
  const duration = reviewDuration(item)
  if (!await confirm(`${status === 'approved' ? `Grant a ${duration}-day trial for ${item.productId}` : `Decline the request for ${item.productId}`}?`, { title: 'Review trial request', confirmText: status === 'approved' ? 'Grant trial' : 'Decline' }) || captured !== session()) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    await communityRequest(`/staff/trials/${encodeURIComponent(item.id)}`, { method: 'PUT', body: JSON.stringify({ status, reviewNote: reviewNote.value, ...(status === 'approved' ? { durationDays: duration } : {}) }) })
    if (captured !== session()) return
    reviewNote.value = ''; await load(page.value)
    notice.value = error.value ? 'Review submitted but refresh failed. Do not repeat the action.' : 'Trial review saved.'
  } catch (e) { if (captured === session()) { const message = e instanceof Error ? e.message : 'Review failed.'; await load(page.value); if (captured === session()) error.value = `${message} Approval may be processing; verify licensing before attempting again.` } }
  finally { busy.value = false }
}
function changed() { if (session() !== token) { generation++; items.value = []; reason.value = ''; productId.value = ''; requestedDuration.value = 7; durations.value = {}; reviewNote.value = ''; notice.value = ''; void load() } }
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', changed); window.addEventListener('storage', changed) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', changed); window.removeEventListener('storage', changed) })
</script>
<template><section class="website-workspace"><header><p class="website-kicker">{{ staff ? 'STAFF / TRIALS' : 'YOUR ACCOUNT' }}</p><h2>{{ staff ? 'Review trial requests' : 'Request a product trial' }}</h2><p class="website-note">{{ staff ? 'Approval grants a real trial license. Processing or failed requests require investigation; never repeat an ambiguous grant.' : 'Tell us which product you would like to try. Staff review requests before granting a trial.' }}</p></header>
<p v-if="!signedIn" class="website-message">Use <strong>Log in</strong> in the header to connect your Discord account and {{ staff ? 'review' : 'request' }} trials.</p>
<p v-if="error" class="website-message website-error" role="alert">{{ error }}</p><p v-if="notice" class="website-message" role="status">{{ notice }}</p><p v-if="loading" role="status">Loading requests…</p>
<form v-if="!staff && signedIn" class="website-panel" @submit.prevent="submit"><fieldset class="trial-products"><legend>Choose a plugin</legend><label v-for="product in products" :key="product.productId" class="trial-product"><input v-model="productId" type="radio" name="trial-product" :value="product.productId" required><span>{{ product.name }}</span></label></fieldset><label>Trial duration<select v-model.number="requestedDuration"><option :value="1">1 day</option><option :value="3">3 days</option><option :value="7">A week</option><option :value="30">A month (30 days)</option></select></label><label>Why would you like a trial?<textarea v-model="reason" required minlength="5" maxlength="2000" rows="4" /></label><button class="website-primary" :disabled="busy || !productId" type="submit">{{ busy ? 'Sending…' : 'Request trial' }}</button></form>
<div v-if="staff && signedIn" class="website-panel"><label>Review note<textarea v-model="reviewNote" maxlength="1000" rows="2" /></label></div>
<div class="website-list"><article v-for="item in items" :key="item.id"><p class="website-meta"><span class="website-badge">{{ item.status === 'grant_failed' ? 'Needs manual grant verification' : item.status }}</span> · {{ communityDate(item.createdAt) }}</p><h3>{{ productName(item.productId) }}</h3><p class="website-note">Requested: {{ item.requestedDurationDays ?? 7 }} {{ (item.requestedDurationDays ?? 7) === 1 ? 'day' : 'days' }}</p><p v-if="staff && item.customerDiscordId" class="website-note">Customer Discord ID: {{ item.customerDiscordId }}</p><p class="website-body">{{ item.reason }}</p><p v-if="item.expiresAt" class="website-note">Expires {{ communityDate(item.expiresAt) }}</p><p v-if="item.reviewNote" class="website-note">Review: {{ item.reviewNote }}</p><p v-if="staff && ['processing', 'failed', 'grant_failed'].includes(item.status)" class="website-message">Verify the licensing backend before taking further action. Do not repeat an ambiguous grant.</p><div v-if="staff && item.status === 'pending'"><label>Approved duration (days)<input :value="reviewDuration(item)" type="number" min="1" max="30" required @input="setReviewDuration(item, $event)"></label><div class="website-actions"><button type="button" class="website-primary" :disabled="busy || reviewDuration(item) < 1 || reviewDuration(item) > 30 || !Number.isInteger(reviewDuration(item))" @click="review(item, 'approved')">Approve &amp; grant</button><button type="button" :disabled="busy" @click="review(item, 'declined')">Decline</button></div></div></article></div>
<p v-if="signedIn && !loading && !error && !items.length" class="website-note">No requests on this page.</p><div v-if="signedIn && total > 20" class="website-pagination"><button :disabled="loading || busy || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }} / {{ Math.ceil(total / 20) }}</span><button :disabled="loading || busy || page * 20 >= total" @click="load(page + 1)">Next</button></div></section></template>
<style scoped>
.trial-products { border: 0; padding: 0; margin: 0 0 1.25rem; display: flex; gap: .6rem; flex-wrap: wrap }
.trial-products legend { font-weight: 600; margin-bottom: .6rem }
.trial-product { display: flex; align-items: center; gap: .5rem; border: 1px solid var(--vp-c-divider); border-radius: .6rem; padding: .6rem .8rem; cursor: pointer }
.trial-product:has(input:checked) { border-color: var(--vp-c-brand-1); background: var(--vp-c-brand-soft) }
.trial-product input { width: auto; margin: 0; accent-color: var(--vp-c-brand-1) }
</style>
