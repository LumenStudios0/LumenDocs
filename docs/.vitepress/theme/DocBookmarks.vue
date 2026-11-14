<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useData, useRoute } from 'vitepress'
import { clearBookmarks, readBookmarks, toggleBookmark } from './doc-bookmarks.mjs'
import { useSiteDialog } from './site-dialog'
const { confirm: confirmSiteAction } = useSiteDialog()
const props = defineProps<{ list?: boolean }>()
const route = useRoute()
const { page } = useData()
const bookmarks = ref<{ path: string; title: string }[]>([])
const error = ref('')
const search = ref('')
const currentSaved = computed(() => bookmarks.value.some(item => item.path === route.path))
const filtered = computed(() => bookmarks.value.filter(item => `${item.title} ${item.path}`.toLowerCase().includes(search.value.trim().toLowerCase())))
function load() {
  try { bookmarks.value = readBookmarks(localStorage); error.value = '' }
  catch (storageError) { error.value = storageError instanceof Error ? storageError.message : 'This browser could not load bookmarks.' }
}
function toggle(path = route.path, title = page.value.title) {
  try {
    bookmarks.value = toggleBookmark(localStorage, { path, title })
    error.value = ''
    window.dispatchEvent(new Event('lumen-bookmarks-updated'))
  } catch (storageError) { error.value = storageError instanceof Error ? storageError.message : 'This browser could not save bookmarks.' }
}
async function clear() {
  if (!await confirmSiteAction('Clear all documentation bookmarks saved in this browser?', { title: 'Clear bookmarks', confirmText: 'Clear bookmarks', danger: true })) return
  try { clearBookmarks(localStorage); bookmarks.value = []; error.value = ''; window.dispatchEvent(new Event('lumen-bookmarks-updated')) }
  catch (storageError) { error.value = storageError instanceof Error ? storageError.message : 'Could not clear bookmarks.' }
}
onMounted(() => { load(); window.addEventListener('lumen-bookmarks-updated', load) })
onUnmounted(() => window.removeEventListener('lumen-bookmarks-updated', load))
</script>

<template>
  <section v-if="list" class="website-workspace" aria-label="Documentation bookmarks">
    <header><p class="website-kicker">YOUR READING LIST</p><h2>Pick up where you left off.</h2><p class="website-note">Bookmarks are saved only in this browser. No Discord sign-in is needed.</p></header>
    <label>Find a saved guide<input v-model="search" type="search" placeholder="Guide name or path"></label>
    <p v-if="error" class="website-message website-error" role="alert">{{ error }}</p>
    <div class="website-list"><article v-for="item in filtered" :key="item.path"><h3><a :href="item.path">{{ item.title }}</a></h3><p class="website-note">{{ item.path }}</p><button type="button" :aria-label="`Remove bookmark for ${item.title}`" @click="toggle(item.path, item.title)">Remove bookmark</button></article></div>
    <p v-if="!filtered.length && !error" class="website-note">No matching bookmarks. Open a guide and select Save guide.</p>
    <button type="button" @click="clear">Clear all bookmarks</button>
  </section>
  <div v-else class="doc-save-guide"><button type="button" :aria-pressed="currentSaved" @click="toggle()">{{ currentSaved ? '★ Guide saved' : '☆ Save guide' }}</button><a href="/bookmarks">My bookmarks</a><p v-if="error" role="alert">{{ error }}</p></div>
</template>

<style scoped>
.doc-save-guide { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 0 0 20px; font-size: .75rem; }
.doc-save-guide button { padding: 7px 11px; border: 1px solid var(--vp-c-divider); border-radius: 8px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-1); cursor: pointer; }
.doc-save-guide button[aria-pressed=true] { color: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); }
.doc-save-guide :is(button,a):focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 3px; }
.doc-save-guide p { flex-basis: 100%; color: var(--vp-c-danger-1); }
</style>
