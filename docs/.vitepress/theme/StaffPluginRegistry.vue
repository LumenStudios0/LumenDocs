<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import pluginData from './plugin-compatibility-data.json'
import { fetchRegistryItems } from './licensing-utils.mjs'
import { useSiteDialog } from './site-dialog'
const { confirm: confirmSiteAction } = useSiteDialog()

interface Plugin { pluginId: string; name: string; active: boolean }
interface Product { productId: string; name: string; active: boolean; plugins: string[] }
const props = defineProps<{
  request: <T>(path: string, init?: RequestInit) => Promise<T>
  testMode: boolean
  permissions: string[]
}>()
const can = (permission: string) => props.permissions.includes(permission)
const plugins = ref<Plugin[]>([])
const products = ref<Product[]>([])
const documentedId = ref('')
const pluginId = ref('')
const pluginName = ref('')
const productId = ref('')
const productName = ref('')
const linkPluginId = ref('')
const linkProductId = ref('')
const search = ref('')
const availability = ref('all')
const loading = ref(false)
const submitting = ref(false)
const error = ref('')
const notice = ref('')
const token = ref('')
const tokenOwner = ref('')
const tokenVisible = ref(false)
const editing = ref<{ kind: 'plugins' | 'products'; id: string; name: string } | null>(null)
const editedName = ref('')
const editInput = ref<HTMLInputElement | null>(null)
let generation = 0
const busy = computed(() => loading.value || submitting.value)
const matchingPlugins = computed(() => plugins.value.filter(plugin =>
  `${plugin.name} ${plugin.pluginId}`.toLowerCase().includes(search.value.trim().toLowerCase()) &&
  (availability.value === 'all' || plugin.active === (availability.value === 'active'))))
const matchingProducts = computed(() => products.value.filter(product =>
  `${product.name} ${product.productId}`.toLowerCase().includes(search.value.trim().toLowerCase()) &&
  (availability.value === 'all' || product.active === (availability.value === 'active'))))
