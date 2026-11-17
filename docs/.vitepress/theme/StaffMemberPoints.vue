<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { studioRequest } from './studio-api'
import { getDiscordSession } from './discord-session'
import { useSiteDialog } from './site-dialog'

const props = defineProps<{ userId: string; disabled: boolean }>()
interface Wallet {
  actorId: string
  balance: number; total: number; page: number; pageSize: number
  items: { id: string; points: number; label: string; reason: string; createdAt: string; actorId: string | null }[]
}
const wallet = ref<Wallet | null>(null)
const busy = ref(false), error = ref(''), notice = ref('')
const points = ref(''), reason = ref(''), action = ref<'give' | 'take'>('give')
const pending = ref<{ requestId: string; action: 'give' | 'take'; points: string; reason: string } | null>(null)
const { confirm } = useSiteDialog()
const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 })
let generation = 0, session = ''
const storageKey = () => `lumen-staff-points:${wallet.value?.actorId}:${props.userId}`
async function load(page = 1) {
  if (busy.value) return
  const current = ++generation, token = getDiscordSession()
  session = token
  busy.value = true; error.value = ''
  try {
    const result = await studioRequest<Wallet>(`/staff/points/${props.userId}?page=${page}`)
    if (current === generation && token === getDiscordSession()) {
      wallet.value = result
      if (!pending.value) {
        const saved = sessionStorage.getItem(storageKey())
        if (saved) {
          const item = JSON.parse(saved)
          if (!item || typeof item.requestId !== 'string' || !['give', 'take'].includes(item.action) ||
              typeof item.points !== 'string' || typeof item.reason !== 'string') throw new Error('The saved adjustment is invalid. Review transactions and clear the saved request before submitting again.')
          pending.value = item; points.value = item.points; reason.value = item.reason; action.value = item.action
        }
      }
    }
  } catch (value) {
    if (current === generation && token === getDiscordSession()) error.value = value instanceof Error ? value.message : 'Wallet could not be loaded.'
  } finally { if (current === generation) busy.value = false }
}
async function adjust() {
  if (busy.value || props.disabled || !wallet.value) return
  const token = getDiscordSession(), target = props.userId, current = generation
  if (!pending.value) {
    if (!/^(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?$/.test(points.value) || Number(points.value) < .01 || Number(points.value) > 1000000 ||
        reason.value.trim().length < 5 || reason.value.length > 500) { error.value = 'Enter 0.01 to 1,000,000 points and a reason of 5 to 500 characters.'; return }
    if (!await confirm(`${action.value === 'give' ? 'Give' : 'Deduct'} ${points.value} LP ${action.value === 'give' ? 'to' : 'from'} this member? Reason: ${reason.value}`, {
      title: 'Adjust member points', confirmText: 'Save adjustment', danger: action.value === 'take',
    })) return
    if (current !== generation || token !== getDiscordSession() || target !== props.userId || props.disabled || busy.value) return
    pending.value = { requestId: crypto.randomUUID(), action: action.value, points: points.value, reason: reason.value.trim() }
  }
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const key = storageKey()
    sessionStorage.setItem(key, JSON.stringify(pending.value))
    const result = await studioRequest<Wallet>(`/staff/points/${target}`, { method: 'POST', body: JSON.stringify(pending.value) })
    if (current !== generation || token !== getDiscordSession()) return
    sessionStorage.removeItem(key)
    wallet.value = result; pending.value = null; points.value = ''; reason.value = ''
    notice.value = 'Adjustment saved, audited, and sent to the member as a notification.'
  } catch (value) {
    if (current === generation && token === getDiscordSession()) error.value = `${value instanceof Error ? value.message : 'Adjustment could not be confirmed.'} Retry uses the same request ID to avoid duplicate points.`
  } finally { if (current === generation) busy.value = false }
}
async function clearSaved() {
  const token = getDiscordSession(), current = generation
  if (busy.value || !await confirm('First review the transactions: this adjustment may already have succeeded. Clearing its saved request does not undo any points. Only start a new adjustment if it is genuinely a different action.', { title: 'Clear saved adjustment', confirmText: 'I reviewed the transactions', danger: true })) return
  if (current !== generation || token !== getDiscordSession()) return
  try { sessionStorage.removeItem(storageKey()); pending.value = null; points.value = ''; reason.value = ''; notice.value = 'Saved request cleared. Existing transactions are unchanged.' }
  catch (value) { error.value = value instanceof Error ? value.message : 'The saved request could not be cleared.' }
}
function sessionChanged() { if (session === getDiscordSession()) return; generation++; wallet.value = null; pending.value = null; busy.value = false; error.value = ''; notice.value = ''; void load() }
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', sessionChanged); window.addEventListener('storage', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged); window.removeEventListener('storage', sessionChanged) })
</script>

