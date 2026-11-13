<script setup lang="ts">
import AccountLicenseOverview from './AccountLicenseOverview.vue'
import AccountConnectedServers from './AccountConnectedServers.vue'

const destinations = [
  { mark: '01', title: 'Licenses & purchases', text: 'Reveal your shared key, refresh purchases, and manage server IPs.', href: '/account/licenses', action: 'Open license center' },
  { mark: '02', title: 'Plugin catalog', text: 'Explore the Lumen collection and jump straight into installation guides.', href: '/account/products', action: 'Explore plugins' },
  { mark: '03', title: 'Account settings', text: 'Sync your Discord identity and manage your account data.', href: '/account/settings', action: 'Manage account' },
]
</script>

<template>
  <main class="customer-workspace">
    <header class="customer-hero">
      <div class="customer-hero-orbit" aria-hidden="true"><span>LS</span></div>
      <p class="customer-eyebrow">LUMEN STUDIOS / CUSTOMER WORKSPACE</p>
      <h1>Your plugins.<br><span>Your control center.</span></h1>
      <p>Real license information, purchase verification, and server access. All in one place.</p>
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
.customer-hero-orbit { position: absolute; right: -55px; top: -50px; display: grid; width: 270px; height: 270px; place-items: center; border: 1px solid #9a6bf333; border-radius: 50%; box-shadow: 0 0 0 36px #9a6bf30a, 0 0 0 72px #9a6bf308; animation: workspace-orbit 8s ease-in-out infinite; }
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
@keyframes workspace-orbit { 50% { transform: translateY(12px) rotate(8deg); } }
@media (max-width: 640px) { .customer-destinations { grid-template-columns: 1fr; } .customer-support { align-items: flex-start; flex-direction: column; gap: 12px; } .customer-hero-orbit { right: -160px; opacity: .4; } }
@media (prefers-reduced-motion: reduce) { .customer-hero-orbit { animation: none; } .customer-destinations > a { transition: none; } }
</style>