const canLink = computed(() => {
  const product = products.value.find(item => item.productId === linkProductId.value)
  const plugin = plugins.value.find(item => item.pluginId === linkPluginId.value)
  return product?.active && plugin?.active && !product.plugins.includes(plugin.pluginId)
})
const messageOf = (value: unknown) => value instanceof Error ? value.message : 'Registry request failed.'
function clearToken() { token.value = ''; tokenOwner.value = ''; tokenVisible.value = false }
function chooseDocumentedPlugin() {
  const plugin = pluginData.plugins.find(item => item.id === documentedId.value)
  if (!plugin) return
  pluginId.value = plugin.id
  pluginName.value = plugin.name
  productId.value = plugin.id
  productName.value = plugin.name
}
async function load() {
  if (props.testMode) return
  const requestId = ++generation
  loading.value = true
  try {
    const [pluginRows, productRows] = await Promise.all([
      fetchRegistryItems<Plugin>(props.request, '/plugins'), fetchRegistryItems<Product>(props.request, '/products'),
    ])
    if (requestId !== generation) return
    plugins.value = pluginRows
    products.value = productRows
  } finally { if (requestId === generation) loading.value = false }
}
async function refresh() {
  error.value = ''
  try { await load() }
  catch (requestError) { error.value = messageOf(requestError) }
}
async function save<T>(path: string, body: Record<string, string | boolean> | undefined, success: string, accept?: (result: T) => void, method: 'POST' | 'DELETE' | 'PATCH' = 'POST') {
  if (busy.value || props.testMode) return
  submitting.value = true
  error.value = ''
  notice.value = ''
  let committed = false
  const requestId = generation
  try {
    const result = await props.request<T>(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) })
    committed = true
    if (requestId !== generation) return
    accept?.(result)
    await load()
    notice.value = success
  } catch (requestError) {
    if (requestId === generation || committed) {
      error.value = `${committed ? 'Change saved, but follow-up failed. Refresh before retrying. ' : ''}${messageOf(requestError)}`
    }
  } finally { submitting.value = false }
}
async function registerPlugin() {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(pluginId.value.trim()) || !pluginName.value.trim()) {
    error.value = 'Enter a plugin name and an ID using letters, numbers, dots, underscores, or hyphens.'
    return
  }
  if (token.value && !await confirmSiteAction('Save the displayed plugin token first. Register another plugin and replace it?', { title: 'Save your one-time token', confirmText: 'Register another plugin' })) return
  void save<Plugin & { pluginToken: string }>('/plugins', { pluginId: pluginId.value.trim(), name: pluginName.value.trim() },
    'Plugin registered in the shared website and Discord bot registry. Create or choose a product, then link it below.', result => {
      if (typeof result.pluginToken !== 'string' || !result.pluginToken) throw new Error('No plugin token was returned. Check the registry before retrying.')
      token.value = result.pluginToken
      tokenOwner.value = result.pluginId
      tokenVisible.value = false
      linkPluginId.value = result.pluginId
    })
}
function createProduct() {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(productId.value.trim()) || !productName.value.trim()) {
    error.value = 'Enter a product name and a valid product ID.'
    return
  }
  void save<Product>('/products', { productId: productId.value.trim(), name: productName.value.trim() },
    'Product created. Link its plugin below to enable license grants.', result => { linkProductId.value = result.productId })
}
async function linkPlugin() {
  if (!canLink.value) { error.value = 'Choose an active plugin and product that are not already linked.'; return }
  if (!await confirmSiteAction('Link this plugin to the product? Existing licenses for this product will also gain access to this plugin.', { title: 'Link plugin to product', confirmText: 'Link plugin' })) return
  void save(`/products/${encodeURIComponent(linkProductId.value)}/plugins/${encodeURIComponent(linkPluginId.value)}`, undefined,
    'Plugin linked. Matching documented products are now available in the customer license dropdown.')
}
async function setActive(kind: 'plugins' | 'products', item: Plugin | Product) {
  const id = 'pluginId' in item ? item.pluginId : item.productId
  if (!await confirmSiteAction(`${item.active ? 'Deactivate' : 'Activate'} ${item.name}? Deactivation prevents validation for the affected plugin or product.`, { title: item.active ? 'Deactivate registration' : 'Activate registration', confirmText: item.active ? 'Deactivate' : 'Activate', danger: item.active })) return
  void save(`/${kind}/${encodeURIComponent(id)}`, { active: !item.active }, `${item.name} ${item.active ? 'deactivated' : 'activated'}.`, undefined, 'PATCH')
}
async function edit(kind: 'plugins' | 'products', item: Plugin | Product) {
  editing.value = { kind, id: 'pluginId' in item ? item.pluginId : item.productId, name: item.name }
  editedName.value = item.name
  error.value = ''; notice.value = ''
  await nextTick()
  editInput.value?.focus()
}
function saveEdit() {
  const target = editing.value
  const name = editedName.value.trim()
  if (!target || !name || name.length > 120) { error.value = 'Enter a name between 1 and 120 characters.'; return }
  void save<Plugin | Product>(`/${target.kind}/${encodeURIComponent(target.id)}`, { name }, 'Name updated. IDs, tokens, links and licenses are unchanged.', result => {
    if (result.name !== name) throw new Error('The licensing API did not apply the new name. Refresh and update the VPS licensing API before retrying.')
    editing.value = null
  }, 'PATCH')
}
async function unlink(product: Product, id: string) {
  if (!await confirmSiteAction(`Remove plugin ${id} from ${product.name}? Licenses for this product will lose access to that plugin.`, { title: 'Remove linked plugin', confirmText: 'Remove plugin', danger: true })) return
  void save(`/products/${encodeURIComponent(product.productId)}/plugins/${encodeURIComponent(id)}`, undefined, 'Plugin removed from product.', undefined, 'DELETE')
}
async function remove(kind: 'plugins' | 'products', item: Plugin | Product) {
  const id = 'pluginId' in item ? item.pluginId : item.productId
  if (!await confirmSiteAction(`Permanently delete ${item.name}? This cannot be undone.`, { title: 'Delete registration', confirmText: 'Permanently delete', requiredText: id, danger: true })) return
  void save(`/${kind}/${encodeURIComponent(id)}`, undefined, `${item.name} permanently deleted.`, () => {
    if (kind === 'plugins' && tokenOwner.value === id) clearToken()
    if (editing.value?.kind === kind && editing.value.id === id) editing.value = null
  }, 'DELETE')
}
async function copyValue(value: string, label: string) {
  try { await navigator.clipboard.writeText(value); notice.value = `${label} copied.${label === 'Plugin token' ? ' Keep it private.' : ''}` }
  catch (copyError) { console.error('Registry clipboard access denied:', copyError); error.value = 'Clipboard access was denied. Select and copy the value manually.' }
}
onMounted(() => { void refresh() })
onUnmounted(() => { generation++; clearToken() })
</script>