<template>
  <section class="member-wallet website-panel" aria-label="Customer Lumen Points">
    <header><div><p class="website-note">MEMBER REWARDS / LEVEL 2 SUPPORT</p><h2>Lumen Points</h2></div><strong v-if="wallet">{{ format(wallet.balance) }} <small>LP available</small></strong></header>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
    <p v-if="busy && !wallet" role="status">Loading member wallet...</p>
    <template v-if="wallet">
      <form class="wallet-form" @submit.prevent="adjust">
        <label>Action<select v-model="action" :disabled="busy || disabled || !!pending"><option value="give">Give points</option><option value="take">Take points</option></select></label>
        <label>Lumen Points<input v-model="points" inputmode="decimal" pattern="(?:0|[1-9]\d{0,6})(?:\.\d{1,2})?" required placeholder="100" :disabled="busy || disabled || !!pending"></label>
        <label>Reason (visible to member)<input v-model="reason" minlength="5" maxlength="500" required placeholder="Explain the adjustment" :disabled="busy || disabled || !!pending"></label>
        <button class="website-primary" type="submit" :disabled="busy || disabled">{{ busy ? 'Saving...' : pending ? 'Retry same adjustment' : 'Review adjustment' }}</button>
      </form>
      <button v-if="pending || error" type="button" :disabled="busy" @click="clearSaved">Clear saved request after reviewing transactions</button>
      <p class="website-note">Every adjustment is audited and notifies the member. Deductions cannot exceed available points. Only Owner may adjust their own wallet.</p>
      <h3>All transactions <small>({{ wallet.total }})</small></h3>
      <p v-if="!wallet.items.length" class="website-note">No transactions recorded yet.</p>
      <ol class="wallet-ledger"><li v-for="item in wallet.items" :key="item.id"><div><strong>{{ item.label }}</strong><p v-if="item.reason">{{ item.reason }}</p><small>{{ new Date(item.createdAt).toLocaleString() }}<template v-if="item.actorId"> / Staff {{ item.actorId }}</template></small></div><b :class="{ credit: item.points > 0 }">{{ item.points > 0 ? '+' : '' }}{{ format(item.points) }} LP</b></li></ol>
      <nav class="website-actions" aria-label="Member points transaction pages"><button :disabled="busy || wallet.page <= 1" @click="load(wallet.page - 1)">Previous</button><span>Page {{ wallet.page }} / {{ Math.max(1, Math.ceil(wallet.total / wallet.pageSize)) }}</span><button :disabled="busy || wallet.page * wallet.pageSize >= wallet.total" @click="load(wallet.page + 1)">Next</button><button :disabled="busy" @click="load(wallet.page)">Refresh balance</button></nav>
    </template>
  </section>
</template>

<style scoped>
.member-wallet { margin: 20px 0; border: 1px solid var(--vp-c-brand-2); border-radius: 16px; padding: 22px; background: radial-gradient(ellipse at top right, var(--vp-c-brand-soft), transparent 65%), var(--vp-c-bg-soft); }
.member-wallet header, .wallet-ledger li { display: flex; align-items: center; justify-content: space-between; gap: 18px; }
.member-wallet h2 { margin: 0 0 14px; border: 0; padding: 0; }
.member-wallet header > strong { color: var(--vp-c-brand-1); font-size: 1.8rem; }
.member-wallet small { font-size: .72rem; color: var(--vp-c-text-2); }
.wallet-form { display: grid; grid-template-columns: 130px 130px minmax(150px, 1fr) auto; gap: 12px; align-items: end; }
.wallet-form label { display: grid; gap: 6px; font-size: .78rem; }
.wallet-form input, .wallet-form select { min-width: 0; width: 100%; }
.wallet-ledger { list-style: none; padding: 0; }
.wallet-ledger li { padding: 14px 0; border-bottom: 1px solid var(--vp-c-divider); font-size: .82rem; }
.wallet-ledger li > div { min-width: 0; overflow-wrap: anywhere; }
.wallet-ledger p { margin: 4px 0; }
.wallet-ledger b { flex-shrink: 0; color: var(--vp-c-danger-1); }
.wallet-ledger .credit { color: var(--vp-c-brand-1); }
@media(max-width: 800px) { .wallet-form { grid-template-columns: 1fr 1fr; } .wallet-form label:nth-child(3) { grid-column: 1 / -1; } .member-wallet header { flex-wrap: wrap; } }
</style>
