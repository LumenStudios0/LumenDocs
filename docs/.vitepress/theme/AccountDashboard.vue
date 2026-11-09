<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const dashboard = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | undefined

onMounted(() => {
  const root = dashboard.value
  if (!root) return

  if (!('IntersectionObserver' in window)) {
    root.querySelectorAll('.portal-reveal').forEach(element => element.classList.add('is-visible'))
    return
  }

  root.classList.add('portal-motion-ready')
  observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      currentObserver.unobserve(entry.target)
    })
  }, { threshold: 0.14 })

  root.querySelectorAll('.portal-reveal').forEach(element => observer?.observe(element))
})

onUnmounted(() => observer?.disconnect())
</script>

<template>
  <main ref="dashboard" class="portal-dashboard">
    <section class="portal-welcome">
      <div class="portal-welcome-copy">
        <div class="portal-kicker"><span class="portal-kicker-dot" /> CUSTOMER PORTAL</div>
        <h1>Your Lumen,<br><span>all in one place.</span></h1>
        <p>Pick up where you left off. Your licenses, products, and account controls each have a place of their own.</p>
        <div class="portal-welcome-actions">
          <a class="portal-primary-button" href="/account/licenses">Explore my licenses <span aria-hidden="true">↗</span></a>
          <a class="portal-quiet-link" href="/docs/">Browse documentation <span aria-hidden="true">→</span></a>
        </div>
        <div class="portal-preview-note"><span class="portal-preview-spark" aria-hidden="true">✦</span><span>Portal preview</span><i /><span>Purchase and license data will appear here when connected.</span></div>
      </div>

      <div class="portal-constellation" aria-label="Illustration of the customer portal connecting licenses, products, and account settings">
        <div class="portal-constellation-orbit portal-orbit-one" />
        <div class="portal-constellation-orbit portal-orbit-two" />
        <div class="portal-constellation-orbit portal-orbit-three" />
        <div class="portal-constellation-glow" />
        <div class="portal-connectors"><i /><i /><i /></div>
        <div class="portal-core"><span>✦</span><b>LUMEN</b></div>
        <div class="portal-float-node portal-node-license"><span class="portal-node-icon">⌁</span><span><b>Licenses</b><small>Manage access</small></span></div>
        <div class="portal-float-node portal-node-products"><span class="portal-node-icon">▦</span><span><b>Products</b><small>Your collection</small></span></div>
        <div class="portal-float-node portal-node-settings"><span class="portal-node-icon">⚙</span><span><b>Settings</b><small>Account controls</small></span></div>
        <span class="portal-star portal-star-one">✦</span>
        <span class="portal-star portal-star-two">✧</span>
        <span class="portal-star portal-star-three">·</span>
      </div>
    </section>

    <section class="portal-section portal-reveal">
      <div class="portal-section-heading">
        <div>
          <span class="portal-section-kicker">YOUR SPACE</span>
          <h2>What would you like to do?</h2>
        </div>
        <span class="portal-section-aside"><i /> 3 ways to manage your account</span>
      </div>

      <div class="portal-action-grid">
        <a class="portal-action-card portal-license-card" href="/account/licenses">
          <div class="portal-action-card-top">
            <span class="portal-action-icon"><span>⌁</span></span>
            <span class="portal-action-number">01</span>
          </div>
          <span class="portal-action-kicker">ACCESS & SERVERS</span>
          <h3>My licenses</h3>
          <p>Review license details, prepare up to three server IPs, and find connected server information.</p>
          <span class="portal-card-footer"><span>Manage licenses</span><i aria-hidden="true">↗</i></span>
          <span class="portal-card-orb" aria-hidden="true" />
        </a>

        <a class="portal-action-card portal-products-card" href="/account/products">
          <div class="portal-action-card-top">
            <span class="portal-action-icon"><span>▦</span></span>
            <span class="portal-action-number">02</span>
          </div>
          <span class="portal-action-kicker">YOUR COLLECTION</span>
          <h3>Products purchased</h3>
          <p>Browse owned products, discover what’s next, and jump to official product pages.</p>
          <span class="portal-card-footer"><span>Explore products</span><i aria-hidden="true">↗</i></span>
          <span class="portal-card-orb" aria-hidden="true" />
        </a>

        <a class="portal-action-card portal-settings-card" href="/account/settings">
          <div class="portal-action-card-top">
            <span class="portal-action-icon"><span>⚙</span></span>
            <span class="portal-action-number">03</span>
          </div>
          <span class="portal-action-kicker">PROFILE & SECURITY</span>
          <h3>Account settings</h3>
          <p>Review your Discord sign-in and account session information.</p>
          <span class="portal-card-footer"><span>Open settings</span><i aria-hidden="true">↗</i></span>
          <span class="portal-card-orb" aria-hidden="true" />
        </a>
      </div>
    </section>

    <section class="portal-bottom-row portal-reveal">
      <a class="portal-help-card" href="/docs/">
        <span class="portal-help-icon" aria-hidden="true">⌕</span>
        <span class="portal-help-copy"><small>NEED A HAND?</small><b>Find an answer in the docs</b><i>Installation, commands, configuration, and more.</i></span>
        <span class="portal-help-arrow" aria-hidden="true">↗</span>
      </a>
      <a class="portal-community-card" href="https://discord.gg/lumenstudios" target="_blank" rel="noreferrer">
        <span class="portal-community-mark" aria-hidden="true">✦</span>
        <span class="portal-help-copy"><small>THE COMMUNITY</small><b>Meet us on Discord</b><i>Get help and keep up with Lumen.</i></span>
        <span class="portal-help-arrow" aria-hidden="true">↗</span>
      </a>
    </section>
  </main>
