<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const experienceRoot = ref<HTMLElement | null>(null)
let motionPreference: MediaQueryList | undefined
let pointerFrame = 0
let scrollFrame = 0

function syncSceneScroll() {
  cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    const hero = experienceRoot.value?.querySelector('.launch')
    if (!hero || motionPreference?.matches) return
    const bounds = hero.getBoundingClientRect()
    const progress = Math.max(0, Math.min(1, -bounds.top / bounds.height))
    experienceRoot.value?.style.setProperty('--launch-progress', String(progress))
  })
}

function syncMotionPreference() {
  const root = experienceRoot.value
  if (!root) return
  if (motionPreference?.matches) {
    cancelAnimationFrame(pointerFrame)
    root.querySelectorAll<HTMLElement>('.home-feature-card').forEach(card => {
      card.style.setProperty('--tilt-x', '0deg')
      card.style.setProperty('--tilt-y', '0deg')
    })
    root.style.setProperty('--hero-x', '0')
    root.style.setProperty('--hero-y', '0')
    root.style.setProperty('--launch-progress', '0')
  }
}

function handleHeroPointer(event: PointerEvent) {
  if (event.pointerType === 'touch' || motionPreference?.matches || document.hidden) return
  const hero = event.currentTarget
  if (!(hero instanceof HTMLElement)) return
  const bounds = hero.getBoundingClientRect()
  const x = Math.max(-0.5, Math.min(0.5, (event.clientX - bounds.left) / bounds.width - 0.5))
  const y = Math.max(-0.5, Math.min(0.5, (event.clientY - bounds.top) / bounds.height - 0.5))
  cancelAnimationFrame(pointerFrame)
  pointerFrame = requestAnimationFrame(() => {
    experienceRoot.value?.style.setProperty('--hero-x', String(x))
    experienceRoot.value?.style.setProperty('--hero-y', String(y))
  })
}

function resetHeroPointer() {
  cancelAnimationFrame(pointerFrame)
  experienceRoot.value?.style.setProperty('--hero-x', '0')
  experienceRoot.value?.style.setProperty('--hero-y', '0')
}

function handleFeatureTilt(event: PointerEvent) {
  const card = event.currentTarget
  if (!(card instanceof HTMLElement) || event.pointerType === 'touch' || motionPreference?.matches) return

  const bounds = card.getBoundingClientRect()
  const x = (event.clientX - bounds.left) / bounds.width - 0.5
  const y = (event.clientY - bounds.top) / bounds.height - 0.5
  card.style.setProperty('--tilt-x', `${-y * 6}deg`)
  card.style.setProperty('--tilt-y', `${x * 6}deg`)
  card.style.setProperty('--card-pointer-x', `${(x + 0.5) * 100}%`)
  card.style.setProperty('--card-pointer-y', `${(y + 0.5) * 100}%`)
}

function resetFeatureTilt(event: PointerEvent) {
  const card = event.currentTarget
  if (!(card instanceof HTMLElement)) return
  card.style.setProperty('--tilt-x', '0deg')
  card.style.setProperty('--tilt-y', '0deg')
}

onMounted(() => {
  const root = experienceRoot.value
  if (!root) return
  motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)')
  motionPreference.addEventListener('change', syncMotionPreference)
  window.addEventListener('scroll', syncSceneScroll, { passive: true })
  syncMotionPreference()
  syncSceneScroll()
})

onUnmounted(() => {
  motionPreference?.removeEventListener('change', syncMotionPreference)
  window.removeEventListener('scroll', syncSceneScroll)
  cancelAnimationFrame(pointerFrame)
  cancelAnimationFrame(scrollFrame)
})
</script>

