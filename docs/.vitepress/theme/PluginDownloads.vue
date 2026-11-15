<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { studioRequest, savePluginDownload, uploadPluginDownload, cancelPluginUpload, type PluginDownload } from './studio-api'
import { trialProducts } from '../../../shared/trial-products.mjs'

const props = defineProps<{ staff?: boolean }>()
const items = ref<PluginDownload[]>([])
const builds = ref<{ productKey: string; state: string; message: string; updatedAt: string }[]>([])
const loading = ref(false)
const downloading = ref('')
const error = ref('')
const notice = ref('')
const signedIn = ref(false)
const page = ref(1)
const total = ref(0)
const drafts = ref<{ id: string; name: string; filename: string; state: string; expiresAt: string }[]>([])
const draftError = ref('')
const uploading = ref(false)
const uploadProgress = ref('')
const productId = ref('')
const version = ref('')
const file = ref<File | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
let uploadController: AbortController | null = null
let token = ''
let generation = 0
let controller: AbortController | null = null
const message = (value: unknown) => value instanceof Error ? value.message : 'The plugin download failed.'
const size = (value: number) => `${(value / 1048576).toFixed(2)} MB`

async function load(target = 1) {
  const current = ++generation
  token = getDiscordSession()
  signedIn.value = !!token
  loading.value = true; error.value = ''; draftError.value = ''
  if (!token) { items.value = []; builds.value = []; drafts.value = []; loading.value = false; return }
  try {
    const result = await studioRequest<{ items: PluginDownload[]; total: number; builds?: typeof builds.value }>('/downloads?page=' + target)
    if (current !== generation || token !== getDiscordSession()) return
    items.value = result.items; total.value = result.total; page.value = target; builds.value = result.builds || []
    if (props.staff) {
      try {
        const pending = await studioRequest<{ uploads: typeof drafts.value }>('/downloads/uploads')
        if (current === generation && token === getDiscordSession()) drafts.value = pending.uploads
      } catch (value) {
        if (current === generation && token === getDiscordSession()) {
          draftError.value = `Unfinished uploads could not be refreshed. ${message(value)} Use Refresh builds to retry; the list below may be out of date.`
        }
      }
    }
  } catch (value) {
    if (current === generation) { items.value = []; builds.value = []; drafts.value = []; error.value = message(value) }
  } finally { if (current === generation) loading.value = false }
}
async function download(artifact: PluginDownload) {
  if (downloading.value) return
  const captured = getDiscordSession()
  controller = new AbortController()
  downloading.value = artifact.id; error.value = ''; notice.value = ''
  try {
    await savePluginDownload(artifact, controller.signal)
    if (captured === getDiscordSession()) notice.value = `${artifact.filename} downloaded and SHA-256 verified.`
  } catch (value) {
    if (captured === getDiscordSession()) error.value = message(value)
  } finally { downloading.value = ''; controller = null }
}
async function cancelDraft(id: string) {
  const captured = getDiscordSession()
  error.value = ''
  try {
    await cancelPluginUpload(id)
    if (captured === getDiscordSession()) await load()
  } catch (value) {
    if (captured === getDiscordSession()) {
      await load()
      if (captured === getDiscordSession()) error.value = `Cancellation could not be confirmed. ${message(value)} Refresh builds and check unfinished uploads before retrying.`
    }
  }
}
function chooseFile(event: Event) {
  file.value = (event.target as HTMLInputElement).files?.[0] || null
}
async function upload() {
  if (uploading.value || !file.value) return
  const captured = getDiscordSession()
  const currentController = new AbortController()
  uploadController = currentController
  uploading.value = true; error.value = ''; notice.value = ''
  try {
    const artifact = await uploadPluginDownload({
      productId: productId.value, version: version.value.trim(),
    }, file.value, currentController.signal, value => {
      if (captured === getDiscordSession()) uploadProgress.value = value
    })
    if (captured !== getDiscordSession()) return
    notice.value = `${artifact.filename} privately published after server-side SHA-256 and JAR verification. No licenses were changed.`
    file.value = null
    if (fileInput.value) fileInput.value.value = ''
    await load()
  } catch (value) {
    if (captured === getDiscordSession()) {
      await load()
      if (captured === getDiscordSession()) error.value = message(value)
    }
  } finally {
    uploading.value = false; uploadProgress.value = ''; uploadController = null
  }
}
function changed() {
  if (token === getDiscordSession()) return
  controller?.abort()
  uploadController?.abort()
  file.value = null
  if (fileInput.value) fileInput.value.value = ''
  items.value = []; builds.value = []; drafts.value = []; draftError.value = ''; notice.value = ''
  void load()
}
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', changed); window.addEventListener('storage', changed) })
onUnmounted(() => { generation++; controller?.abort(); uploadController?.abort(); window.removeEventListener('lumen-discord-user', changed); window.removeEventListener('storage', changed) })
</script>