</template>

<style scoped>
:global(.VPDoc.has-aside:has(.portal-dashboard) .content-container) {
  max-width: 960px;
}

.portal-dashboard {
  --portal-purple: #7b3ff2;
  --portal-green: #54d89a;
  --portal-text: var(--vp-c-text-1);
  --portal-muted: var(--vp-c-text-2);
  width: min(1040px, 100%);
  margin: 0 auto;
  padding: 18px 0 62px;
}

.portal-welcome {
  position: relative;
  display: grid;
  min-height: 390px;
  grid-template-columns: 1.1fr 0.9fr;
  align-items: center;
  gap: 16px;
  padding: 40px clamp(23px, 5vw, 56px);
  overflow: hidden;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 25px;
  background:
    radial-gradient(ellipse at 77% 47%, rgb(123 63 242 / 17%), transparent 48%),
    linear-gradient(135deg, var(--vp-c-bg-soft), var(--vp-c-bg));
}

.portal-welcome::before {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgb(174 144 255 / 54%) 1px, transparent 1px);
  background-position: 0 0;
  background-size: 30px 30px;
  content: "";
  mask-image: linear-gradient(90deg, transparent 38%, #000 100%);
  opacity: 0.14;
  pointer-events: none;
}

.portal-welcome-copy {
  position: relative;
  z-index: 2;
  max-width: 470px;
}

.portal-kicker,
.portal-section-kicker,
.portal-action-kicker {
  color: var(--portal-purple);
  font-size: 0.66rem;
  font-weight: 780;
  letter-spacing: 0.13em;
}

.portal-kicker {
  display: flex;
  align-items: center;
  gap: 9px;
}

.portal-kicker-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--portal-green);
  box-shadow: 0 0 13px rgb(84 216 154 / 70%);
  animation: portal-pulse 2s ease-in-out infinite;
}

.portal-welcome h1 {
  margin: 18px 0 12px;
  font-size: clamp(2.4rem, 4vw, 3.1rem);
  font-weight: 780;
  letter-spacing: -0.065em;
  line-height: 1;
}

.portal-welcome h1 span {
  color: var(--portal-purple);
}

.portal-welcome-copy > p {
  max-width: 420px;
  margin: 0;
  color: var(--portal-muted);
  font-size: 0.9rem;
  line-height: 1.75;
}

.portal-welcome-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  margin-top: 21px;
}

.portal-primary-button {
  display: inline-flex;
  min-height: 43px;
  align-items: center;
  gap: 12px;
  padding: 0 15px;
  border-radius: 10px;
  background: var(--portal-purple);
  box-shadow: 0 8px 25px rgb(123 63 242 / 27%);
  color: white;
  font-size: 0.78rem;
  font-weight: 700;
  text-decoration: none;
  transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
}

.portal-primary-button:hover {
  transform: translateY(-2px);
  background: #8d5af5;
  box-shadow: 0 12px 30px rgb(123 63 242 / 36%);
}