<template>
  <div ref="experienceRoot" class="home-experience">
    <section class="launch" aria-labelledby="launch-title" @pointermove="handleHeroPointer" @pointerleave="resetHeroPointer">
      <div class="launch-atmosphere" aria-hidden="true">
        <div class="launch-grid" />
        <div class="launch-beam launch-beam-one" /><div class="launch-beam launch-beam-two" />
        <div class="launch-scan" />
      </div>
      <div class="launch-copy">
        <a class="launch-label" href="/plugins/"><span /> LUMEN STUDIOS <i>/</i> MINECRAFT PLUGINS <span aria-hidden="true">↗</span></a>
        <h1 id="launch-title" class="launch-title"><span class="launch-name">Lumen Studios</span><br><span class="launch-statement">Your server.<br>In good hands.</span></h1>
        <p class="launch-description">Minecraft plugins, setup guides, and support—all in one place.</p>
        <div class="launch-actions">
          <a class="home-button home-button-primary" href="/plugins/">Browse plugins <span aria-hidden="true">→</span></a>
          <a class="home-button launch-secondary" href="/account/">My account <span aria-hidden="true">↗</span></a>
        </div>
        <div class="launch-notes"><span>One license key</span><span>Plugin-by-plugin guides</span><span>Built for your community</span></div>
      </div>

      <div class="engine-stage" aria-label="Lumen plugin engine illustration">
        <div class="engine-art" aria-hidden="true">
          <div class="engine-plane" />
          <svg class="engine-wires" viewBox="0 0 520 520"><path d="M85 115H165L260 210L355 115H435M85 390H170L260 300L350 390H435" /><path class="engine-packet" d="M85 115H165L260 210L355 115H435M85 390H170L260 300L350 390H435" /></svg>
          <div class="engine-halo engine-halo-one" /><div class="engine-halo engine-halo-two" />
          <div class="engine-core">
            <div class="engine-cube">
              <span class="engine-face engine-front">L</span><span class="engine-face engine-back">L</span>
              <span class="engine-face engine-left" /><span class="engine-face engine-right" />
              <span class="engine-face engine-top" /><span class="engine-face engine-bottom" />
            </div>
          </div>
          <span class="engine-coordinate engine-coordinate-top">LUMEN / PLUGIN ENGINE</span>
          <span class="engine-coordinate engine-coordinate-bottom">BUILT FOR YOUR NEXT WORLD</span>
          <div v-for="(plugin, index) in ['DUELS', 'SHARDS', 'ECONOMY', 'AUCTION']" :key="plugin" class="engine-module" :class="`engine-module-${index}`" :style="{ '--module': index }"><i /><span>{{ plugin }}</span><b>+</b></div>
        </div>
        <a class="engine-console" href="/getting-started/">
          <span class="engine-console-label"><i /> THE NEXT CHAPTER OF YOUR SERVER <span>↗</span></span>
          <span class="engine-console-line"><b>01</b> Find your plugin.<i /></span>
          <span class="engine-console-line"><b>02</b> Make it yours.<i /></span>
          <span class="engine-console-line"><b>03</b> Build something great.<i /></span>
        </a>
      </div>
    </section>

    <nav class="home-entry home-reveal" aria-label="Choose what you need">
      <a class="home-entry-card" href="/getting-started/installation">
        <span class="home-entry-icon home-entry-icon-docs" aria-hidden="true">⌘</span>
        <span class="home-entry-copy"><strong>Set up a plugin</strong><small>Start with the installation guide</small></span>
        <span class="home-entry-arrow" aria-hidden="true">↗</span>
      </a>
      <a class="home-entry-card" href="/plugins/">
        <span class="home-entry-icon home-entry-icon-plugins" aria-hidden="true">✦</span>
        <span class="home-entry-copy"><strong>Browse plugins</strong><small>Find a plugin for your server</small></span>
        <span class="home-entry-arrow" aria-hidden="true">↗</span>
      </a>
      <a class="home-entry-card" href="/account/">
        <span class="home-entry-icon home-entry-icon-account" aria-hidden="true">◈</span>
        <span class="home-entry-copy"><strong>My account</strong><small>Licenses, downloads, and support</small></span>
        <span class="home-entry-arrow" aria-hidden="true">↗</span>
      </a>
    </nav>

    <section class="home-proof home-reveal" aria-label="Lumen Studios principles">
      <div class="home-proof-copy">
        <span class="home-eyebrow"><span class="home-pulse" /> BUILT FOR THE PEOPLE BEHIND THE SERVER</span>
        <h2>Make your server<br><span>feel like yours.</span></h2>
        <p>Discover thoughtful tools for your community, follow clear guides, and keep your Lumen products together in one place.</p>
        <div class="home-proof-actions">
          <a class="home-button home-button-primary" href="/plugins/">Find your plugin <span>↗</span></a>
          <a class="home-text-link" href="/account/">Go to customer portal <span>→</span></a>
        </div>
      </div>

      <div class="deploy-scene" aria-label="Illustration of plugin installation steps, not live server status">
        <span class="deploy-caption">FROM THE FIRST DOWNLOAD / TO YOUR NEXT WORLD</span>
        <svg class="deploy-path" viewBox="0 0 440 280" aria-hidden="true"><path d="M65 55H220V140H375V225H65" /><path class="deploy-signal" d="M65 55H220V140H375V225H65" /></svg>
        <div class="deploy-node deploy-download"><span>01 / DOWNLOAD</span><strong>Plugin.jar</strong><div class="deploy-bars" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
        <div class="deploy-node deploy-config"><span>02 / CONFIGURE</span><strong>Make it yours.</strong><code>your-server: your-rules</code></div>
        <div class="deploy-node deploy-ready"><span>03 / FIRST LAUNCH</span><strong><i aria-hidden="true" /> A world of possibility.</strong></div>
        <span class="deploy-caption deploy-caption-bottom">ILLUSTRATIVE WORKFLOW / NO LIVE TELEMETRY</span>
      </div>
    </section>

    <section class="home-feature-showcase" aria-label="What you can do with Lumen Studios">
      <div class="home-section-heading home-feature-heading home-reveal">
        <span class="home-eyebrow">DESIGNED TO WORK TOGETHER</span>
        <h2>Small details. A smoother run.</h2>
        <p>A few of the ways we help you get from “just bought it” to “it’s working.”</p>
      </div>

      <div class="home-feature-grid">
        <article class="home-feature-card home-key-card home-reveal" @pointermove="handleFeatureTilt" @pointerleave="resetFeatureTilt">
          <div class="home-feature-copy">
            <span class="home-feature-label">PRODUCT ACCESS</span>
            <h3>One key for every Lumen plugin.</h3>
            <p>Use the same Lumen license key across your plugins instead of keeping a separate key for each one.</p>
          </div>
          <div class="home-key-visual" aria-hidden="true">
            <span class="home-key-orbit" />
            <span class="home-key-orbit home-key-orbit-two" />
            <div class="home-key-token"><span>✦</span></div>
            <div class="home-key-code"><i /><i /><i /><i /><i /><i /><i /><i /></div>
            <div class="home-product-pills">
              <span><i>LA</i> Auction</span>
              <span><i>LD</i> Duels</span>
              <span><i>LS</i> Shards</span>
            </div>
          </div>
          <span class="home-card-corner" aria-hidden="true">01</span>
        </article>

        <article class="home-feature-card home-ip-card home-reveal" @pointermove="handleFeatureTilt" @pointerleave="resetFeatureTilt">
          <div class="home-feature-copy">
            <span class="home-feature-label">LICENSE CONTROLS</span>
            <h3>Room for three server IPs.</h3>
            <p>Keep track of the server addresses associated with your Lumen products from your customer space.</p>
          </div>
          <div class="home-ip-visual" aria-hidden="true">
            <div class="home-ip-slot home-ip-slot-one"><span>01</span><i /><b>Server IP</b><em>READY</em></div>
            <div class="home-ip-slot home-ip-slot-two"><span>02</span><i /><b>Server IP</b><em>READY</em></div>
            <div class="home-ip-slot home-ip-slot-three"><span>03</span><i /><b>Add address</b><em>+</em></div>
            <span class="home-ip-orbit" />
          </div>
          <span class="home-feature-badge">3 MAX</span>
          <span class="home-card-corner" aria-hidden="true">02</span>
        </article>

        <article class="home-feature-card home-server-card home-reveal" @pointermove="handleFeatureTilt" @pointerleave="resetFeatureTilt">
          <div class="home-feature-copy">
            <span class="home-feature-label">SERVER CONNECTIONS</span>
            <h3>See what’s connected.</h3>
            <p>Find your connected-server view alongside the rest of your product and license details.</p>
          </div>
          <div class="home-server-visual" aria-hidden="true">
            <div class="home-server-node home-server-node-main"><span class="home-node-cube">L</span><b>License</b><i>PREVIEW</i></div>
            <div class="home-server-link"><span /><span /><span /></div>
            <div class="home-server-nodes">
              <div class="home-server-node"><span class="home-mini-server"><i /><i /><i /></span><b>Survival</b><i>WAITING</i></div>
              <div class="home-server-node"><span class="home-mini-server"><i /><i /><i /></span><b>Lobby</b><i>WAITING</i></div>
            </div>
            <span class="home-server-sweep" />
          </div>
          <span class="home-card-corner" aria-hidden="true">03</span>
        </article>

        <article class="home-feature-card home-docs-card home-reveal" @pointermove="handleFeatureTilt" @pointerleave="resetFeatureTilt">
          <div class="home-feature-copy">
            <span class="home-feature-label">SEARCHABLE DOCS</span>
            <h3>Find the right answer, faster.</h3>
            <p>Search installation steps, commands, permissions, and configuration references in one docs space.</p>
          </div>
          <div class="home-docs-visual" aria-hidden="true">
            <div class="home-search-bar"><span class="home-search-icon">⌕</span><span class="home-search-typing">installation</span><i /></div>
            <div class="home-search-result"><span>01</span><b>Installation</b><small>Getting started</small><i>↗</i></div>
            <div class="home-search-result home-search-result-two"><span>02</span><b>First launch</b><small>Plugin guide</small><i>↗</i></div>
            <div class="home-search-spark">✦</div>
          </div>
          <span class="home-card-corner" aria-hidden="true">04</span>
        </article>
      </div>
    </section>

    <section class="home-license home-reveal" aria-labelledby="home-license-title">
      <div class="home-license-art" aria-hidden="true">
        <svg class="access-network" viewBox="0 0 400 300"><path d="M200 150L60 70M200 150L340 70M200 150V250" /><path class="access-network-charge" pathLength="1" d="M200 150L60 70M200 150L340 70M200 150V250" /></svg>
        <div class="access-vault"><svg viewBox="0 0 80 80"><path pathLength="1" d="M44 32a14 14 0 1 0-10 13l17 17h11V51H51V40Z" /><circle cx="28" cy="28" r="4" /></svg><span>ONE KEY</span></div>
        <span class="access-product access-product-one"><i>LA</i> Auction</span>
        <span class="access-product access-product-two"><i>LD</i> Duels</span>
        <span class="access-product access-product-three"><i>LS</i> Shards</span>
      </div>
      <div class="home-license-copy">
        <span class="home-eyebrow"><span class="home-pulse" /> SIMPLER LICENSES, LESS FRICTION</span>
        <h2 id="home-license-title">One key.<br><span>Every Lumen plugin.</span></h2>
        <p>Your Lumen license key is shared across your plugins, so you don’t need to keep a different key for every product.</p>
        <div class="home-license-steps">
          <div><span>01</span><p><strong>Use your Lumen key</strong><small>One key for your Lumen plugins.</small></p></div>
          <div><span>02</span><p><strong>Add it to each plugin</strong><small>Enter the same key in each plugin’s license setting.</small></p></div>
          <div><span>03</span><p><strong>Follow the plugin guide</strong><small>Check product-specific setup and activation steps.</small></p></div>
        </div>
        <a class="home-button home-button-primary" href="/getting-started/licensing">Read the license guide <span>↗</span></a>
      </div>
    </section>

    <section class="home-journey">
      <div class="home-section-heading">
        <span class="home-eyebrow">A CLEAR PATH FROM DAY ONE</span>
        <h2>From picking a plugin<br>to a server that’s ready.</h2>
        <p>Every step has a home. No hunting through unrelated pages to find what comes next.</p>
      </div>
      <div class="home-journey-rail" aria-hidden="true"><span /></div>
      <div class="home-steps">
        <a class="home-step" href="/plugins/">
          <span class="home-step-number">01</span>
          <span class="home-step-icon">⌕</span>
          <strong>Find your fit</strong>
          <span>Explore products and check server compatibility before you buy.</span>
          <span class="home-step-link">Explore plugins →</span>
        </a>
        <a class="home-step" href="/docs/">
          <span class="home-step-number">02</span>
          <span class="home-step-icon">⌘</span>
          <strong>Set it up right</strong>
          <span>Follow focused installation, configuration, and command guides.</span>
          <span class="home-step-link">Read the docs →</span>
        </a>
        <a class="home-step" href="/account/">
          <span class="home-step-number">03</span>
          <span class="home-step-icon">◈</span>
          <strong>Keep it in view</strong>
          <span>Manage product access and server connections from your portal.</span>
          <span class="home-step-link">Open your portal →</span>
        </a>
      </div>
    </section>

    <section class="home-portal home-reveal">
      <div class="home-portal-visual" aria-hidden="true">
        <div class="home-portal-window">
          <div class="home-window-bar"><i /><i /><i /><span>lumen / customer portal</span></div>
          <div class="home-window-content">
            <div class="home-window-side"><b /><i /><i /><i /></div>
            <div class="home-window-main">
              <span class="home-window-kicker">YOUR SPACE</span>
              <b class="home-window-title">Everything in one view.</b>
              <div class="home-window-stat-row"><i /><i /><i /></div>
              <div class="home-window-server"><span /><i /><i /></div>
              <div class="home-window-server home-window-server-short"><span /><i /><i /></div>
            </div>
          </div>
        </div>
      </div>
      <div class="home-portal-copy">
        <span class="home-eyebrow">YOUR CUSTOMER PORTAL</span>
        <h2>A home for your<br><span>Lumen products.</span></h2>
        <p>Keep customer tools separate from documentation. View the products connected to your account, check license details, and see which servers are using a license.</p>
        <a class="home-button home-button-secondary" href="/account/">Explore the portal <span>→</span></a>
      </div>
    </section>

    <section class="home-final home-reveal">
      <div>
        <span class="home-eyebrow">WHEN YOU NEED A HAND</span>
        <h2>Clear docs. Real support.</h2>
        <p>Start with the guide, browse common fixes, or reach out to the Lumen Studios community.</p>
      </div>
      <div class="home-final-actions">
        <a class="home-button home-button-primary" href="/docs/">Go to docs <span>↗</span></a>
        <a class="home-button home-button-quiet" href="https://discord.gg/lumenstudios" target="_blank" rel="noreferrer">Visit Discord <span>↗</span></a>
      </div>
      <div class="home-final-glow" aria-hidden="true" />
    </section>
  </div>
