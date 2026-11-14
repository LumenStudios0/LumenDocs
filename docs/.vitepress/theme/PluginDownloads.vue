<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'
import { studioRequest, savePluginDownload, type PluginDownload } from './studio-api'

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
let token = ''
let generation = 0
let controller: AbortController | null = null
const message = (value: unknown) => value instanceof Error ? value.message : 'The plugin download failed.'
const size = (value: number) => `${(value / 1048576).toFixed(2)} MB`

async function load(target = 1) {
  const current = ++generation
  token = getDiscordSession()
  signedIn.value = !!token
  loading.value = true; error.value = ''
  if (!token) { items.value = []; builds.value = []; loading.value = false; return }
  try {
    const result = await studioRequest<{ items: PluginDownload[]; total: number; builds?: typeof builds.value }>('/downloads?page=' + target)
    if (current !== generation || token !== getDiscordSession()) return
    items.value = result.items; total.value = result.total; page.value = target; builds.value = result.builds || []
  } catch (value) {
    if (current === generation) { items.value = []; builds.value = []; error.value = message(value) }
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
function changed() {
  if (token === getDiscordSession()) return
  controller?.abort()
  items.value = []; builds.value = []; notice.value = ''
  void load()
}
onMounted(() => { void load(); window.addEventListener('lumen-discord-user', changed); window.addEventListener('storage', changed) })
onUnmounted(() => { generation++; controller?.abort(); window.removeEventListener('lumen-discord-user', changed); window.removeEventListener('storage', changed) })
</script>

<template>
  <section class="website-workspace plugin-downloads" aria-label="Plugin downloads">
    <header><p class="website-kicker">{{ staff ? 'STAFF / BUILDS' : 'YOUR PLUGIN BUILDS' }}</p><h2>Plugin downloads</h2><p class="website-note">Maven-built JARs stored privately. {{ staff ? 'Authorized release staff can inspect all published builds.' : 'Only plugins covered by your active licenses are shown.' }} Every download is checked against its SHA-256 fingerprint before saving.</p></header>
    <p v-if="!signedIn" class="website-note">Sign in with Discord to view available downloads.</p>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <p v-if="notice" class="website-message" role="status">{{ notice }}</p>
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
.plugin-downloads{margin-block:1.5rem}.plugin-downloads code{overflow-wrap:anywhere;white-space:normal}.plugin-downloads article h3{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
</style>
