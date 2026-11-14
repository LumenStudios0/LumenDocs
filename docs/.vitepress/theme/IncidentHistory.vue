<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { communityRequest, communityDate, type CommunityPage, type Incident } from './community-api'
const items = ref<Incident[]>([]), page = ref(1), total = ref(0), loading = ref(false), error = ref('')
let generation = 0
async function load(target = 1) {
  const id = ++generation; loading.value = true; error.value = ''
  try { const result = await communityRequest<CommunityPage<Incident>>(`/incidents?page=${target}&pageSize=20`, {}, false); if (id === generation) { items.value = result.items; page.value = result.page; total.value = result.total } }
  catch (e) { if (id === generation) error.value = e instanceof Error ? e.message : 'Could not load incident history.' }
  finally { if (id === generation) loading.value = false }
}
onMounted(() => void load())
onUnmounted(() => { generation++ })
</script>
<template><section><h3>Incident history</h3><p v-if="error" role="alert" class="website-message website-error">{{ error }} <button type="button" @click="load(page)">Retry</button></p><p v-if="loading" role="status">Loading incident history…</p><div class="website-list"><article v-for="incident in items" :key="incident.id"><p class="website-meta"><span class="website-badge" :data-status="incident.status">{{ incident.status }}</span> · {{ incident.serviceId }}</p><p>{{ incident.previousStatus }} → {{ incident.status }}</p><p v-if="incident.message">{{ incident.message }}</p><p class="website-note">Started {{ communityDate(incident.startedAt) }} · {{ incident.resolvedAt ? `Resolved ${communityDate(incident.resolvedAt)}` : 'Ongoing' }}</p></article></div><p v-if="!loading && !error && !items.length">No incidents recorded.</p><div v-if="total > 20" class="website-pagination"><button :disabled="loading || page <= 1" @click="load(page - 1)">Previous</button><span>Page {{ page }} / {{ Math.ceil(total / 20) }}</span><button :disabled="loading || page * 20 >= total" @click="load(page + 1)">Next</button></div></section></template>
