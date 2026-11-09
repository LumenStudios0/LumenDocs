<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface ConnectedServer {
  id: string
  name: string
  address?: string
  status?: string
}

const servers = ref<ConnectedServer[]>([])
const loading = ref(true)
const message = ref('')
const messageType = ref<'info' | 'error'>('info')

function getAccountEndpoint() {
  const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + '/account/servers'
  endpoint.search = ''
  return endpoint.toString()
}

onMounted(async () => {
  let token = ''
  try {
    token = sessionStorage.getItem('lumen-discord-session') ?? ''
  } catch (error) {
    console.error('Unable to access the Discord sign-in session:', error)
    message.value = 'This browser could not access your sign-in session.'
    messageType.value = 'error'
    loading.value = false
    return
  }

  if (!token) {
    message.value = 'Sign in with Discord to view servers connected to your licenses.'
    loading.value = false
    return
  }

  const endpoint = getAccountEndpoint()
  if (!endpoint) {
    message.value = 'The customer service endpoint is not configured yet.'
    loading.value = false
    return
  }

  try {
    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json() as { servers?: ConnectedServer[]; error?: string }
    if (!response.ok) {
      message.value = result.error ?? 'Connected server data is not available yet.'
      return
    }

    servers.value = Array.isArray(result.servers) ? result.servers : []
    if (!servers.value.length) message.value = 'No connected servers were returned for this account.'
  } catch (error) {
    console.error('Unable to load connected license servers:', error)
    message.value = 'Could not load connected servers. Please try again later.'
    messageType.value = 'error'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="connected-servers" aria-labelledby="connected-servers-title">
    <div class="connected-servers-heading">
      <div>
        <p class="connected-servers-eyebrow">License activity</p>
        <h2 id="connected-servers-title">Connected servers</h2>
      </div>
      <span class="connected-servers-count">{{ servers.length }} servers</span>
    </div>
    <p class="connected-servers-description">
      See which server installations are using a license. The license service is not connected yet.
    </p>
    <div v-if="loading" class="connected-servers-state" role="status">Checking your account…</div>
    <div v-else-if="servers.length" class="connected-servers-list">
      <article v-for="server in servers" :key="server.id" class="connected-server">
        <span class="connected-server-indicator" aria-hidden="true" />
        <span class="connected-server-details">
          <strong>{{ server.name }}</strong>
          <small v-if="server.address">{{ server.address }}</small>
        </span>
        <span v-if="server.status" class="connected-server-status">{{ server.status }}</span>
      </article>
    </div>
    <div v-else class="connected-servers-state" :class="{ 'is-error': messageType === 'error' }" role="status">
      {{ message }}
    </div>
  </section>
</template>

<style scoped>
.connected-servers {
  margin: 24px 0;
  padding: 22px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 16px;
  background: var(--lumen-card-bg, var(--vp-c-bg-soft));
}

.connected-servers-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.connected-servers-heading h2 {
  margin: 2px 0 0;
  border: 0;
  font-size: 1.15rem;
}

.connected-servers-eyebrow {
  margin: 0;
  color: var(--vp-c-brand-1);
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.connected-servers-count {
  padding: 5px 9px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 999px;
  color: var(--vp-c-text-2);
  font-size: 0.76rem;
  white-space: nowrap;
}

.connected-servers-description,
.connected-servers-state {
  color: var(--vp-c-text-2);
  font-size: 0.86rem;
  line-height: 1.6;
}

.connected-servers-state {
  padding: 16px;
  border: 1px dashed var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 10px;
}

.connected-servers-state.is-error {
  color: var(--vp-c-danger-1, #e5484d);
}

.connected-servers-list {
  display: grid;
  gap: 9px;
  margin-top: 16px;
}

.connected-server {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 12px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 10px;
}

.connected-server-indicator {
  width: 8px;
  height: 8px;
  flex: 0 0 8px;
  border-radius: 50%;
  background: var(--vp-c-brand-1);
}

.connected-server-details {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.connected-server-details strong {
  overflow: hidden;
  font-size: 0.86rem;
  text-overflow: ellipsis;
}

.connected-server-details small,
.connected-server-status {
  color: var(--vp-c-text-2);
  font-size: 0.74rem;
}

.connected-server-status {
  margin-left: auto;
}
</style>
