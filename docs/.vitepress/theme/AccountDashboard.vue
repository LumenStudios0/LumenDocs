<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AccountLicenseOverview from './AccountLicenseOverview.vue'
import AccountConnectedServers from './AccountConnectedServers.vue'
import { getDiscordSession } from './discord-session'
import { studioRequest } from './studio-api'

const loyalty = ref('')
const loyaltyError = ref('')
let loyaltyGeneration = 0
async function loadLoyalty() {
  const generation = ++loyaltyGeneration
  const token = getDiscordSession()
  loyalty.value = ''
  loyaltyError.value = ''
  if (!token) return
  try {
    const data = await studioRequest<{ tier: { name: string } | null }>('/loyalty')
    if (generation === loyaltyGeneration && token === getDiscordSession()) loyalty.value = data.tier?.name || ''
  } catch {
    if (generation === loyaltyGeneration && token === getDiscordSession()) loyaltyError.value = 'Loyalty unavailable'
  }
}
onMounted(() => { void loadLoyalty(); window.addEventListener('lumen-discord-user', loadLoyalty); window.addEventListener('storage', loadLoyalty) })
onUnmounted(() => { loyaltyGeneration++; window.removeEventListener('lumen-discord-user', loadLoyalty); window.removeEventListener('storage', loadLoyalty) })

const destinations = [
  { mark: '01', title: 'Licenses & purchases', text: 'Reveal your shared key, refresh purchases, and manage server IPs.', href: '/account/licenses', action: 'Open license center' },
  { mark: '02', title: 'Plugin catalog', text: 'Explore the Lumen collection and jump straight into installation guides.', href: '/account/products', action: 'Explore plugins' },
  { mark: '03', title: 'Account settings', text: 'Sync your Discord identity and manage your account data.', href: '/account/settings', action: 'Manage account' },
  { mark: '04', title: 'Website support', text: 'Create private tickets and follow staff replies on the website.', href: '/account/tickets', action: 'Open my tickets' },
  { mark: '05', title: 'Notifications', text: 'Choose plugin update topics, announcements, and ticket alerts.', href: '/account/notifications', action: 'Read updates' },
  { mark: '06', title: 'Server health tools', text: 'Check plugin requirements and view studio service status.', href: '/getting-started/compatibility', action: 'Check compatibility' },
  { mark: '07', title: 'Lumen Loyalty', text: 'See your tier, explore perks, and manage plugin sub-clients.', href: '/account/loyalty', action: 'Explore loyalty' },
]
</script>

<template>
  <main class="customer-workspace">
    <header class="customer-hero">
      <div class="customer-hero-orbit" aria-hidden="true"><span>LS</span></div>
      <p class="customer-eyebrow">LUMEN STUDIOS / CUSTOMER WORKSPACE</p>
      <h1>Your plugins.<br><span>Your control center.</span></h1>
      <p>Real license information, purchase verification, and server access. All in one place.</p>
      <a v-if="loyalty || loyaltyError" class="customer-loyalty-badge" href="/account/loyalty">{{ loyalty || loyaltyError }}</a>
      <a href="/account/licenses">Manage my licenses <span aria-hidden="true">→</span></a>
    </header>
    <AccountLicenseOverview />
    <nav class="customer-destinations" aria-label="Account tools">
      <a v-for="destination in destinations" :key="destination.href" :href="destination.href">
        <span class="destination-mark">{{ destination.mark }} <span aria-hidden="true">↗</span></span>
        <h2>{{ destination.title }}</h2>
        <p>{{ destination.text }}</p>
        <strong>{{ destination.action }} →</strong>
      </a>
    </nav>
    <AccountConnectedServers />
    <aside class="customer-support"><div><strong>Need a hand getting connected?</strong><p>Copy safe diagnostics from your license summary before contacting support. Never share your license key.</p></div><a href="/support">Get support →</a></aside>
  </main>
</template>

