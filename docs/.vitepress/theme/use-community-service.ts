import { onUnmounted, ref } from 'vue'
import { communityRequest, type Service } from './community-api'

export function useCommunityService() {
  const ready = ref(false)
  const checking = ref(false)
  const connectionMessage = ref('')
  let generation = 0
  async function checkConnection() {
    const requestId = ++generation
    checking.value = true; ready.value = false; connectionMessage.value = ''
    try {
      const result = await communityRequest<{ services: Service[] }>('/status', {}, false)
      if (!Array.isArray(result.services)) throw new Error('Website support did not return a valid readiness response.')
      if (requestId === generation) ready.value = true
    } catch (error) {
      if (requestId === generation) connectionMessage.value = error instanceof Error ? error.message : 'Website support is unavailable.'
    } finally { if (requestId === generation) checking.value = false }
  }
  onUnmounted(() => { generation++ })
  return { ready, checking, connectionMessage, checkConnection }
}
