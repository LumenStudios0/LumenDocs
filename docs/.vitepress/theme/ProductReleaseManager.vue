<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { studioRequest, type ProductRelease } from './studio-api'
import { getDiscordSession } from './discord-session'
import { useSiteDialog } from './site-dialog'
import RichEditor from './RichEditor.vue'
import RichContent from './RichContent.vue'
import PluginDownloads from './PluginDownloads.vue'

const props = defineProps<{ permissions: string[]; products: { productId: string; name: string; active: boolean }[] }>()
const can = (value: string) => props.permissions.includes(value)
const { confirm } = useSiteDialog()
const releases = ref<ProductRelease[]>([])
const editing = ref('')
const productId = ref('')
const version = ref('')
const body = ref('')
const channel = ref<'stable' | 'beta'>('stable')
const minecraftVersions = ref('')
const published = ref(false)
const busy = ref(false)
const error = ref('')
const notice = ref('')
const customerIds = ref('')
const grantProduct = ref('')
const expiry = ref('')
const giveLumenPoints = ref(true)
const batchId = ref('')
const outcomes = ref<{ customerId: string; state: string; message: string }[]>([])
const page = ref(1)
const total = ref(0)
let generation = 0
let sessionToken = ''
const message = (value: unknown) => value instanceof Error ? value.message : 'Website tools request failed.'
function resetRelease() {
  editing.value = ''; productId.value = ''; version.value = ''; body.value = ''; channel.value = 'stable'; minecraftVersions.value = ''; published.value = false
}
async function load(target = 1) {
  if (!can('products.manage')) return
  const current = ++generation
  const token = getDiscordSession()
  busy.value = true; error.value = ''
  try {
    const result = await studioRequest<{ items: ProductRelease[]; total: number }>('/staff/releases?page=' + target)
    if (current === generation && token === getDiscordSession()) { releases.value = result.items; total.value = result.total; page.value = target }
  } catch (value) { if (current === generation) error.value = message(value) }
  finally { if (current === generation) busy.value = false }
}
function edit(item: ProductRelease) {
  editing.value = item.id; productId.value = item.productId; version.value = item.version; body.value = item.body
  channel.value = item.channel; minecraftVersions.value = item.minecraftVersions; published.value = item.published
}
async function save() {
  if (busy.value) return
  if (published.value && !await confirm('Publish this release and its notes to the public updates page?', { title: 'Publish product release', confirmText: 'Publish release' })) return
  const token = getDiscordSession()
  busy.value = true; error.value = ''; notice.value = ''
  let committed = false
  try {
    await studioRequest('/staff/releases' + (editing.value ? '/' + editing.value : ''), {
      method: editing.value ? 'PUT' : 'POST',
      body: JSON.stringify({ productId: productId.value, version: version.value, channel: channel.value, body: body.value, minecraftVersions: minecraftVersions.value, published: published.value }),
    })
    committed = true
    if (token !== getDiscordSession()) return
    resetRelease()
    await load(page.value)
    notice.value = 'Release saved. Published release notes appear in Updates.'
  } catch (value) { if (token === getDiscordSession()) error.value = `${committed ? 'Saved; refresh failed. Do not repeat the action. ' : ''}${message(value)}` }
  finally { busy.value = false }
}
async function grant() {
  if (busy.value || batchId.value) return
  const ids = [...new Set(customerIds.value.split(/[\s,]+/).filter(Boolean))]
  if (!ids.length || ids.length > 10 || ids.some(id => !/^\d{5,22}$/.test(id))) { error.value = 'Enter 1–10 Discord IDs separated by spaces, commas, or new lines.'; return }
  if (expiry.value && (!Number.isFinite(Date.parse(expiry.value)) || Date.parse(expiry.value) <= Date.now())) { error.value = 'Choose a future expiration date.'; return }
  if (!await confirm(`Grant ${grantProduct.value} to ${ids.length} customers? Existing active access will be skipped.`, { title: 'Bulk license grant', confirmText: 'Grant licenses' })) return
  busy.value = true; error.value = ''; notice.value = ''; outcomes.value = []
  batchId.value = crypto.randomUUID()
  const token = getDiscordSession()
  try {
    const result = await studioRequest<{ results: typeof outcomes.value }>('/bulk-grants', {
      method: 'POST', body: JSON.stringify({ requestId: batchId.value, productId: grantProduct.value, customerIds: ids, expiresAt: expiry.value ? new Date(expiry.value).toISOString() : null, giveLumenPoints: giveLumenPoints.value }),
    })
    if (token === getDiscordSession()) {
      outcomes.value = result.results
      notice.value = 'Batch finished. Review each result below; uncertain results must be checked on the customer profile.'
    }
  } catch (value) { if (token === getDiscordSession()) error.value = `${message(value)} Some grants may have completed. Do not repeat this batch without checking customer accounts.` }
  finally { busy.value = false }
}
function clearBatch() {
  batchId.value = ''; outcomes.value = []; customerIds.value = ''; error.value = ''; notice.value = ''
}
function sessionChanged() {
  const current = getDiscordSession()
  if (current === sessionToken) return
  sessionToken = current
  generation++; releases.value = []; resetRelease(); clearBatch(); void load()
}
onMounted(() => { sessionToken = getDiscordSession(); void load(); window.addEventListener('lumen-discord-user', sessionChanged) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', sessionChanged) })
</script>

<template>
  <section class="website-workspace release-manager">
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
    <form v-if="can('licenses.grant')" class="website-panel" @submit.prevent="grant">
      <h2>Bulk license grants</h2>
      <p class="website-note">Up to 10 customers per batch. Existing active access is preserved. Each successful grant sends a private website notification.</p>
      <label>Product<select v-model="grantProduct" required :disabled="busy || !!batchId"><option value="">Choose product</option><option v-for="product in products.filter(item => item.active)" :key="product.productId" :value="product.productId">{{ product.name }}</option></select></label>
      <label>Discord customer IDs<textarea v-model="customerIds" rows="4" required :disabled="busy || !!batchId" placeholder="One Discord ID per line" /></label>
      <label>Expires at (optional; blank means lifetime)<input v-model="expiry" type="datetime-local" :disabled="busy || !!batchId"></label>
      <label class="website-check"><input v-model="giveLumenPoints" type="checkbox" :disabled="busy || !!batchId">Give Lumen Points</label>
      <p class="website-note">One award per member/plugin at its published USD catalog price. Paid purchases are not credited twice. Trials and points-shop free products are excluded; unpriced products wait for catalog setup.</p>
      <button class="website-primary" type="submit" :disabled="busy || !!batchId || !grantProduct">Grant licenses</button>
      <button v-if="batchId" type="button" :disabled="busy" @click="clearBatch">Start a different batch</button>
      <ul v-if="outcomes.length"><li v-for="outcome in outcomes" :key="outcome.customerId"><strong>{{ outcome.customerId }} — {{ outcome.state }}</strong>: {{ outcome.message }}</li></ul>
    </form>
    <template v-if="can('products.manage')">
      <PluginDownloads staff />
      <form class="website-panel" @submit.prevent="save">
        <h2>Product release manager</h2>
        <p class="website-note">Create drafts or publish versioned release notes and compatibility details. Successfully built plugin JARs are available in the private download panel above.</p>
        <label>Product<select v-model="productId" required :disabled="busy"><option value="">Choose product</option><option v-for="product in products" :key="product.productId" :value="product.productId">{{ product.name }}</option></select></label>
        <div class="website-columns"><label>Version<input v-model="version" required maxlength="60" :disabled="busy" placeholder="1.2.0"></label><label>Channel<select v-model="channel" :disabled="busy"><option value="stable">Stable</option><option value="beta">Beta</option></select></label></div>
        <label>Supported Minecraft versions<input v-model="minecraftVersions" maxlength="200" :disabled="busy" placeholder="1.21.x"></label>
        <RichEditor v-model="body" label="Release notes" :disabled="busy" />
        <label class="website-check"><input v-model="published" type="checkbox" :disabled="busy">Publish release notes and notify product subscribers</label>
        <button class="website-primary" type="submit" :disabled="busy">Save release</button>
        <button type="button" :disabled="busy" @click="resetRelease">New draft</button>
      </form>
      <div class="website-list"><article v-for="release in releases" :key="release.id"><h3>{{ release.productId }} {{ release.version }}</h3><p>{{ release.channel }} · {{ release.published ? 'Published' : 'Draft' }} · {{ release.minecraftVersions || 'No compatibility notes' }}</p><RichContent :text="release.body" /><button type="button" :disabled="busy" @click="edit(release)">Edit release</button></article></div>
      <nav class="website-actions" aria-label="Release pages"><button :disabled="busy || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }}</span><button :disabled="busy || page * 20 >= total" @click="load(page + 1)">Next</button></nav>
    </template>
  </section>
</template>