<style scoped>
.customer-workspace { margin: 0 auto; max-width: 1168px; padding: 32px clamp(16px, 3vw, 32px) 60px; }
.customer-hero { position: relative; overflow: hidden; padding: clamp(26px, 5vw, 48px); border: 1px solid #9a6bf344; border-radius: 24px; background: radial-gradient(ellipse at 100% 0, #7b3ff22a, transparent 60%), var(--vp-c-bg-soft); }
.customer-eyebrow { position: relative; color: var(--vp-c-brand-1); font-size: .65rem; font-weight: 750; letter-spacing: .12em; }
.customer-hero h1 { position: relative; margin: 22px 0 16px; font-size: clamp(2.1rem, 5vw, 3.8rem); line-height: 1.06; letter-spacing: -.055em; }
.customer-hero h1 span { color: var(--vp-c-brand-1); }
.customer-hero > p:last-of-type { position: relative; max-width: 430px; color: var(--vp-c-text-2); font-size: .9rem; }
.customer-hero > a { position: relative; display: inline-flex; gap: 22px; margin-top: 12px; padding: 10px 16px; border-radius: 9px; background: #7b3ff2; color: white; text-decoration: none; font-size: .8rem; }
.customer-hero > a.customer-loyalty-badge { margin-right: 10px; border: 1px solid #aa82ff; background: var(--vp-c-bg); color: var(--vp-c-brand-1); font-weight: 750; }
.customer-hero-orbit { position: absolute; right: -55px; top: -50px; display: grid; width: 270px; height: 270px; place-items: center; border: 1px solid #9a6bf333; border-radius: 50%; box-shadow: 0 0 0 36px #9a6bf30a, 0 0 0 72px #9a6bf308; transform: rotateX(35deg) rotateY(-25deg); }
.customer-hero-orbit::before, .customer-hero-orbit::after { content: ""; position: absolute; inset: -36px; border: 2px solid transparent; border-top-color: #a77bff80; border-bottom-color: #a77bff40; border-radius: 50%; animation: customer-access-trace 16s linear infinite; }
.customer-hero-orbit::after { inset: -72px; animation-direction: reverse; animation-duration: 24s; opacity: .5; }
.customer-hero-orbit span { padding: 22px; border: 1px solid #9a6bf344; border-radius: 24px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); font-size: 2rem; font-weight: 800; transform: rotate(12deg); opacity: .5; }
.customer-destinations { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
.customer-destinations > a { display: flex; flex-direction: column; padding: 22px; border: 1px solid var(--vp-c-divider); border-radius: 17px; color: var(--vp-c-text-1); text-decoration: none; transition: border-color .2s, transform .2s; }
.customer-destinations > a:hover { transform: translateY(-4px); border-color: var(--vp-c-brand-1); }
.destination-mark { display: flex; justify-content: space-between; color: var(--vp-c-brand-1); font: .75rem var(--vp-font-family-mono); }
.customer-destinations h2 { margin: 24px 0 8px; padding: 0; border: 0; font-size: 1rem; }
.customer-destinations p { flex: 1; margin: 0 0 22px; color: var(--vp-c-text-2); font-size: .8rem; line-height: 1.7; }
.customer-destinations strong { color: var(--vp-c-brand-1); font-size: .75rem; }
.customer-support { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px; border: 1px solid var(--vp-c-divider); border-radius: 15px; }
.customer-support p { margin: 5px 0 0; color: var(--vp-c-text-2); font-size: .75rem; line-height: 1.6; }
.customer-support a { flex-shrink: 0; font-size: .8rem; }
@keyframes customer-access-trace { to { transform: rotate(360deg); } }
@media (max-width: 640px) { .customer-destinations { grid-template-columns: 1fr; } .customer-support { align-items: flex-start; flex-direction: column; gap: 12px; } .customer-hero-orbit { right: -160px; opacity: .4; } }
@media (prefers-reduced-motion: reduce) { .customer-hero-orbit { animation: none; } .customer-destinations > a { transition: none; } }
</style>