<template>
  <section class="website-workspace registry">
    <header><div><p class="staff-eyebrow">PLUGIN &amp; PRODUCT REGISTRY</p><h2>Register once. Use across Lumen.</h2></div><button type="button" :disabled="busy || testMode" @click="refresh">Refresh registry</button></header>
    <p v-if="testMode" class="staff-note">Plugin registration is a live operation. Exit local test mode to manage the shared licensing registry.</p>
    <template v-else>
      <p class="staff-note">These are the same plugins and products used by your Discord bot. Registration alone does not grant licenses or change plugin jars.</p>
      <p v-if="error" class="staff-message staff-error" role="alert">{{ error }}</p>
      <p v-if="notice" class="staff-message" role="status">{{ notice }}</p>
      <p v-if="loading" role="status">Loading the shared registry...</p>
      <form v-if="editing" class="registry-form registry-editor" @submit.prevent="saveEdit">
        <h3>Edit {{ editing.kind === 'plugins' ? 'plugin' : 'product' }}</h3>
        <p class="staff-note">ID: <code>{{ editing.id }}</code>. IDs cannot be renamed because plugin jars and existing licenses reference them.</p>
        <label class="staff-field">Display name<input ref="editInput" v-model="editedName" maxlength="120" required :disabled="busy"></label>
        <p v-if="editing.kind === 'plugins'" class="staff-note">Plugin name editing requires the VPS licensing API update described in the Worker setup guide. Activation and deletion work independently.</p>
        <div class="staff-actions"><button class="staff-primary" type="submit" :disabled="busy || !editedName.trim() || editedName.trim() === editing.name">Save changes</button><button type="button" :disabled="busy" @click="editing = null">Cancel editing</button></div>
      </form>
      <section v-if="token" class="staff-key" aria-label="New plugin token">
        <strong>Private plugin token for {{ tokenOwner }}</strong>
        <p class="staff-note">Save this token before leaving or refreshing this screen. It is not stored in your browser and will not be displayed again.</p>
        <label class="staff-field">Save this token securely<input :type="tokenVisible ? 'text' : 'password'" :value="token" readonly autocomplete="off"></label>
        <div class="staff-actions"><button type="button" @click="tokenVisible = !tokenVisible">{{ tokenVisible ? 'Hide token' : 'Reveal token' }}</button><button type="button" @click="copyValue(token, 'Plugin token')">Copy token</button><button type="button" @click="clearToken">Dismiss token</button></div>
      </section>
      <label v-if="can('plugins.register') || can('products.create')" class="staff-field">Start from a documented plugin<select v-model="documentedId" :disabled="busy" @change="chooseDocumentedPlugin"><option value="">Choose a plugin to fill the forms</option><option v-for="plugin in pluginData.plugins" :key="plugin.id" :value="plugin.id">{{ plugin.name }}{{ plugin.status === 'coming-soon' ? ' (coming soon)' : '' }}</option></select></label>
      <div class="staff-columns">
        <form v-if="can('plugins.register')" class="registry-form" @submit.prevent="registerPlugin">
          <h3>1. Register plugin</h3>
          <label class="staff-field">Plugin name<input v-model="pluginName" maxlength="120" required :disabled="busy" placeholder="LumenShards"></label>
          <label class="staff-field">Plugin ID<input v-model="pluginId" maxlength="64" pattern="[A-Za-z0-9_.\-]+" required :disabled="busy" placeholder="Exact ID embedded in the plugin"></label>
          <p class="staff-note">Use the exact plugin ID embedded in your jar's licensing code. The documentation slug is only a suggested starting point. Do not register an existing plugin again.</p>
          <button class="staff-primary" type="submit" :disabled="busy || !pluginId.trim() || !pluginName.trim()">Register plugin</button>
        </form>
        <form v-if="can('products.create')" class="registry-form" @submit.prevent="createProduct">
          <h3>2. Create product</h3>
          <label class="staff-field">Product name<input v-model="productName" maxlength="120" required :disabled="busy" placeholder="LumenShards"></label>
          <label class="staff-field">Product ID<input v-model="productId" maxlength="64" pattern="[A-Za-z0-9_.\-]+" required :disabled="busy" placeholder="lumen-shards"></label>
          <p class="staff-note">Skip this step if the product already exists. Keep the documented plugin's name so it matches the license-grant dropdown.</p>
          <button class="staff-primary" type="submit" :disabled="busy || !productId.trim() || !productName.trim()">Create product</button>
        </form>
      </div>
      <form v-if="can('products.link')" class="registry-form" @submit.prevent="linkPlugin">
        <h3>3. Link plugin to product</h3>
        <div class="staff-columns">
          <label class="staff-field">Registered plugin<select v-model="linkPluginId" :disabled="busy" required><option disabled value="">Choose an active plugin</option><option v-for="plugin in plugins.filter(item => item.active)" :key="plugin.pluginId" :value="plugin.pluginId">{{ plugin.name }} / {{ plugin.pluginId }}</option></select></label>
          <label class="staff-field">License product<select v-model="linkProductId" :disabled="busy" required><option disabled value="">Choose an active product</option><option v-for="product in products.filter(item => item.active)" :key="product.productId" :value="product.productId">{{ product.name }} / {{ product.productId }}</option></select></label>
        </div>
        <p class="staff-note">Linking also gives existing licenses for this product access to the plugin. Coming-soon entries remain unavailable in the documented grant dropdown.</p>
        <button class="staff-primary" type="submit" :disabled="busy || !canLink">Link plugin to product</button>
      </form>
      <div class="staff-columns">
        <label class="staff-field">Search registry<input v-model="search" type="search" placeholder="Plugin or product name or ID"></label>
        <label class="staff-field">Availability<select v-model="availability"><option value="all">All registrations</option><option value="active">Active registrations</option><option value="inactive">Inactive registrations</option></select></label>
      </div>
      <h3>Registered plugins</h3>
      <div class="staff-products">
        <article v-for="plugin in matchingPlugins" :key="plugin.pluginId"><div><h3>{{ plugin.name }}</h3><code>{{ plugin.pluginId }}</code><p class="staff-note">Products: {{ products.filter(product => product.plugins.includes(plugin.pluginId)).map(product => product.name).join(', ') || 'Not linked yet' }}</p><div class="staff-actions"><button v-if="can('plugins.manage')" type="button" :disabled="busy" @click="edit('plugins', plugin)">Edit plugin</button><button v-if="can('plugins.manage')" type="button" :disabled="busy" @click="setActive('plugins', plugin)">{{ plugin.active ? 'Deactivate plugin' : 'Activate plugin' }}</button><button v-if="can('plugins.delete')" class="registry-danger" type="button" :disabled="busy || products.some(product => product.plugins.includes(plugin.pluginId))" @click="remove('plugins', plugin)">Delete plugin permanently</button></div><p v-if="can('plugins.delete') && products.some(product => product.plugins.includes(plugin.pluginId))" class="staff-note">Deactivate each linked product and unlink this plugin below before deletion.</p></div><span class="staff-badge">{{ plugin.active ? 'Active' : 'Inactive' }}</span></article>
      </div>
      <p v-if="!loading && !matchingPlugins.length" class="staff-empty">No registered plugins match.</p>
      <h3>License products</h3>
      <p class="staff-note">Removing a plugin requires unlinking it from every product first. The licensing service requires products to be inactive before unlinking, and refuses product deletion while license records exist.</p>
      <div class="staff-products"><article v-for="product in matchingProducts" :key="product.productId"><div><h3>{{ product.name }}</h3><code>{{ product.productId }}</code><p class="staff-note">{{ product.plugins.length }} linked plugins</p><div class="staff-actions"><button v-if="can('products.manage')" type="button" :disabled="busy" @click="edit('products', product)">Edit product</button><button v-if="can('products.manage')" type="button" :disabled="busy" @click="setActive('products', product)">{{ product.active ? 'Deactivate product' : 'Activate product' }}</button><button v-if="can('products.delete')" class="registry-danger" type="button" :disabled="busy" @click="remove('products', product)">Delete product permanently</button></div><div v-for="id in product.plugins" :key="id" class="registry-link"><code>{{ id }}</code><button v-if="can('products.unlink')" type="button" :disabled="busy || product.active" @click="unlink(product, id)">Unlink plugin</button></div></div><span class="staff-badge">{{ product.active ? 'Active' : 'Inactive' }}</span><button type="button" :aria-label="`Copy product ID ${product.productId}`" @click="copyValue(product.productId, 'Product ID')">Copy ID</button></article></div>
      <p v-if="!loading && !matchingProducts.length" class="staff-empty">No registered products match.</p>
    </template>
  </section>