</template>

<style scoped>
.home-experience {
  --home-purple: #7b3ff2;
  --home-ink: var(--vp-c-text-1);
  --home-muted: var(--vp-c-text-2);
  width: min(1200px, 100%);
  margin: 0 auto 80px;
  color: var(--home-ink);
}

.launch {
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(32px, 5vw, 76px);
  align-items: center;
  padding: clamp(48px, 7vw, 100px) 0 64px;
}

.launch-copy { position: relative; z-index: 1; }
.launch-atmosphere { position: absolute; inset: -40px -32px; overflow: hidden; z-index: -1; pointer-events: none; }
.launch-grid {
  position: absolute; inset: 0;
  background-image: linear-gradient(rgb(149 108 255 / 10%) 1px, transparent 1px), linear-gradient(90deg, rgb(149 108 255 / 10%) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse at 65% 44%, black, transparent 68%);
  opacity: 0.55;
}
.launch-beam { position: absolute; width: 80%; height: 170px; background: linear-gradient(90deg, transparent, #9c57ff25, #cab0ff35, transparent); transform: rotate(-35deg); filter: blur(28px); animation: engine-light-pass 14s ease-in-out infinite; }
.launch-beam-one { top: 8%; left: 15%; }
.launch-beam-two { bottom: 10%; right: 0; animation-delay: -7s; opacity: .5; }
.launch-scan { position: absolute; inset: 0; background: linear-gradient(transparent, #b990ff12, transparent); height: 100px; animation: engine-scan 9s cubic-bezier(.45,0,.55,1) infinite; }
.launch-title .launch-name { display: inline-block; background: none; -webkit-text-fill-color: currentColor; animation: engine-type-reveal 1000ms cubic-bezier(.16,1,.3,1) both; }
.launch-title .launch-statement {
  display: inline-block; background-size: 200% 100%;
  background-image: linear-gradient(105deg, #e5d5ff, #b188ff 35%, #8252ed 60%, #dfcaff);
  animation: engine-type-reveal 1200ms cubic-bezier(.16,1,.3,1) 140ms both;
}
.launch-description { animation: engine-copy-reveal 900ms cubic-bezier(.16,1,.3,1) 300ms both; }
.launch-actions { animation: engine-copy-reveal 900ms cubic-bezier(.16,1,.3,1) 420ms both; }
.engine-stage { position: relative; min-width: 0; perspective: 1000px; animation: engine-stage-enter 1300ms cubic-bezier(.16,1,.3,1) 160ms both; }
.engine-art { position: relative; aspect-ratio: 1; transform-style: preserve-3d; transform: rotateX(calc(var(--hero-y,0) * -10deg)) rotateY(calc(var(--hero-x,0) * 12deg)); transition: transform 500ms cubic-bezier(.16,1,.3,1); }
.engine-plane { position: absolute; inset: 10%; border: 1px solid #a77bff30; background: linear-gradient(90deg,#a77bff12 1px,transparent 1px),linear-gradient(#a77bff12 1px,transparent 1px); background-size: 28px 28px; transform: rotateX(65deg) rotateZ(-35deg); border-radius: 30px; box-shadow: 0 0 90px #7b3ff220; }
.engine-core { position: absolute; left: 50%; top: 45%; width: 124px; height: 124px; margin: -62px; transform-style: preserve-3d; transform: rotateX(-24deg) rotateY(-35deg); }
.engine-cube { width: 100%; height: 100%; transform-style: preserve-3d; animation: engine-assemble 12s cubic-bezier(.65,0,.35,1) infinite; }
.engine-face { position: absolute; inset: 0; display: grid; place-items: center; border: 1px solid #c6a5ffb0; background: linear-gradient(145deg,#a175faee,#5720b9e8); box-shadow: inset 0 0 35px #b897ff50; backface-visibility: hidden; color: white; font-size: 76px; font-weight: 900; font-style: italic; text-shadow: 0 0 24px #fff6; }
.engine-front { transform: translateZ(calc(62px + var(--launch-progress,0) * 40px)); }
.engine-back { transform: rotateY(180deg) translateZ(calc(62px + var(--launch-progress,0) * 40px)); }
.engine-left { transform: rotateY(-90deg) translateZ(calc(62px + var(--launch-progress,0) * 40px)); }
.engine-right { transform: rotateY(90deg) translateZ(calc(62px + var(--launch-progress,0) * 40px)); background: linear-gradient(145deg,#8547e8,#34105e); }
.engine-top { transform: rotateX(90deg) translateZ(calc(62px + var(--launch-progress,0) * 40px)); background: linear-gradient(145deg,#ddc6ff,#9764f0); }
.engine-bottom { transform: rotateX(-90deg) translateZ(calc(62px + var(--launch-progress,0) * 40px)); }
.engine-halo { position: absolute; inset: 15%; border: 1px solid #a77bff50; border-radius: 50%; transform: rotateX(65deg) rotateZ(-25deg); }
.engine-halo::after { content: ""; position: absolute; inset: -2px; border-radius: inherit; border: 2px solid transparent; border-top-color: #d7bdff; border-left-color: #a17bff70; animation: engine-orbit-trace 8s linear infinite; }
.engine-halo-two { inset: 8%; transform: rotateY(60deg) rotateZ(35deg); opacity: .55; }
.engine-halo-two::after { animation-direction: reverse; animation-duration: 12s; }
.engine-wires { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke: #a77bff35; stroke-width: 1; }
.engine-packet { stroke: #bd98ff; stroke-width: 2; stroke-dasharray: 30 490; animation: engine-wire-stream 5s linear infinite; }
.engine-coordinate { position: absolute; left: 10%; font: 8px/1.5 monospace; color: var(--vp-c-text-2); letter-spacing: .15em; }
.engine-coordinate-top { top: 2%; }
.engine-coordinate-bottom { bottom: 8%; }
.engine-module { position: absolute; display: flex; gap: 9px; align-items: center; padding: 12px; border: 1px solid #a77bff50; border-radius: 10px; background: var(--vp-c-bg-elv); box-shadow: 0 10px 25px #0002; font: 9px monospace; color: var(--vp-c-brand-1); animation: engine-module-dock 12s cubic-bezier(.65,0,.35,1) infinite; animation-delay: calc(var(--module) * -3s); }
.engine-module i { width: 6px; height: 6px; background: currentColor; box-shadow: 0 0 12px currentColor; }
.engine-module b { margin-left: 12px; opacity: .5; }
.engine-module-0 { left: 2%; top: 16%; }
.engine-module-1 { right: 0; top: 17%; }
.engine-module-2 { left: 0; bottom: 22%; }
.engine-module-3 { right: 0; bottom: 23%; }
.engine-console { position: relative; display: grid; gap: 9px; padding: 20px; margin: -12% 4% 0; border: 1px solid #a77bff45; border-radius: 16px; background: var(--vp-c-bg-elv); box-shadow: 0 25px 60px #0002; color: var(--vp-c-text-1); transform: rotateX(4deg); transition: border-color 250ms, transform 400ms; }
.engine-console:hover { border-color: var(--vp-c-brand-1); transform: rotateX(0) translateY(-4px); }
.engine-console-label { display: flex; gap: 8px; align-items: center; font: 8px/1.5 monospace; letter-spacing: .08em; color: var(--vp-c-text-2); margin-bottom: 8px; }
.engine-console-label > span { margin-left: auto; }
.engine-console-label > i { width: 5px; height: 5px; background: #a77bff; }
.engine-console-line { display: flex; gap: 12px; align-items: center; font-size: 12px; animation: engine-console-step 9s ease infinite; }
.engine-console-line:nth-child(3) { animation-delay: -6s; }
.engine-console-line:nth-child(4) { animation-delay: -3s; }
.engine-console-line b { font: 9px monospace; color: var(--vp-c-brand-1); }
.engine-console-line i { margin-left: auto; width: 36px; height: 3px; background: var(--vp-c-brand-1); transform-origin: left; animation: engine-buffer 9s ease infinite; }
.engine-console-line:nth-child(3) i { animation-delay: -6s; }
.engine-console-line:nth-child(4) i { animation-delay: -3s; }
.deploy-scene { position: relative; height: 360px; min-width: 0; isolation: isolate; }
.deploy-caption { position: absolute; top: 6px; left: 5%; font: 7px monospace; letter-spacing: .09em; color: var(--vp-c-text-2); }
.deploy-caption-bottom { top: auto; bottom: 8px; }
.deploy-path { position: absolute; inset: 30px 0; width: 100%; height: calc(100% - 60px); fill: none; stroke: #a77bff35; stroke-width: 1; }
.deploy-signal { stroke: #b990ff; stroke-width: 3; stroke-dasharray: 50 800; animation: engine-deploy-stream 8s linear infinite; }
.deploy-node { position: absolute; display: grid; gap: 12px; padding: 18px; border: 1px solid #a77bff50; border-radius: 12px; background: var(--vp-c-bg-elv); box-shadow: 0 12px 30px #0002; animation: engine-deploy-node 8s cubic-bezier(.65,0,.35,1) infinite; }
.deploy-node > span { font: 8px monospace; letter-spacing: .12em; color: var(--vp-c-brand-1); }
.deploy-node strong { font-size: 15px; }
.deploy-download { left: 0; top: 38px; width: 47%; }
.deploy-config { right: 0; top: 130px; width: 59%; animation-delay: -5.3s; }
.deploy-config code { font-size: 9px; background: none; }
.deploy-ready { left: 0; bottom: 40px; width: 70%; animation-delay: -2.6s; }
.deploy-ready strong { display: flex; align-items: center; gap: 10px; }
.deploy-ready i { width: 7px; height: 7px; border-radius: 50%; background: #50d6a0; box-shadow: 0 0 14px #50d6a0; }
.deploy-bars { display: flex; gap: 4px; height: 6px; }
.deploy-bars i { flex: 1; background: var(--vp-c-brand-1); animation: engine-download 8s ease infinite; }
.deploy-bars i:nth-child(2n) { animation-delay: 120ms; }
.deploy-bars i:nth-child(3n) { animation-delay: 240ms; }
.home-button span, .home-entry-arrow { transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1); }
.home-button:hover span, .home-entry-card:hover .home-entry-arrow { transform: translate(3px, -2px); }
.home-feature-card::before {
  content: ""; position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background: radial-gradient(300px circle at var(--card-pointer-x, 50%) var(--card-pointer-y, 50%), rgb(167 116 255 / 17%), transparent 75%);
  opacity: 0; transition: opacity 280ms ease;
}
.home-feature-card:hover::before { opacity: 1; }

@keyframes engine-type-reveal { from { opacity: 0; clip-path: inset(0 0 100% 0); transform: translateY(45px) rotateX(18deg); } to { opacity: 1; clip-path: inset(0); transform: none; } }
@keyframes engine-copy-reveal { from { opacity: 0; transform: translateY(24px); filter: blur(4px); } to { opacity: 1; transform: none; filter: blur(0); } }
@keyframes engine-stage-enter { from { opacity: 0; transform: rotateY(-18deg) translateY(45px) scale(.86); } to { opacity: 1; transform: none; } }
@keyframes engine-assemble { 0%,18%,100% { transform: rotateY(0) scale(1); } 38%,52% { transform: rotateY(90deg) scale(.85); } 72%,86% { transform: rotateY(180deg) scale(1); } }
@keyframes engine-module-dock { 0%,18%,100% { translate: 0 0; opacity: 1; } 35%,52% { translate: 0 -14px; opacity: .5; } 72%,86% { translate: 0 5px; opacity: 1; } }
@keyframes engine-orbit-trace { to { transform: rotate(360deg); } }
@keyframes engine-wire-stream { to { stroke-dashoffset: -520; } }
@keyframes engine-deploy-stream { to { stroke-dashoffset: -850; } }
@keyframes engine-scan { 0%,100% { translate: 0 -100px; opacity: 0; } 15%,85% { opacity: 1; } 90% { translate: 0 700px; opacity: 0; } }
@keyframes engine-light-pass { 0%,100% { translate: -10% 0; opacity: .3; } 50% { translate: 15% -60px; opacity: 1; } }
@keyframes engine-console-step { 0%,30%,100% { opacity: 1; translate: 3px 0; } 40%,90% { opacity: .45; translate: 0 0; } }
@keyframes engine-buffer { 0%,100% { transform: scaleX(.15); } 30%,40% { transform: scaleX(1); } 85% { transform: scaleX(.15); } }
@keyframes engine-deploy-node { 0%,25%,100% { translate: 0 0; border-color: #b990ff; } 40%,85% { translate: 0 6px; border-color: #a77bff30; } }
@keyframes engine-download { 0%,100% { opacity: .2; transform: scaleX(.3); } 22%,65% { opacity: 1; transform: scaleX(1); } }

@media (max-width: 720px) {
  .engine-art { transform: none; overflow: clip; }
  .launch-atmosphere { inset: -20px 0; }
  .engine-stage { max-width: 520px; width: 100%; margin: auto; }
  .engine-module { font-size: 8px; padding: 9px; gap: 6px; }
  .engine-coordinate { font-size: 7px; }
}

.launch-label {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: var(--vp-c-text-2);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.1em;
}

.launch-label > span:first-child,
.workspace-footer i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #a986ff;
  box-shadow: 0 0 14px #956cff;
}

.launch-label i { color: var(--vp-c-divider); font-style: normal; }

.launch .launch-title {
  margin: 26px 0 24px;
  color: var(--vp-c-text-1);
  font-size: clamp(44px, 4.7vw, 68px);
  font-weight: 750;
  line-height: 1.03;
  letter-spacing: -0.065em;
}

.launch-title > span {
  background: linear-gradient(110deg, #bc9cff, #956cff 55%, #7b3ff2);
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.launch-description {
  max-width: 430px;
  margin: 0;
  color: var(--home-muted);
  font-size: 17px;
  line-height: 1.8;
}

.launch-actions { display: flex; flex-wrap: wrap; gap: 12px; margin: 28px 0 22px; }
.launch .home-button { min-height: 46px; padding: 11px 17px; border-radius: 9px; font-size: 13px; }
.launch-secondary { border: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft); color: var(--home-ink); }
.launch-notes { display: flex; flex-wrap: wrap; gap: 8px 18px; color: var(--home-muted); font-size: 10px; }
.launch-notes span::before { content: "✓"; margin-right: 5px; color: var(--vp-c-brand-1); }

@media (max-width: 960px) {
  .launch { gap: 32px; }
  .launch .launch-title { font-size: 46px; }
}

@media (max-width: 720px) {
  .launch { grid-template-columns: 1fr; padding-top: 36px; gap: 36px; }
  .launch-copy { text-align: center; }
  .launch .launch-title { font-size: clamp(40px, 10vw, 64px); }
  .launch-description { margin-inline: auto; font-size: 16px; }
  .launch-actions, .launch-notes { justify-content: center; }
}

.launch a:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 4px; }

.home-experience a {
  text-decoration: none;
}

.home-entry {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 0 0 22px;
}

.home-entry-card {
  display: grid;
  min-width: 0;
  grid-template-columns: 42px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 15px;
  background: linear-gradient(145deg, var(--vp-c-bg-soft), var(--vp-c-bg));
  color: var(--home-ink);
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease;
}

.home-entry-card:hover {
  transform: translateY(-3px);
  border-color: rgb(123 63 242 / 52%);
  box-shadow: 0 12px 30px rgb(46 22 89 / 12%);
}

.home-entry-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid rgb(123 63 242 / 24%);
  border-radius: 13px;
  background: rgb(123 63 242 / 10%);
  color: var(--home-purple);
  font-size: 1.15rem;
}

.home-entry-icon-plugins {
  border-color: rgb(84 216 154 / 24%);
  background: rgb(84 216 154 / 10%);
  color: #36b980;
}

.home-entry-icon-account {
  border-color: rgb(88 167 255 / 24%);
  background: rgb(88 167 255 / 10%);
  color: #5599e7;
}

.home-entry-copy {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.home-entry-copy strong {
  overflow: hidden;
  font-size: 0.83rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-entry-copy small {
  overflow: hidden;
  color: var(--home-muted);
  font-size: 0.69rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-entry-arrow {
  color: var(--vp-c-text-3);
  font-size: 0.9rem;
  transition: transform 180ms ease, color 180ms ease;
}

.home-entry-card:hover .home-entry-arrow {
  transform: translate(2px, -2px);
  color: var(--home-purple);
}

.home-proof,
.home-portal {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 1fr;
  align-items: center;
  min-height: 450px;
  gap: 30px;
  padding: 50px clamp(22px, 5vw, 64px);
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 26px;
  background:
    radial-gradient(ellipse at 78% 50%, rgb(123 63 242 / 13%), transparent 48%),
    linear-gradient(135deg, var(--vp-c-bg-soft), var(--vp-c-bg));
}

.home-license {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr);
  align-items: center;
  gap: clamp(24px, 5vw, 70px);
  margin: 48px 0 0;
  padding: clamp(28px, 5vw, 58px);
  overflow: hidden;
  border: 1px solid rgb(123 63 242 / 24%);
  border-radius: 24px;
  background:
    radial-gradient(ellipse at 18% 52%, rgb(123 63 242 / 15%), transparent 43%),
    linear-gradient(135deg, var(--vp-c-bg-soft), var(--vp-c-bg));
}

.home-license::after {
  position: absolute;
  right: -100px;
  bottom: -180px;
  width: 380px;
  height: 300px;
  border-radius: 50%;
  background: rgb(123 63 242 / 10%);
  content: "";
  filter: blur(80px);
  pointer-events: none;
}

.home-license-art {
  position: relative;
  display: grid;
  min-height: 330px;
  place-items: center;
  perspective: 700px;
}

.home-license-halo {
  position: absolute;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(123 63 242 / 30%), rgb(123 63 242 / 8%) 46%, transparent 72%);
  filter: blur(5px);
  animation: home-breathe 4.5s ease-in-out infinite;
}

.home-license-orbit {
  position: absolute;
  width: 255px;
  height: 128px;
  border: 1px solid rgb(169 134 255 / 28%);
  border-radius: 50%;
  transform: rotate(-24deg);
  animation: home-key-orbit 16s linear infinite;
}

.home-license-orbit-two {
  width: 300px;
  height: 178px;
  border-color: rgb(84 216 154 / 22%);
  border-style: dashed;
  animation-direction: reverse;
  animation-duration: 24s;
}

.home-license-token {
  position: relative;
  z-index: 1;
  display: grid;
  width: 116px;
  height: 116px;
  align-content: center;
  justify-items: center;
  gap: 5px;
  border: 1px solid rgb(224 210 255 / 68%);
  border-radius: 32px;
  background: linear-gradient(145deg, #a77cff, #6731c4 78%);
  box-shadow: 0 0 48px rgb(123 63 242 / 48%), inset 0 0 25px rgb(255 255 255 / 16%);
  color: #fff;
  transform: rotate(-8deg);
  animation: home-token-float 4s ease-in-out infinite;
}

.home-license-token > span {
  font-size: 2.8rem;
  line-height: 1;
  text-shadow: 0 0 20px rgb(255 255 255 / 56%);
}

.home-license-token small {
  font-size: 0.56rem;
  font-weight: 800;
  letter-spacing: 0.15em;
}

.home-license-chip {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 11px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
  box-shadow: 0 10px 25px rgb(0 0 0 / 12%);
  color: var(--home-ink);
  font-size: 0.65rem;
  font-weight: 650;
  backdrop-filter: blur(10px);
  animation: home-card-float 5s ease-in-out infinite;
}

.home-license-chip i {
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  border-radius: 7px;
  background: rgb(123 63 242 / 15%);
  color: #a986ff;
  font-size: 0.55rem;
  font-style: normal;
  font-weight: 800;
}

.home-license-chip-one { top: 17%; left: 1%; }
.home-license-chip-two { top: 24%; right: 0; animation-delay: -1.7s; }
.home-license-chip-three { bottom: 13%; left: 12%; animation-delay: -3.2s; }

.home-license-spark {
  position: absolute;
  color: #c3a9ff;
  animation: home-sparkle 3s ease-in-out infinite;
}

.home-license-spark-one { top: 13%; right: 18%; font-size: 1.4rem; }
.home-license-spark-two { bottom: 17%; right: 13%; font-size: 1.1rem; animation-delay: -1.4s; }

.home-license-copy {
  position: relative;
  z-index: 1;
}

.home-license-copy h2 {
  margin: 16px 0 12px;
  font-size: clamp(2.1rem, 4vw, 3.2rem);
  font-weight: 740;
  letter-spacing: -0.055em;
  line-height: 1.06;
}

.home-license-copy h2 span {
  color: var(--home-purple);
}

.home-license-copy > p {
  max-width: 510px;
  margin: 0;
  color: var(--home-muted);
  font-size: 0.92rem;
  line-height: 1.7;
}

.home-license-steps {
  display: grid;
  gap: 13px;
  margin: 24px 0;
}

.home-license-steps > div {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.home-license-steps > div > span {
  display: grid;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(123 63 242 / 25%);
  border-radius: 8px;
  background: rgb(123 63 242 / 10%);
  color: var(--home-purple);
  font-size: 0.58rem;
  font-weight: 800;
}

.home-license-steps p {
  display: grid;
  gap: 3px;
  margin: 0;
}

.home-license-steps strong {
  font-size: 0.76rem;
}

.home-license-steps small {
  color: var(--home-muted);
  font-size: 0.71rem;
  line-height: 1.5;
}

.home-license-copy .home-button {
  width: fit-content;
}

.home-proof-copy,
.home-portal-copy {
  position: relative;
  z-index: 2;
}

.home-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  color: var(--home-purple);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.home-pulse,
.home-online-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #54d89a;
  box-shadow: 0 0 13px rgb(84 216 154 / 65%);
  animation: home-pulse 2s ease-in-out infinite;
}

.home-proof h2,
.home-section-heading h2,
.home-portal-copy h2,
.home-final h2 {
  margin: 19px 0 14px;
  font-size: clamp(2rem, 4vw, 3.25rem);
  font-weight: 740;
  letter-spacing: -0.055em;
  line-height: 1.08;
}

.home-proof h2 span,
.home-portal-copy h2 span {
  color: var(--home-purple);
}

.home-proof-copy > p,
.home-section-heading > p,
.home-portal-copy > p,
.home-final p {
  max-width: 470px;
  color: var(--home-muted);
  font-size: 0.96rem;
  line-height: 1.75;
}

.home-proof-actions,
.home-final-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 18px;
  margin-top: 25px;
}

.home-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 10px;
  font-size: 0.82rem;
  font-weight: 680;
  transition: transform 160ms ease, border-color 160ms ease, background 160ms ease;
}

.home-button:hover {
  transform: translateY(-2px);
}

.home-button-primary {
  background: var(--home-purple);
  color: white;
  box-shadow: 0 7px 22px rgb(123 63 242 / 24%);
}

.home-button-primary:hover {
  background: #8d5af5;
}

.home-button-secondary,
.home-button-quiet {
  border-color: var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--home-ink);
}

.home-button-secondary:hover,
.home-button-quiet:hover {
  border-color: var(--home-purple);
}

.home-text-link {
  color: var(--home-muted);
  font-size: 0.82rem;
  font-weight: 600;
}

.home-text-link:hover,
.home-step:hover .home-step-link {
  color: var(--home-purple);
}

.home-orbit-scene {
  position: relative;
  display: grid;
  min-height: 340px;
  place-items: center;
  perspective: 700px;
}

.home-orbit {
  position: absolute;
  width: min(310px, 75vw);
  aspect-ratio: 1;
  border: 1px solid rgb(143 103 240 / 22%);
  border-radius: 50%;
  transform: rotateX(68deg) rotateZ(-20deg);
}

.home-orbit-outer {
  animation: home-orbit 22s linear infinite;
}

.home-orbit-inner {
  width: min(230px, 58vw);
  border-style: dashed;
  opacity: 0.65;
  animation: home-orbit 28s linear infinite reverse;
}

.home-glow {
  position: absolute;
  width: 210px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: radial-gradient(circle, rgb(123 63 242 / 25%), transparent 68%);
  filter: blur(7px);
  animation: home-breathe 4s ease-in-out infinite;
}

.home-cube {
  position: relative;
  z-index: 2;
  width: 112px;
  height: 112px;
  transform: rotate(-28deg) skewY(0deg);
  animation: home-cube-float 5s ease-in-out infinite;
}

.home-cube-face {
  position: absolute;
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  border: 1px solid rgb(203 180 255 / 55%);
  background: linear-gradient(145deg, #9f75fa, #6932ce);
  box-shadow: inset 0 0 30px rgb(255 255 255 / 12%), 0 18px 50px rgb(63 31 130 / 25%);
}

.home-cube-front {
  transform: translateZ(55px);
  color: white;
  font-size: 3.4rem;
}

.home-cube-side {
  background: linear-gradient(145deg, #48228e, #321564);
  transform: rotateY(90deg) translateZ(55px);
}

.home-cube-top {
  background: linear-gradient(145deg, #c0a3ff, #8b5ce5);
  transform: rotateX(90deg) translateZ(55px);
}

.home-float-card {
  position: absolute;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 13px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: color-mix(in srgb, var(--vp-c-bg) 88%, transparent);
  box-shadow: 0 12px 35px rgb(0 0 0 / 14%);
  backdrop-filter: blur(12px);
  color: var(--home-muted);
  font-size: 0.68rem;
  animation: home-card-float 5s ease-in-out infinite;
}

.home-float-card-top {
  top: 28px;
  right: 3%;
  display: grid;
  grid-template-columns: 8px 1fr;
  column-gap: 8px;
}

.home-float-card-top strong {
  grid-column: 2;
  color: var(--home-ink);
  font-size: 0.78rem;
}

.home-card-dot {
  width: 7px;
  height: 7px;
  align-self: center;
  border-radius: 2px;
  background: #a984ff;
}

.home-float-card-bottom {
  right: 0;
  bottom: 30px;
  animation-delay: -2.4s;
}

.home-float-card-bottom strong,
.home-float-card-bottom small {
  display: block;
}

.home-float-card-bottom strong {
  color: var(--home-ink);
  font-size: 0.72rem;
}

.home-float-card-bottom small {
  margin-top: 3px;
  font-size: 0.61rem;
}

.home-server-icon {
  display: grid;
  width: 28px;
  gap: 3px;
  padding: 5px;
  border-radius: 7px;
  background: rgb(84 216 154 / 12%);
}

.home-server-icon i {
  height: 3px;
  border-radius: 4px;
  background: #54d89a;
}

.home-online-dot {
  width: 6px;
  height: 6px;
  margin-left: 6px;
}

.home-spark {
  position: absolute;
  color: #b99bff;
  animation: home-sparkle 3s ease-in-out infinite;
}

.home-spark-one { top: 68px; left: 16%; font-size: 18px; }
.home-spark-two { top: 44%; right: 7%; font-size: 36px; animation-delay: -1s; }
.home-spark-three { bottom: 65px; left: 22%; font-size: 22px; animation-delay: -2s; }

.home-orbit-dash {
  width: min(270px, 67vw);
  border-color: rgb(84 216 154 / 28%);
  border-style: dotted;
  animation: home-orbit 36s linear infinite reverse;
}

.home-energy-line {
  position: absolute;
  z-index: 1;
  width: 178px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgb(160 123 255 / 55%), transparent);
  transform: rotate(-32deg);
}

.home-energy-line i {
  position: absolute;
  top: -2px;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #d3bfff;
  box-shadow: 0 0 12px #a77cff;
  animation: home-energy-flow 3s linear infinite;
}

.home-energy-line i:nth-child(2) { animation-delay: -1s; }
.home-energy-line i:nth-child(3) { animation-delay: -2s; }

.home-feature-showcase {
  padding: 92px 8px 36px;
}

.home-feature-heading {
  margin-bottom: 38px;
}

.home-feature-heading h2 {
  margin-bottom: 12px;
  font-size: clamp(1.9rem, 3.8vw, 2.7rem);
}

.home-feature-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 17px;
}

.home-feature-card {
  --tilt-x: 0deg;
  --tilt-y: 0deg;
  position: relative;
  display: grid;
  min-width: 0;
  min-height: 390px;
  grid-template-rows: auto 1fr;
  padding: 25px 26px 20px;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 20px;
  background:
    radial-gradient(ellipse at 82% 86%, rgb(123 63 242 / 11%), transparent 58%),
    linear-gradient(145deg, var(--vp-c-bg-soft), var(--vp-c-bg));
  transform: perspective(900px) rotateX(var(--tilt-x)) rotateY(var(--tilt-y));
  transform-style: preserve-3d;
  transition: transform 220ms ease, border-color 220ms ease, box-shadow 220ms ease;
}

.home-feature-card:hover {
  border-color: rgb(123 63 242 / 55%);
  box-shadow: 0 20px 50px rgb(34 17 70 / 18%);
}

.home-feature-copy {
  position: relative;
  z-index: 2;
  max-width: 330px;
}

.home-feature-label {
  color: var(--home-purple);
  font-size: 0.62rem;
  font-weight: 750;
  letter-spacing: 0.12em;
}

.home-feature-copy h3 {
  margin: 10px 0 7px;
  font-size: 1.18rem;
  letter-spacing: -0.035em;
}

.home-feature-copy p {
  margin: 0;
  color: var(--home-muted);
  font-size: 0.78rem;
  line-height: 1.6;
}

.home-card-corner {
  position: absolute;
  right: 22px;
  bottom: 20px;
  color: var(--vp-c-text-3);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.home-feature-badge {
  position: absolute;
  top: 20px;
  right: 20px;
  padding: 5px 8px;
  border: 1px solid rgb(84 216 154 / 24%);
  border-radius: 20px;
  background: rgb(84 216 154 / 8%);
  color: #54d89a;
  font-size: 0.57rem;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.home-key-visual,
.home-ip-visual,
.home-server-visual,
.home-docs-visual {
  position: relative;
  align-self: end;
  width: min(100%, 390px);
  height: 205px;
  margin: 14px auto 0;
}

.home-key-visual {
  display: grid;
  place-items: center;
  perspective: 700px;
}

.home-key-orbit {
  position: absolute;
  width: 184px;
  height: 82px;
  border: 1px solid rgb(167 124 255 / 35%);
  border-radius: 50%;
  transform: rotate(-20deg);
  animation: access-ring-charge 9s cubic-bezier(.65,0,.35,1) infinite;
}

.home-key-orbit-two {
  width: 225px;
  height: 108px;
  border-color: rgb(84 216 154 / 25%);
  transform: rotate(28deg);
  animation-direction: reverse;
}

.home-key-token {
  position: absolute;
  z-index: 1;
  display: grid;
  width: 69px;
  height: 69px;
  place-items: center;
  border: 1px solid rgb(217 198 255 / 70%);
  border-radius: 19px;
  background: linear-gradient(145deg, #a77cff, #5d2db6);
  box-shadow: 0 14px 40px rgb(123 63 242 / 38%), inset 0 0 20px rgb(255 255 255 / 18%);
  color: white;
  font-size: 2rem;
  transform: rotate(-12deg);
  animation: access-key-turn 9s cubic-bezier(.65,0,.35,1) infinite;
}

.home-key-code {
  position: absolute;
  top: 39px;
  right: 8%;
  display: flex;
  gap: 4px;
  padding: 9px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vp-c-bg) 85%, transparent);
  transform: rotate(7deg);
}

.home-key-code i {
  width: 4px;
  height: 13px;
  border-radius: 3px;
  background: #9f75f7;
  animation: access-code-unlock 9s ease infinite;
}

.home-key-code i:nth-child(2n) { height: 8px; animation-delay: -0.5s; }
.home-key-code i:nth-child(3n) { height: 11px; animation-delay: -1s; }

.home-product-pills {
  position: absolute;
  bottom: 19px;
  display: flex;
  gap: 6px;
}

.home-product-pills span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  background: var(--vp-c-bg);
  color: var(--home-muted);
  font-size: 0.56rem;
  animation: access-product-unlock 9s ease infinite;
}

.home-product-pills span:nth-child(2) { animation-delay: -6s; }
.home-product-pills span:nth-child(3) { animation-delay: -3s; }

.home-product-pills i {
  color: var(--home-purple);
  font-size: 0.53rem;
  font-style: normal;
  font-weight: 800;
}

.home-ip-visual {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 7px 17px;
}

.home-ip-slot {
  position: relative;
  z-index: 1;
  display: grid;
  height: 43px;
  grid-template-columns: 25px 9px 1fr auto;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: color-mix(in srgb, var(--vp-c-bg) 92%, transparent);
  color: var(--home-muted);
  font-size: 0.62rem;
  box-shadow: 0 6px 18px rgb(0 0 0 / 8%);
  animation: access-server-register 9s cubic-bezier(.16,1,.3,1) infinite;
}

.home-ip-slot-two { animation-delay: -6s; }
.home-ip-slot-three { animation-delay: -3s; }
.home-ip-slot > span { color: var(--vp-c-text-3); font-size: 0.56rem; }
.home-ip-slot > i { width: 6px; height: 6px; border-radius: 50%; background: #54d89a; box-shadow: 0 0 9px rgb(84 216 154 / 60%); }
.home-ip-slot > b { font-weight: 600; }
.home-ip-slot > em { color: #54d89a; font-size: 0.49rem; font-style: normal; font-weight: 750; letter-spacing: 0.06em; }
.home-ip-slot-three > i { background: var(--vp-c-divider); box-shadow: none; }
.home-ip-slot-three > em { color: var(--home-purple); font-size: 0.9rem; }

.home-ip-orbit {
  position: absolute;
  right: 9px;
  width: 170px;
  height: 120px;
  border: 1px solid rgb(123 63 242 / 16%);
  border-radius: 50%;
  transform: rotate(-32deg);
  animation: access-ring-charge 9s cubic-bezier(.65,0,.35,1) infinite;
}

.home-server-visual {
  display: grid;
  grid-template-columns: 0.85fr 30px 1fr;
  align-items: center;
  padding: 14px 4px;
}

.home-server-node {
  position: relative;
  z-index: 1;
  display: grid;
  min-width: 0;
  min-height: 54px;
  grid-template-columns: 24px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 9px;
  background: var(--vp-c-bg);
  box-shadow: 0 8px 18px rgb(0 0 0 / 8%);
  font-size: 0.55rem;
}

.home-server-node-main { grid-template-columns: 25px 1fr; }
.home-server-node-main > i { grid-column: 2; }
.home-node-cube {
  display: grid;
  width: 23px;
  height: 23px;
  grid-row: span 2;
  place-items: center;
  border-radius: 7px;
  background: rgb(123 63 242 / 17%);
  color: #a77cff;
  font-weight: 800;
}

.home-server-node b { overflow: hidden; color: var(--home-ink); font-size: 0.56rem; text-overflow: ellipsis; }
.home-server-node > i { color: var(--home-purple); font-size: 0.43rem; font-style: normal; font-weight: 750; letter-spacing: 0.04em; }
.home-mini-server { display: grid; width: 20px; gap: 2px; padding: 4px; border-radius: 5px; background: rgb(123 63 242 / 12%); }
.home-mini-server i { height: 3px; border-radius: 4px; background: #9567f3; }
.home-mini-server i:last-child { width: 65%; }

.home-server-link {
  position: relative;
  height: 1px;
  overflow: hidden;
  background: rgb(123 63 242 / 30%);
}

.home-server-link span {
  position: absolute;
  top: -2px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #a77cff;
  box-shadow: 0 0 8px #a77cff;
  animation: access-link-packet 6s cubic-bezier(.65,0,.35,1) infinite;
}

.home-server-link span:nth-child(2) { animation-delay: -0.8s; }
.home-server-link span:nth-child(3) { animation-delay: -1.6s; }

.home-server-nodes {
  display: grid;
  gap: 9px;
}

.home-server-sweep {
  position: absolute;
  inset: 5% auto 5% 0;
  width: 25%;
  background: linear-gradient(90deg, transparent, rgb(123 63 242 / 10%), transparent);
  animation: access-server-scan 6s ease-in-out infinite;
}

.home-docs-visual {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 3px 14px;
}

.home-search-bar,
.home-search-result {
  position: relative;
  z-index: 1;
  display: flex;
  min-height: 36px;
  align-items: center;
  gap: 9px;
  padding: 0 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg);
  box-shadow: 0 8px 20px rgb(0 0 0 / 7%);
}

.home-search-bar { border-color: rgb(123 63 242 / 40%); }
.home-search-icon { color: var(--home-purple); font-size: 1.3rem; line-height: 1; }
.home-search-typing { overflow: hidden; color: var(--home-muted); font-size: 0.63rem; white-space: nowrap; animation: access-query-type 8s steps(12, end) infinite; }
.home-search-bar > i { width: 1px; height: 12px; background: var(--home-purple); animation: access-caret .9s steps(2) infinite; }
.home-search-result { min-height: 44px; margin-left: 13px; animation: access-result-reveal 8s cubic-bezier(.16,1,.3,1) infinite; }
.home-search-result-two { margin-left: 29px; animation-delay: -2.5s; }
.home-search-result > span { color: var(--vp-c-text-3); font-size: 0.52rem; }
.home-search-result > b { color: var(--home-ink); font-size: 0.61rem; }
.home-search-result > small { color: var(--home-muted); font-size: 0.53rem; }
.home-search-result > i { margin-left: auto; color: var(--home-purple); font-size: 0.7rem; font-style: normal; }
.home-search-spark { position: absolute; top: 17px; right: 16px; color: #b99bff; animation: access-verify-stamp 8s cubic-bezier(.16,1,.3,1) infinite; }


.home-journey {
  position: relative;
  padding: 104px 12px 88px;
}

.home-section-heading {
  max-width: 620px;
  margin: 0 auto 48px;
  text-align: center;
}

.home-section-heading h2 {
  margin-top: 14px;
  font-size: clamp(2rem, 3.8vw, 2.8rem);
}

.home-section-heading > p {
  margin: 0 auto;
}

.home-steps {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.home-journey-rail {
  position: absolute;
  top: 55%;
  left: 16%;
  width: 68%;
  height: 1px;
  overflow: hidden;
  background: var(--vp-c-divider);
}

.home-journey-rail span {
  display: block;
  width: 30%;
  height: 100%;
  background: linear-gradient(90deg, transparent, var(--home-purple), transparent);
  animation: pathway-transfer 9s cubic-bezier(.65,0,.35,1) infinite;
}

.home-step {
  position: relative;
  z-index: 1;
  display: grid;
  min-height: 242px;
  align-content: start;
  gap: 12px;
  padding: 23px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 17px;
  background: var(--vp-c-bg);
  transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.home-step:hover {
  transform: translateY(-5px);
  border-color: rgb(123 63 242 / 65%);
  box-shadow: 0 16px 42px rgb(123 63 242 / 10%);
}

.home-step-number {
  position: absolute;
  top: 20px;
  right: 20px;
  color: var(--vp-c-text-3);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.1em;
}

.home-step-icon {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border: 1px solid rgb(123 63 242 / 22%);
  border-radius: 12px;
  background: rgb(123 63 242 / 10%);
  color: var(--home-purple);
  font-size: 1.3rem;
}

.home-step strong {
  margin-top: 3px;
  font-size: 1.04rem;
}

.home-step > span:nth-last-child(2) {
  color: var(--home-muted);
  font-size: 0.84rem;
  line-height: 1.6;
}

.home-step-link {
  margin-top: auto;
  color: var(--home-purple);
  font-size: 0.78rem;
  font-weight: 650;
}

.home-portal {
  grid-template-columns: 1.1fr 0.9fr;
  min-height: 400px;
  padding-block: 36px;
  background:
    radial-gradient(ellipse at 18% 55%, rgb(123 63 242 / 16%), transparent 55%),
    var(--vp-c-bg-soft);
}

.home-portal-visual {
  position: relative;
  display: grid;
  min-height: 300px;
  place-items: center;
  perspective: 900px;
}

.home-portal-window {
  width: min(460px, 100%);
  overflow: hidden;
  border: 1px solid rgb(177 146 245 / 40%);
  border-radius: 15px;
  background: var(--vp-c-bg);
  box-shadow: 0 24px 70px rgb(0 0 0 / 22%), 0 0 35px rgb(123 63 242 / 11%);
  transform: rotateY(9deg) rotateX(3deg);
  animation: portal-perspective 12s cubic-bezier(.65,0,.35,1) infinite;
}

.home-window-bar {
  display: flex;
  height: 34px;
  align-items: center;
  gap: 5px;
  padding: 0 11px;
  border-bottom: 1px solid var(--vp-c-divider);
  color: var(--vp-c-text-3);
  font-size: 0.55rem;
}

.home-window-bar i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #6a6380;
}

.home-window-bar i:first-child { background: #ff777c; }
.home-window-bar i:nth-child(2) { background: #ffc966; }
.home-window-bar i:nth-child(3) { background: #55d69c; }
.home-window-bar span { margin-left: auto; margin-right: auto; }

.home-window-content {
  display: grid;
  min-height: 220px;
  grid-template-columns: 48px 1fr;
}

.home-window-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  padding-top: 18px;
  border-right: 1px solid var(--vp-c-divider);
}

.home-window-side b,
.home-window-side i {
  width: 16px;
  height: 6px;
  border-radius: 4px;
  background: var(--vp-c-divider);
}

.home-window-side b {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  background: var(--home-purple);
}

.home-window-main {
  padding: 18px;
}

.home-window-kicker {
  color: var(--home-purple);
  font-size: 0.53rem;
  font-weight: 700;
  letter-spacing: 0.12em;
}

.home-window-title {
  display: block;
  margin: 7px 0 15px;
  font-size: 0.9rem;
}

.home-window-stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.home-window-stat-row i {
  height: 38px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
  background: linear-gradient(90deg, rgb(123 63 242 / 13%) 58%, transparent 58%);
}

.home-window-server {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 32px;
  margin-top: 9px;
  padding: 0 9px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 7px;
}

.home-window-server span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #54d89a;
}

.home-window-server i {
  width: 30%;
  height: 5px;
  border-radius: 4px;
  background: var(--vp-c-divider);
}

.home-window-server i:last-child { width: 16%; margin-left: auto; }
.home-window-server-short { opacity: 0.6; }

.home-portal-spark {
  position: absolute;
  top: 9%;
  right: 9%;
  color: #b99bff;
  font-size: 1.6rem;
  animation: home-sparkle 3.5s ease-in-out infinite;
}

.home-final {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 25px;
  margin-top: 78px;
  padding: 36px clamp(22px, 5vw, 52px);
  overflow: hidden;
  border: 1px solid rgb(123 63 242 / 24%);
  border-radius: 22px;
  background: linear-gradient(110deg, var(--vp-c-bg-soft), var(--vp-c-bg));
}

.home-final > div:not(.home-final-glow) {
  position: relative;
  z-index: 1;
}

.home-final h2 {
  margin: 12px 0 8px;
  font-size: clamp(1.7rem, 3vw, 2.25rem);
}

.home-final p {
  margin: 0;
  font-size: 0.87rem;
}

.home-final-actions {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  margin: 0;
}

.home-final-glow {
  position: absolute;
  top: -110px;
  right: 10%;
  width: 300px;
  height: 300px;
  border-radius: 50%;
  background: rgb(123 63 242 / 14%);
  filter: blur(75px);
  animation: engine-light-pass 14s ease-in-out infinite;
}

@keyframes home-cube-float {
  0%, 100% { transform: translateY(0) rotate(-28deg); }
  50% { transform: translateY(-12px) rotate(-20deg); }
}

@keyframes home-energy-flow {
  to { left: 100%; }
}

@keyframes home-key-orbit {
  to { transform: rotate(340deg); }
}

@keyframes home-token-float {
  0%, 100% { transform: translateY(0) rotate(-12deg); }
  50% { transform: translateY(-8px) rotate(-5deg); }
}

@keyframes home-code-blink {
  from { opacity: 0.35; transform: scaleY(0.65); }
  to { opacity: 1; transform: scaleY(1); }
}

@keyframes home-pill-rise {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-4px); }
}

@keyframes home-slot-in {
  from { opacity: 0; transform: translateX(14px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes home-link-flow {
  from { left: -5px; }
  to { left: 100%; }
}

@keyframes home-sweep {
  0%, 100% { transform: translateX(-50%); opacity: 0; }
  40%, 70% { opacity: 1; }
  90% { transform: translateX(400%); opacity: 0; }
}

@keyframes home-search-type {
  0%, 12% { width: 0; }
  48%, 78% { width: 69px; }
  92%, 100% { width: 0; }
}

@keyframes home-caret {
  50% { opacity: 0; }
}

@keyframes home-result-in {
  0%, 10%, 100% { opacity: 0.4; transform: translateX(4px); }
  25%, 75% { opacity: 1; transform: translateX(0); }
}

@keyframes home-card-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

@keyframes portal-perspective {
  0%,18%,100% { transform: rotateY(9deg) rotateX(3deg) scale(.96); }
  38%,65% { transform: rotateY(-6deg) rotateX(-2deg) scale(1); }
  85% { transform: rotateY(3deg) rotateX(4deg) scale(.98); }
}

@keyframes home-orbit {
  to { transform: rotateX(68deg) rotateZ(340deg); }
}

@keyframes pathway-transfer {
  0%,8% { transform: translateX(-120%); opacity: 0; }
  20%,32% { transform: translateX(0); opacity: 1; }
  48%,60% { transform: translateX(160%); opacity: 1; }
  76%,88% { transform: translateX(320%); opacity: 1; }
  100% { transform: translateX(430%); opacity: 0; }
}

.home-feature-card { transform: perspective(900px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg)); }
.home-window-stat-row i { transform-origin: bottom; animation: portal-stat-build 12s cubic-bezier(.16,1,.3,1) infinite; }
.home-window-stat-row i:nth-child(2) { animation-delay: 180ms; }
.home-window-stat-row i:nth-child(3) { animation-delay: 360ms; }
.home-window-server { animation: portal-row-sync 12s cubic-bezier(.16,1,.3,1) infinite; }
.home-window-server-short { animation-delay: 250ms; }
@keyframes portal-stat-build { 0%,100% { transform: scaleY(.25); opacity: .4; } 25%,80% { transform: scaleY(1); opacity: 1; } }
@keyframes portal-row-sync { 0%,100% { translate: 18px 0; opacity: .45; } 30%,82% { translate: 0 0; opacity: 1; } }
@keyframes access-ring-charge { 0%,18%,100% { transform: rotate(-20deg) scale(.94); opacity: .3; } 40%,65% { transform: rotate(160deg) scale(1.05); opacity: 1; } 82% { transform: rotate(340deg) scale(.94); opacity: .3; } }
@keyframes access-key-turn { 0%,18%,100% { transform: rotate(-12deg) scale(1); } 35%,50% { transform: rotate(12deg) scale(1.13); } 70%,85% { transform: rotate(-12deg) scale(1); } }
@keyframes access-code-unlock { 0%,20%,100% { opacity: .2; transform: scaleY(.4); } 35%,75% { opacity: 1; transform: scaleY(1); } }
@keyframes access-product-unlock { 0%,18%,100% { opacity: .55; translate: 0 6px; border-color: var(--vp-c-divider); } 35%,70% { opacity: 1; translate: 0 0; border-color: #a77bff; } }
@keyframes access-server-register { 0%,8%,100% { opacity: .45; translate: 16px 0; } 25%,85% { opacity: 1; translate: 0 0; } }
@keyframes access-link-packet { 0%,10% { left: -5px; opacity: 0; } 20% { opacity: 1; } 60%,100% { left: 100%; opacity: 0; } }
@keyframes access-server-scan { 0%,100% { transform: translateX(-80%); opacity: 0; } 25% { opacity: 1; } 65%,90% { transform: translateX(420%); opacity: 0; } }
@keyframes access-query-type { 0%,8%,100% { width: 0; } 35%,90% { width: 69px; } }
@keyframes access-caret { 50% { opacity: 0; } }
@keyframes access-result-reveal { 0%,32%,100% { opacity: .15; translate: 20px 0; filter: blur(3px); } 48%,90% { opacity: 1; translate: 0 0; filter: blur(0); } }
@keyframes access-verify-stamp { 0%,40%,100% { transform: scale(.2) rotate(-45deg); opacity: 0; } 58%,90% { transform: scale(1) rotate(0); opacity: 1; } }

.home-license-art { position: relative; min-height: 320px; }
.access-network { position: absolute; inset: 0; width: 100%; height: 100%; fill: none; stroke: #a77bff35; stroke-width: 1; }
.access-network-charge { stroke: #b990ff; stroke-width: 2; stroke-dasharray: .2 .8; animation: access-network-transfer 9s ease infinite; }
.access-vault { position: absolute; left: 50%; top: 50%; display: grid; place-items: center; width: 100px; height: 110px; margin: -55px -50px; border: 1px solid #a77bff80; border-radius: 20px; background: var(--vp-c-bg-elv); box-shadow: 0 0 60px #7b3ff225; transform: rotate(-8deg); }
.access-vault svg { width: 70px; height: 70px; fill: none; stroke: #b990ff; stroke-width: 2; }
.access-vault path { stroke-dasharray: 1; animation: access-key-draw 9s ease infinite; }
.access-vault span { font: 8px monospace; letter-spacing: .12em; color: var(--vp-c-brand-1); margin-bottom: 12px; }
.access-product { position: absolute; display: flex; align-items: center; gap: 8px; padding: 12px; background: var(--vp-c-bg-elv); border: 1px solid #a77bff45; border-radius: 9px; font-size: 10px; animation: access-product-unlock 9s ease infinite; }
.access-product i { font: normal 9px monospace; color: var(--vp-c-brand-1); }
.access-product-one { top: 12%; left: 0; }
.access-product-two { top: 12%; right: 0; animation-delay: -6s; }
.access-product-three { bottom: 4%; left: 50%; margin-left: -42px; animation-delay: -3s; }
@keyframes access-key-draw { 0%,8%,100% { stroke-dashoffset: 1; } 35%,88% { stroke-dashoffset: 0; } }
@keyframes access-network-transfer { 0%,25% { stroke-dashoffset: 1; opacity: 0; } 40% { opacity: 1; } 80%,100% { stroke-dashoffset: 0; opacity: 0; } }

@keyframes home-sparkle {
  0%, 100% { opacity: 0.35; transform: scale(0.8) rotate(0); }
  50% { opacity: 1; transform: scale(1.15) rotate(24deg); }
}

@keyframes home-breathe {
  0%, 100% { opacity: 0.55; transform: scale(0.92); }
  50% { opacity: 1; transform: scale(1.08); }
}

@keyframes home-pulse {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}

@media (max-width: 760px) {
  .home-feature-showcase { padding: 68px 2px 20px; }
  .home-feature-card { min-height: 380px; padding-inline: 21px; }
  .home-feature-grid { gap: 12px; }
  .home-entry { grid-template-columns: 1fr; gap: 9px; }
  .home-entry-card { padding: 11px 13px; }
  .home-license { grid-template-columns: 1fr; gap: 12px; padding: 30px 24px; }
  .home-license-art { min-height: 270px; }
  .home-license-copy { padding: 0 4px 8px; }
  .home-proof,
  .home-portal {
    grid-template-columns: 1fr;
    padding: 34px 24px;
  }

  .home-proof { gap: 10px; }
  .home-orbit-scene { min-height: 300px; }
  .home-portal-visual { order: 2; min-height: 250px; }
  .home-portal-copy { order: 1; }
  .home-steps { grid-template-columns: 1fr; }
  .home-journey { padding: 76px 2px 62px; }
  .home-journey-rail { display: none; }
  .home-step { min-height: 210px; }
  .home-feature-grid { grid-template-columns: 1fr; }
  .home-feature-card { min-height: 360px; }
  .home-feature-copy { max-width: 390px; }
  .home-key-visual,
  .home-ip-visual,
  .home-server-visual,
  .home-docs-visual { width: min(100%, 420px); }
  .home-final { align-items: flex-start; flex-direction: column; margin-top: 48px; }
  .home-final-actions { margin-top: 5px; }
}

@media (max-width: 420px) {
  .home-feature-card { min-height: 370px; padding: 21px 17px 18px; }
  .home-feature-badge { top: 15px; right: 14px; }
  .home-server-visual { grid-template-columns: 0.8fr 20px 1fr; }
  .home-server-node { grid-template-columns: 19px minmax(0, 1fr); gap: 4px; padding: 6px; }
  .home-server-node > i { grid-column: 2; }
  .home-server-node-main { grid-template-columns: 22px 1fr; }
  .home-server-node-main > i { grid-column: 2; }
  .home-mini-server { width: 17px; }
  .home-search-result { gap: 6px; margin-left: 4px; }
  .home-search-result-two { margin-left: 16px; }
  .home-search-result > small { font-size: 0.48rem; }
  .home-proof,
  .home-portal { padding: 28px 18px; }
  .home-license { padding: 24px 18px; }
  .home-license-art { min-height: 240px; }
  .home-license-orbit { width: 215px; height: 108px; }
  .home-license-orbit-two { width: 250px; height: 150px; }
  .home-license-chip { padding: 7px 8px; font-size: 0.58rem; }
  .home-license-chip-one { left: 0; }
  .home-license-chip-two { right: 0; }
  .home-license-chip-three { left: 4%; }
  .home-proof-actions { align-items: flex-start; flex-direction: column; gap: 13px; }
  .home-float-card-top { right: 0; }
  .home-float-card-bottom { right: -4px; }
  .home-final-actions { align-items: stretch; flex-direction: column; width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .home-experience *,
  .home-experience *::before,
  .home-experience *::after {
    animation: none !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }

  .engine-art, .engine-stage, .home-feature-card { transform: none; }
  .home-search-typing { width: 69px; }
}
</style>