.portal-quiet-link {
  color: var(--portal-muted);
  font-size: 0.77rem;
  font-weight: 620;
  text-decoration: none;
}

.portal-quiet-link:hover {
  color: var(--portal-purple);
}

.portal-preview-note {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 25px;
  color: var(--vp-c-text-3);
  font-size: 0.61rem;
}

.portal-preview-spark {
  color: var(--portal-purple);
}

.portal-preview-note i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--vp-c-text-3);
}

.portal-constellation {
  position: relative;
  display: grid;
  min-height: 300px;
  place-items: center;
  perspective: 700px;
}

.portal-constellation-orbit {
  position: absolute;
  width: min(310px, 82%);
  aspect-ratio: 1;
  border: 1px solid rgb(167 124 255 / 22%);
  border-radius: 50%;
  transform: rotateX(65deg) rotateZ(-20deg);
}

.portal-orbit-one {
  animation: portal-orbit 24s linear infinite;
}

.portal-orbit-two {
  width: min(230px, 62%);
  border-style: dashed;
  border-color: rgb(84 216 154 / 26%);
  animation: portal-orbit 30s linear infinite reverse;
}

.portal-orbit-three {
  width: min(275px, 72%);
  border-style: dotted;
  border-color: rgb(167 124 255 / 18%);
  animation: portal-orbit 38s linear infinite reverse;
}

.portal-constellation-glow {
  position: absolute;
  width: 160px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: rgb(123 63 242 / 24%);
  filter: blur(40px);
  animation: portal-glow 4.5s ease-in-out infinite;
}

.portal-connectors {
  position: absolute;
  width: 190px;
  height: 126px;
  border-right: 1px solid rgb(167 124 255 / 35%);
  border-left: 1px solid rgb(167 124 255 / 35%);
  transform: rotate(38deg);
}

.portal-connectors::before,
.portal-connectors::after {
  position: absolute;
  top: 50%;
  left: -1px;
  width: 190px;
  height: 1px;
  background: rgb(167 124 255 / 35%);
  content: "";
}

.portal-connectors::after {
  transform: rotate(60deg);
}

.portal-connectors i {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #c9b0ff;
  box-shadow: 0 0 12px #a77cff;
  animation: portal-node-flow 3.8s linear infinite;
}

.portal-connectors i:nth-child(2) { animation-delay: -1.25s; }
.portal-connectors i:nth-child(3) { animation-delay: -2.5s; }

.portal-core {
  position: relative;
  z-index: 2;
  display: grid;
  width: 86px;
  height: 86px;
  align-content: center;
  justify-items: center;
  gap: 3px;
  border: 1px solid rgb(223 207 255 / 60%);
  border-radius: 25px;
  background: linear-gradient(145deg, #9868f6, #5226a9);
  box-shadow: 0 16px 46px rgb(82 38 169 / 42%), inset 0 0 25px rgb(255 255 255 / 15%);
  color: white;
  transform: rotate(-9deg);
  animation: portal-core-float 5s ease-in-out infinite;
}

.portal-core > span { font-size: 1.8rem; line-height: 1; }
.portal-core > b { font-size: 0.48rem; letter-spacing: 0.16em; }

.portal-float-node {
  position: absolute;
  z-index: 3;
  display: flex;
  min-width: 138px;
  align-items: center;
  gap: 9px;
  padding: 9px 11px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 11px;
  background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
  box-shadow: 0 12px 32px rgb(0 0 0 / 16%);
  backdrop-filter: blur(12px);
  animation: portal-float 5s ease-in-out infinite;
}

.portal-float-node > span:last-child {
  display: grid;
  gap: 3px;
}

.portal-float-node b { color: var(--portal-text); font-size: 0.65rem; }
.portal-float-node small { color: var(--portal-muted); font-size: 0.54rem; }

.portal-node-icon {
  display: grid;
  width: 29px;
  height: 29px;
  place-items: center;
  border-radius: 8px;
  background: rgb(123 63 242 / 13%);
  color: #b89aff;
  font-size: 1.05rem;
}

.portal-node-license { top: 9%; right: 0; }
.portal-node-products { bottom: 11%; left: -2%; animation-delay: -1.7s; }
.portal-node-settings { right: -3%; bottom: 13%; animation-delay: -3.2s; }

.portal-star {
  position: absolute;
  color: #c9b0ff;
  animation: portal-twinkle 2.8s ease-in-out infinite;
}

.portal-star-one { top: 15%; left: 10%; }
.portal-star-two { right: 11%; bottom: 8%; font-size: 1.3rem; animation-delay: -1s; }
.portal-star-three { bottom: 24%; left: 14%; font-size: 1.8rem; animation-delay: -2s; }

.portal-section {
  padding: 56px 1px 0;
}

.portal-section-heading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
}

