<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { studioRequest } from './studio-api'
import { useSiteDialog } from './site-dialog'
import LoyaltyBadge from './LoyaltyBadge.vue'

interface Tier { id: string; name: string; ips: number; subclients: number; discount: number }
interface Status {
  tier: Tier | null
  count: number
  total: number
  products: { productId: string; name: string }[]
  subclients: { productId: string; memberId: string; createdAt: string }[]
}
const cards = [
  { id: 'spark', name: 'Spark', need: '1 product', ips: 4, clients: 1, extra: 'Customer-exclusive giveaways' },
  { id: 'radiance', name: 'Radiance', need: '3 products', ips: 5, clients: 2, extra: '5% off plugins and feature voting' },
  { id: 'nova', name: 'Nova', need: '7 products', ips: 7, clients: 3, extra: '10% off plugins and priority support' },
  { id: 'elite', name: 'Lumen Elite', need: 'Every product', ips: 10, clients: 5, extra: '15% off plugins and early access to new plugins' },
]
const status = ref<Status | null>(null)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const productId = ref('')
const memberId = ref('')
const { confirm } = useSiteDialog()
let generation = 0
let token = ''

async function load() {
  const request = ++generation
  status.value = null
  error.value = ''
  loading.value = true
  try {
    token = getDiscordSession()
    if (!token) { error.value = 'Sign in with Discord to see your tier and manage sub-clients.'; return }
    const result = await studioRequest<Status>('/loyalty')
    if (request !== generation || token !== getDiscordSession()) return
    if (!Array.isArray(result.products) || !Array.isArray(result.subclients) || !Number.isInteger(result.count) || !Number.isInteger(result.total)) throw new Error('Invalid loyalty response.')
    status.value = result
    if (!result.products.some(product => product.productId === productId.value)) productId.value = result.products[0]?.productId || ''
  } catch (value) {
    if (request === generation) error.value = value instanceof Error ? value.message : 'Loyalty could not be loaded.'
  } finally { if (request === generation) loading.value = false }
}
async function change(action: 'add' | 'remove', product: string, member: string) {
  if (busy.value) return
  if (action === 'remove' && !await confirm('Remove this sub-client’s access to this plugin’s website downloads?', { title: 'Remove sub-client', confirmText: 'Remove access', danger: true })) return
  const request = generation, session = getDiscordSession()
  busy.value = true
  error.value = ''
  notice.value = ''
  try {
    await studioRequest('/loyalty/subclients', { method: 'POST', body: JSON.stringify({ action, productId: product, memberId: member.trim() }) })
    if (request !== generation || session !== getDiscordSession()) return
    memberId.value = ''
    await load()
    if (session === getDiscordSession()) notice.value = action === 'add' ? 'Sub-client added for this plugin.' : 'Sub-client removed.'
  } catch (value) {
    if (request === generation && session === getDiscordSession()) error.value = `${value instanceof Error ? value.message : 'The change could not be completed.'} Refresh the list before retrying.`
  } finally { busy.value = false }
}
function sessionChanged() { if (getDiscordSession() !== token) { memberId.value = ''; notice.value = ''; void load() } }
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', sessionChanged); window.addEventListener('storage', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged); window.removeEventListener('storage', sessionChanged) })
</script>