</template>

<style scoped>
.registry > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.staff-eyebrow { color: var(--vp-c-brand-1); font-size: .65rem; letter-spacing: .1em; }
.staff-note, .staff-empty { color: var(--vp-c-text-2); font-size: .78rem; line-height: 1.7; overflow-wrap: anywhere; }
.staff-columns { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.staff-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.staff-message, .staff-key { padding: 18px; border: 1px solid var(--vp-c-brand-2); border-radius: 12px; background: var(--vp-c-brand-soft); }
.staff-message { font-size: .82rem; overflow-wrap: anywhere; }
.staff-error { border-color: var(--vp-c-danger-2); color: var(--vp-c-danger-1); background: var(--vp-c-danger-soft); }
.staff-key input { font-family: var(--vp-font-family-mono); }
.registry .staff-primary { border-color: #7b3ff2; background: #7b3ff2; color: white; }
.staff-products { display: grid; gap: 10px; }
.staff-products article { display: flex; align-items: flex-start; gap: 12px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 12px; background: var(--vp-c-bg); }
.staff-products article > div { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.staff-products button { flex-shrink: 0; }
.registry-link { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 12px; }
.registry .registry-danger { border-color: var(--vp-c-danger-2); color: var(--vp-c-danger-1); }
.staff-products h3 { margin: 0 0 6px; }
.staff-products code, .staff-badge { font-size: .72rem; color: var(--vp-c-text-2); }
.staff-badge { padding: 3px 7px; border: 1px solid var(--vp-c-divider); border-radius: 6px; }
.registry-form { margin: 18px 0; padding: 18px; border: 1px solid var(--vp-c-divider); border-radius: 12px; }
.registry-form h3 { margin-top: 0; }
.registry header { flex-wrap: wrap; }
.registry select, .registry input { min-width: 0; max-width: 100%; }
@media (max-width: 900px) { .staff-columns { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 600px) { .staff-products article { flex-wrap: wrap; } .staff-products article > div { flex-basis: 100%; } }
</style>