.portal-section-heading h2 {
  margin: 8px 0 0;
  font-size: clamp(1.45rem, 3vw, 1.9rem);
  letter-spacing: -0.045em;
}

.portal-section-aside {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding-bottom: 5px;
  color: var(--vp-c-text-3);
  font-size: 0.65rem;
}

.portal-section-aside i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--portal-green);
  box-shadow: 0 0 9px rgb(84 216 154 / 50%);
}

.portal-action-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.portal-action-card {
  position: relative;
  display: flex;
  min-height: 270px;
  flex-direction: column;
  padding: 20px 19px 17px;
  overflow: hidden;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 17px;
  background: var(--lumen-card-bg, var(--vp-c-bg-soft));
  color: var(--portal-text);
  text-decoration: none;
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
}

.portal-action-card:hover {
  transform: translateY(-5px);
  border-color: var(--lumen-card-hover, rgb(123 63 242 / 50%));
  box-shadow: 0 18px 40px rgb(31 15 57 / 14%);
}

.portal-action-card:focus-visible,
.portal-help-card:focus-visible,
.portal-community-card:focus-visible {
  outline: 2px solid var(--portal-purple);
  outline-offset: 3px;
}

.portal-action-card-top {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: start;
  justify-content: space-between;
}

.portal-action-icon {
  display: grid;
  width: 43px;
  height: 43px;
  place-items: center;
  border: 1px solid rgb(123 63 242 / 23%);
  border-radius: 13px;
  background: rgb(123 63 242 / 11%);
  color: #aa86ff;
  font-size: 1.5rem;
  transition: transform 300ms cubic-bezier(0.2, 0.8, 0.2, 1), background 200ms ease;
}

.portal-action-card:hover .portal-action-icon {
  transform: rotate(-8deg) scale(1.08);
  background: rgb(123 63 242 / 20%);
}