<template>
  <div class="loyalty">
    <header class="loyalty-hero"><p>LUMEN STUDIOS / LOYALTY</p><h1>Your plugins unlock more.</h1><p>Meet Lumen Loyalty. Every tier includes the perks before it; larger limits and discounts replace the earlier ones.</p>
      <div class="loyalty-current" aria-live="polite"><span>YOUR CURRENT TIER</span><LoyaltyBadge v-if="!loading && status?.tier" :tier="status.tier" /><strong v-else>{{ loading ? 'Checking…' : status ? 'Not yet unlocked' : 'Unavailable' }}</strong><small v-if="status">{{ status.count }} / {{ status.total }} active registered products owned</small><button type="button" :disabled="loading || busy" @click="load">Refresh</button></div>
    </header>
    <p v-if="error" class="loyalty-error" role="alert">{{ error }}</p>
    <p v-if="notice" role="status">{{ notice }}</p>
    <section aria-labelledby="loyalty-tiers"><h2 id="loyalty-tiers">Explore the tiers</h2><p>Elite requires all currently active, linked products in the licensing registry. Expired, revoked or inactive access does not count. Active staff grants and trials count too.</p>
      <div class="loyalty-grid"><article v-for="card in cards" :key="card.name" :class="{ current: status?.tier?.name === card.name }"><span>{{ card.need }}</span><h3><LoyaltyBadge :tier="card" /></h3><ul><li>{{ card.name }} profile badge<span v-if="card.id==='spark'">, 15 profile backgrounds and 12 avatar frames</span><span v-if="card.id==='radiance'"> and 12 avatar decorations</span></li><li>{{ card.ips }} server IP slots</li><li>{{ card.clients }} sub-client{{ card.clients === 1 ? '' : 's' }} per plugin</li><li>{{ card.extra }}</li></ul></article></div>
      <p class="loyalty-note"><strong>Available now:</strong> tier identification, animated badges, Spark profile backgrounds/frames, Radiance avatar decorations and shared website downloads. <strong>Planned, not yet active:</strong> expanded IP limits, giveaways, discounts, voting, priority support and early access. Your existing IP limit remains unchanged.</p>
    </section>
    <section class="loyalty-manage" aria-labelledby="loyalty-coupons"><h2 id="loyalty-coupons">Coupons</h2>
      <p>Coupon rewards are not available yet. No loyalty or review coupons are being issued automatically.</p>
      <p class="loyalty-note">Loyalty discounts are planned at 5% for Radiance, 10% for Nova and 15% for Lumen Elite. BuiltByBit does not currently document a way to restrict a coupon to one buyer's account.</p>
    </section>
    <section class="loyalty-manage" aria-labelledby="loyalty-clients"><h2 id="loyalty-clients">Sub-clients by plugin</h2>
      <p>Add someone by their Discord user ID after they sign in here. They can download the selected plugin from their own account while your access and tier remain eligible. This does not share your license key, add IP slots, or give them ownership or server validation.</p>
      <form v-if="status?.tier && status.products.length" @submit.prevent="change('add', productId, memberId)">
        <label>Owned plugin<select v-model="productId" required :disabled="busy"><option v-for="product in status.products" :key="product.productId" :value="product.productId">{{ product.name }}</option></select></label>
        <label>Sub-client Discord user ID<input v-model.trim="memberId" inputmode="numeric" pattern="[0-9]{5,22}" maxlength="22" required :disabled="busy" placeholder="Their Discord user ID"></label>
        <button type="submit" :disabled="busy">{{ busy ? 'Saving…' : 'Add sub-client' }}</button>
      </form>
      <p v-else-if="status">An active eligible product is required to add a sub-client.</p>
      <div v-if="status?.subclients.length" class="loyalty-list"><div v-for="client in status.subclients" :key="`${client.productId}:${client.memberId}`"><span><strong>{{ status.products.find(product => product.productId === client.productId)?.name || client.productId }}</strong><small>Discord ID {{ client.memberId }}</small></span><button type="button" :disabled="busy" @click="change('remove', client.productId, client.memberId)">Remove</button></div></div>
      <p v-else-if="status">No sub-clients added yet.</p>
      <p class="loyalty-note">If your tier drops, older assignments remain active up to the new per-plugin limit; extra assignments are suspended until space is available. You can remove assignments even after access expires.</p>
      <a href="/account/products">Open plugin downloads →</a>
    </section>
  </div>
</template>

<style scoped>
.loyalty{max-width:1160px;margin:auto;padding:32px clamp(16px,3vw,32px) 64px}
.loyalty-hero,.loyalty-manage{padding:clamp(22px,4vw,36px);border:1px solid #9a6bf344;border-radius:22px;background:radial-gradient(ellipse at 90% 0,#7b3ff22a,transparent 58%),var(--vp-c-bg-soft)}
.loyalty-hero>p:first-child{color:var(--vp-c-brand-1);font-size:.68rem;letter-spacing:.14em;font-weight:700}
.loyalty-hero h1{font-size:clamp(2rem,5vw,3.8rem);letter-spacing:-.05em;line-height:1.08;margin:18px 0}
.loyalty p{color:var(--vp-c-text-2);line-height:1.7}.loyalty-current{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:24px;padding:18px;border:1px solid #9a6bf344;border-radius:12px;background:var(--vp-c-bg)}
.loyalty-current>span:not(.loyalty-badge),.loyalty-grid article>span{font-size:.65rem;letter-spacing:.1em;color:var(--vp-c-brand-1);font-weight:700}.loyalty-current strong{font-size:1.3rem}.loyalty-current small{color:var(--vp-c-text-2)}.loyalty-current button{margin-left:auto}
.loyalty section{margin-top:32px}.loyalty h2{border:0;font-size:1.5rem}.loyalty-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.loyalty-grid article{padding:20px;border:1px solid var(--vp-c-divider);border-radius:16px;background:var(--vp-c-bg-soft)}.loyalty-grid article.current{border-color:var(--vp-c-brand-1);box-shadow:0 0 30px #7b3ff222}.loyalty-grid h3{margin:12px 0;font-size:1.2rem}.loyalty-grid ul{padding-left:18px;color:var(--vp-c-text-2);font-size:.82rem;line-height:1.8}
.loyalty-note{font-size:.8rem;padding:14px;border:1px solid var(--vp-c-divider);border-radius:10px}.loyalty-error{padding:12px;border:1px solid #d96176;border-radius:8px;color:var(--vp-c-text-1)!important}
.loyalty form{display:flex;gap:12px;align-items:end;flex-wrap:wrap}.loyalty label{display:grid;gap:6px;flex:1;min-width:180px;font-size:.8rem}.loyalty input,.loyalty select{width:100%;padding:10px;border:1px solid var(--vp-c-divider);border-radius:8px;background:var(--vp-c-bg);color:var(--vp-c-text-1)}
.loyalty button{padding:9px 14px;border:1px solid #9a6bf366;border-radius:8px;background:var(--vp-c-brand-soft);color:var(--vp-c-text-1);font-size:.8rem}.loyalty button:disabled{opacity:.5}.loyalty-list{margin-top:18px}.loyalty-list>div{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--vp-c-divider)}.loyalty-list span{display:grid;gap:3px}.loyalty-list small{color:var(--vp-c-text-2)}
@media(max-width:850px){.loyalty-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:480px){.loyalty-grid{grid-template-columns:1fr}}
</style>
