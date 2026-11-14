<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { communityRequest } from './community-api'
import { getDiscordSession } from './discord-session'
const props = defineProps<{ id: string }>()
const subscribed = ref<boolean | null>(null), busy = ref(false), error = ref('')
let generation = 0
function session() { try { return getDiscordSession() } catch { return '' } }
async function click() {
  if (busy.value) return
  const token = session(), id = generation
  busy.value = true; error.value = ''
  try {
    const path = `/issues/${encodeURIComponent(props.id)}/subscription`
    if (subscribed.value === null) {
      const state = await communityRequest<{ subscribed: boolean }>(path)
      if (id !== generation || token !== session()) return
      subscribed.value = state.subscribed
    } else {
      const state = await communityRequest<{ subscribed: boolean }>(path, { method: 'PUT', body: JSON.stringify({ subscribed: !subscribed.value }) })
      if (id !== generation || token !== session()) return
      subscribed.value = state.subscribed
    }
  } catch (e) { if (id === generation) error.value = e instanceof Error ? e.message : 'Could not update subscription.' }
  finally { busy.value = false }
}
function changed() { generation++; subscribed.value = null; error.value = '' }
onMounted(() => { window.addEventListener('lumen-discord-user', changed); window.addEventListener('storage', changed) })
onUnmounted(() => { generation++; window.removeEventListener('lumen-discord-user', changed); window.removeEventListener('storage', changed) })
</script>
<template><div><button type="button" :disabled="busy" @click="click">{{ subscribed === null ? 'Check subscription' : subscribed ? 'Unsubscribe from issue' : 'Subscribe to issue' }}</button><span v-if="subscribed !== null" class="website-note"> {{ subscribed ? 'Subscribed' : 'Not subscribed' }}</span><p v-if="error" class="website-error" role="alert">{{ error }}</p></div></template>