.portal-action-number {
  color: var(--vp-c-text-3);
  font-size: 0.61rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.portal-action-kicker {
  position: relative;
  z-index: 1;
  margin-top: 18px;
  font-size: 0.57rem;
}

.portal-action-card h3 {
  position: relative;
  z-index: 1;
  margin: 6px 0 7px;
  font-size: 1.04rem;
  letter-spacing: -0.025em;
}

.portal-action-card p {
  position: relative;
  z-index: 1;
  margin: 0;
  color: var(--portal-muted);
  font-size: 0.72rem;
  line-height: 1.65;
}

.portal-card-footer {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 15px;
  color: var(--vp-c-brand-1);
  font-size: 0.72rem;
  font-weight: 690;
}

.portal-card-footer i {
  font-size: 0.9rem;
  font-style: normal;
  transition: transform 180ms ease;
}

.portal-action-card:hover .portal-card-footer i {
  transform: translate(3px, -2px);
}

.portal-card-orb {
  position: absolute;
  right: -44px;
  bottom: -96px;
  width: 170px;
  height: 170px;
  border: 1px solid rgb(167 124 255 / 14%);
  border-radius: 50%;
  background: radial-gradient(circle, rgb(123 63 242 / 13%), transparent 70%);
  transition: transform 500ms ease;
}

.portal-action-card:hover .portal-card-orb {
  transform: scale(1.28) translate(-9px, -7px);
}

.portal-products-card .portal-action-icon { border-color: rgb(84 216 154 / 24%); background: rgb(84 216 154 / 10%); color: #54d89a; }
.portal-products-card .portal-action-kicker { color: #54d89a; }
.portal-settings-card .portal-action-icon { border-color: rgb(255 187 101 / 24%); background: rgb(255 187 101 / 10%); color: #ffbb65; }
.portal-settings-card .portal-action-kicker { color: #e7a54e; }

.portal-bottom-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 13px;
  padding-top: 16px;
}

.portal-help-card,
.portal-community-card {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 13px;
  padding: 15px;
  border: 1px solid var(--lumen-card-border, var(--vp-c-divider));
  border-radius: 14px;
  background: var(--vp-c-bg);
  color: var(--portal-text);
  text-decoration: none;
  transition: border-color 180ms ease, transform 180ms ease;
}

.portal-help-card:hover,
.portal-community-card:hover {
  transform: translateY(-2px);
  border-color: var(--lumen-card-hover, rgb(123 63 242 / 50%));
}

.portal-help-icon,
.portal-community-mark {
  display: grid;
  width: 39px;
  height: 39px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 11px;
  background: rgb(123 63 242 / 12%);
  color: var(--vp-c-brand-1);
  font-size: 1.5rem;
}

.portal-community-mark { background: rgb(84 216 154 / 10%); color: #54d89a; font-size: 1.15rem; }

.portal-help-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.portal-help-copy small {
  color: var(--vp-c-text-3);
  font-size: 0.5rem;
  font-weight: 750;
  letter-spacing: 0.1em;
}

.portal-help-copy b {
  overflow: hidden;
  font-size: 0.73rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portal-help-copy i {
  overflow: hidden;
  color: var(--portal-muted);
  font-size: 0.6rem;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.portal-help-arrow {
  margin-left: auto;
  color: var(--vp-c-text-3);
  font-size: 0.85rem;
  transition: transform 180ms ease, color 180ms ease;
}

.portal-help-card:hover .portal-help-arrow,
.portal-community-card:hover .portal-help-arrow {
  transform: translate(2px, -2px);
  color: var(--vp-c-brand-1);
}

.portal-motion-ready .portal-reveal {
  opacity: 0;
  transform: translateY(18px);
  transition: opacity 600ms ease, transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.portal-motion-ready .portal-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}

.portal-bottom-row.portal-reveal {
  transition-delay: 100ms;
}

@keyframes portal-pulse {
  0%, 100% { opacity: 0.6; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.1); }
}

@keyframes portal-orbit {
  to { transform: rotateX(65deg) rotateZ(340deg); }
}

@keyframes portal-glow {
  0%, 100% { opacity: 0.55; transform: scale(0.9); }
  50% { opacity: 1; transform: scale(1.12); }
}

@keyframes portal-core-float {
  0%, 100% { transform: translateY(0) rotate(-9deg); }
  50% { transform: translateY(-9px) rotate(-3deg); }
}

@keyframes portal-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-7px); }
}

@keyframes portal-node-flow {
  from { transform: translateX(0); opacity: 0; }
  18%, 78% { opacity: 1; }
  to { transform: translateX(185px); opacity: 0; }
}

@keyframes portal-twinkle {
  0%, 100% { opacity: 0.4; transform: scale(0.8) rotate(0); }
  50% { opacity: 1; transform: scale(1.15) rotate(18deg); }
}

@media (max-width: 800px) {
  .portal-welcome {
    grid-template-columns: 1fr;
    gap: 0;
    padding: 33px 25px 20px;
  }

  .portal-constellation { min-height: 270px; }
  .portal-action-grid { grid-template-columns: 1fr; }
  .portal-action-card { min-height: 230px; }
}

@media (max-width: 600px) {
  .portal-dashboard { padding-top: 5px; }
  .portal-welcome { padding: 29px 20px 15px; border-radius: 20px; }
  .portal-welcome h1 { font-size: clamp(2.15rem, 10vw, 3rem); }
  .portal-welcome-copy > p { font-size: 0.83rem; }
  .portal-welcome-actions { align-items: flex-start; flex-direction: column; gap: 13px; }
  .portal-preview-note { align-items: flex-start; flex-wrap: wrap; line-height: 1.5; }
  .portal-constellation { min-height: 235px; }
  .portal-node-license { right: -3%; }
  .portal-node-products { left: -3%; }
  .portal-node-settings { right: -4%; }
  .portal-section { padding-top: 39px; }
  .portal-section-heading { align-items: flex-start; flex-direction: column; gap: 9px; }
  .portal-section-heading h2 { font-size: 1.45rem; }
  .portal-section-aside { padding: 0; }
  .portal-action-card { min-height: 225px; padding: 18px; }
  .portal-bottom-row { grid-template-columns: 1fr; }
}

@media (prefers-reduced-motion: reduce) {
  .portal-dashboard *,
  .portal-dashboard *::before,
  .portal-dashboard *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }

  .portal-motion-ready .portal-reveal {
    opacity: 1;
    transform: none;
  }
}
</style>
