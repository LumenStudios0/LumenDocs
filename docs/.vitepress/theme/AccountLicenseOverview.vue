<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { getDiscordSession } from './discord-session'

const savedIpCount = ref(0)
const ipStatus = ref('Sign in to view your allowlist')

function endpointFor(path: string) {
  const assistantEndpoint = import.meta.env.VITE_DOCS_ASSISTANT_ENDPOINT
  if (!assistantEndpoint) return ''

  const endpoint = new URL(assistantEndpoint, window.location.origin)
  endpoint.pathname = endpoint.pathname.replace(/\/chat\/?$/, '').replace(/\/$/, '') + path
  endpoint.search = ''
  return endpoint.toString()
}

async function refreshIpCount() {
  try {
    const token = getDiscordSession()
    const endpoint = endpointFor('/account/license-ips')
    if (!token || !endpoint) {
      ipStatus.value = 'Sign in to view your allowlist'
      return
    }
    const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
    const result = await response.json() as { addresses?: unknown }
    if (response.ok && Array.isArray(result.addresses)) {
      savedIpCount.value = Math.min(result.addresses.length, 3)
      ipStatus.value = 'Live shared-license allowlist'
    } else {
      savedIpCount.value = 0
      ipStatus.value = response.status === 404 ? 'Claim a license to add server IPs' : 'License service unavailable'
    }
  } catch (error) {
    console.error('Unable to load the customer license overview:', error)
    ipStatus.value = 'License service unavailable'
  }
}

onMounted(() => {
  void refreshIpCount()
  window.addEventListener('lumen-license-ips-updated', refreshIpCount)
})

onUnmounted(() => window.removeEventListener('lumen-license-ips-updated', refreshIpCount))
</script>

<template>
  <section class="license-overview" aria-label="License account overview">
    <div class="license-overview-top">
      <div>
        <span class="license-overview-kicker">LICENSE CENTER</span>
        <h2>Your server access, at a glance.</h2>
        <p>Claim one shared key for your eligible plugins and manage its server access here.</p>
      </div>
      <span class="license-preview-chip"><i /> LICENSE CENTER</span>
    </div>

    <div class="license-overview-stats">
      <article class="license-overview-stat">
        <span class="license-stat-icon">⌁</span>
        <span><small>LICENSE KEY</small><strong>One shared key</strong><i>Use it across eligible plugins</i></span>
      </article>
      <article class="license-overview-stat">
        <span class="license-stat-icon license-stat-green">⌖</span>
        <span><small>SERVER IP ADDRESSES</small><strong>{{ savedIpCount }} <em>/ 3</em></strong><i>{{ ipStatus }}</i></span>
      </article>
      <article class="license-overview-stat">
        <span class="license-stat-icon license-stat-orange">▤</span>
        <span><small>PURCHASE VERIFICATION</small><strong>BuiltByBit</strong><i>Connect a buyer account to claim</i></span>
      </article>
    </div>

    <div class="license-overview-steps">
      <span><b>01</b> Verify a purchase</span><i />
      <span><b>02</b> Add up to three IPs</span><i />
      <span><b>03</b> Review server activity</span>
    </div>
  </section>
</template>

<style scoped>
.license-overview {
  position: relative;
  margin: 20px 0 25px;
  padding: 21px;
  overflow: hidden;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 17px;
  background:
    radial-gradient(ellipse at 95% 0, rgb(123 63 242 / 13%), transparent 48%),
    var(--lumen-card-bg, var(--vp-c-bg-soft));
}

.license-overview-top,
.license-overview-stats,
.license-overview-steps {
  position: relative;
  z-index: 1;
}

.license-overview-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.license-overview-kicker,
.license-overview-stat small {
  color: var(--vp-c-brand-1);
  font-size: 0.58rem;
  font-weight: 750;
  letter-spacing: 0.11em;
}

.license-overview-top h2 {
  margin: 6px 0 5px;
  border: 0;
  font-size: 1.22rem;
  letter-spacing: -0.035em;
}

.license-overview-top p {
  margin: 0;
  color: var(--vp-c-text-2);
  font-size: 0.72rem;
  line-height: 1.55;
}

.license-preview-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid rgb(255 187 101 / 24%);
  border-radius: 999px;
  background: rgb(255 187 101 / 7%);
  color: #e8ad60;
  font-size: 0.48rem;
  font-weight: 750;
  letter-spacing: 0.06em;
}

.license-preview-chip i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #e8ad60;
}

.license-overview-stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 9px;
  margin-top: 17px;
}

.license-overview-stat {
  display: flex;
  min-width: 0;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 9px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 11px;
  background: color-mix(in srgb, var(--vp-c-bg) 70%, transparent);
  animation: license-stat-enter 550ms both;
}

.license-overview-stat:nth-child(2) { animation-delay: 80ms; }
.license-overview-stat:nth-child(3) { animation-delay: 160ms; }

.license-stat-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  place-items: center;
  border-radius: 8px;
  background: rgb(123 63 242 / 13%);
  color: #b89aff;
  font-size: 1rem;
}

.license-stat-green { background: rgb(84 216 154 / 10%); color: #54d89a; }
.license-stat-orange { background: rgb(255 187 101 / 10%); color: #e8ad60; }

.license-overview-stat > span:last-child {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.license-overview-stat small { color: var(--vp-c-text-3); font-size: 0.45rem; }
.license-overview-stat strong { overflow: hidden; font-size: 0.71rem; text-overflow: ellipsis; white-space: nowrap; }
.license-overview-stat strong em { color: var(--vp-c-text-3); font-size: 0.61rem; font-style: normal; font-weight: 550; }
.license-overview-stat > span:last-child > i { color: var(--vp-c-text-3); font-size: 0.49rem; font-style: normal; }

.license-overview-steps {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 15px;
  color: var(--vp-c-text-2);
  font-size: 0.55rem;
}

.license-overview-steps span { display: inline-flex; align-items: center; gap: 5px; }
.license-overview-steps b { color: var(--vp-c-brand-1); font-size: 0.48rem; }
.license-overview-steps > i { width: 12px; height: 1px; background: var(--lumen-card-border, var(--vp-c-divider)); }

@keyframes license-stat-enter {
  from { opacity: 0; transform: translateY(7px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 680px) {
  .license-overview-stats { grid-template-columns: 1fr; }
  .license-overview-stat { align-items: center; }
  .license-overview-steps { align-items: flex-start; flex-direction: column; }
  .license-overview-steps > i { width: 1px; height: 8px; margin-left: 3px; }
}

@media (prefers-reduced-motion: reduce) {
  .license-overview-stat { animation: none; }
}
</style>