<template>
  <section class="website-workspace plugin-downloads" aria-label="Plugin downloads">
    <header><p class="website-kicker">{{ staff ? 'STAFF / BUILDS' : 'YOUR PLUGIN BUILDS' }}</p><h2>Plugin downloads</h2><p class="website-note">Plugin JARs stored privately. {{ staff ? 'Authorized release staff can upload JARs or inspect published builds.' : 'Only plugins covered by your active licenses or shared with you by an eligible owner are shown.' }} Every download is checked against its SHA-256 fingerprint before saving.</p></header>
    <p v-if="!signedIn" class="website-note">Sign in with Discord to view available downloads.</p>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
    <form v-if="staff && signedIn" class="plugin-upload" @submit.prevent="upload">
      <h3>Upload a plugin JAR</h3>
      <p class="website-note">Select a plugin from the shared catalog. Uploads work without the licensing service, never create products or grant licenses, and never replace existing binaries. Customers still need a verified active entitlement to download.</p>
      <p class="website-note">Upload only trusted, unencrypted plugin JARs with a plugin descriptor and compiled classes. Server verification is not a malware scan. Transfers are paced to respect staff write limits.</p>
      <p v-if="draftError" class="website-message website-error" role="alert">{{ draftError }}</p>
      <fieldset :disabled="uploading">
        <label>Plugin<select v-model="productId" required><option value="" disabled>Choose a plugin</option><option v-for="product in trialProducts" :key="product.productId" :value="product.productId">{{ product.name }}</option></select></label>
        <label>Version<input v-model="version" required maxlength="64" pattern="[A-Za-z0-9][A-Za-z0-9._+\-]*" placeholder="1.2.3"></label>
        <label>JAR file (maximum 32 MiB)<input ref="fileInput" type="file" accept=".jar,application/java-archive" required @change="chooseFile"></label>
        <button class="website-primary" type="submit" :disabled="!productId || !file || !!downloading">Upload and publish privately</button>
      </fieldset>
      <p v-if="uploading" role="status">{{ uploadProgress }}</p>
      <button v-if="uploading" type="button" @click="uploadController?.abort()">Cancel upload</button>
      <ul v-if="drafts.length"><li v-for="draft in drafts" :key="draft.id">{{ draft.filename }} — {{ draft.state }} (expires {{ new Date(draft.expiresAt).toLocaleString() }}) <button type="button" :disabled="uploading || loading || draft.state === 'verifying'" @click="cancelDraft(draft.id)">Discard unfinished upload</button></li></ul>
    </form>
    <p v-if="loading" role="status">Loading available builds…</p>
    <button v-if="signedIn" type="button" :disabled="loading || !!downloading" @click="load(page)">Refresh builds</button>
    <div class="website-list">
      <article v-for="artifact in items" :key="artifact.id">
        <h3>{{ artifact.name }} <span class="website-badge">{{ artifact.version }}</span></h3>
        <p class="website-note">{{ artifact.filename }} · {{ size(artifact.size) }} · {{ new Date(artifact.createdAt).toLocaleString() }}</p>
        <button class="website-primary" type="button" :disabled="!!downloading" @click="download(artifact)">{{ downloading === artifact.id ? 'Downloading and verifying…' : 'Download JAR' }}</button>
        <details><summary>SHA-256 fingerprint</summary><code>{{ artifact.sha256 }}</code></details>
      </article>
    </div>
    <p v-if="signedIn && !loading && !error && !items.length" class="website-note">No downloadable build is available for this account yet. A matching active product license and a successfully published build are required.</p>
    <div v-if="total > 20" class="website-pagination"><button type="button" :disabled="loading || !!downloading || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }} / {{ Math.ceil(total / 20) }}</span><button type="button" :disabled="loading || !!downloading || page * 20 >= total" @click="load(page + 1)">Next</button></div>
    <details v-if="staff && builds.length"><summary>Latest Maven build results</summary><ul><li v-for="build in builds" :key="build.productKey"><strong>{{ build.productKey }} — {{ build.state }}</strong><p>{{ build.message }}</p></li></ul></details>
  </section>
</template>

<style scoped>
.plugin-downloads{margin-block:1.5rem}.plugin-downloads code{overflow-wrap:anywhere;white-space:normal}.plugin-downloads article h3{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}.plugin-upload{margin-block:1.5rem;padding:1rem;border:1px solid var(--vp-c-divider);border-radius:12px}.plugin-upload fieldset{border:0;padding:0;display:grid;gap:.8rem}.plugin-upload label{display:grid;gap:.35rem}.plugin-upload input,.plugin-upload select{padding:.6rem;border:1px solid var(--vp-c-divider);border-radius:6px;background:var(--vp-c-bg);width:100%;min-width:0}
</style>
