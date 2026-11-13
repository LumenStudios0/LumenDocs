<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const experienceRoot = ref<HTMLElement | null>(null)
let revealObserver: IntersectionObserver | undefined

function handleFeatureTilt(event: PointerEvent) {
  const card = event.currentTarget
  if (!(card instanceof HTMLElement) || event.pointerType === 'touch') return

  const bounds = card.getBoundingClientRect()
  const x = (event.clientX - bounds.left) / bounds.width - 0.5
  const y = (event.clientY - bounds.top) / bounds.height - 0.5
  card.style.setProperty('--tilt-x', `${-y * 3}deg`)
  card.style.setProperty('--tilt-y', `${x * 3}deg`)
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

  if (!('IntersectionObserver' in window)) {
    root.querySelectorAll('.home-reveal').forEach(element => element.classList.add('is-visible'))
    return
  }
  root.classList.add('home-motion-ready')
  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return
      entry.target.classList.add('is-visible')
      observer.unobserve(entry.target)
    })
  }, { threshold: 0.16 })

  root.querySelectorAll('.home-reveal').forEach(element => revealObserver?.observe(element))
})

onUnmounted(() => {
  revealObserver?.disconnect()
})
</script>

<template>
  <div ref="experienceRoot" class="home-experience">
    <section class="launch" aria-labelledby="launch-title">
      <div class="launch-copy">
        <a class="launch-label" href="/plugins/"><span /> LUMEN STUDIOS <i>/</i> MINECRAFT PLUGINS <span aria-hidden="true">↗</span></a>
        <h1 id="launch-title" class="launch-title">Lumen Studios<br><span>Your server.<br>In good hands.</span></h1>
        <p class="launch-description">One license key for your Lumen plugins, thoughtful Minecraft tools, and clear guides to get everything running.</p>
        <div class="launch-actions">
          <a class="home-button home-button-primary" href="/docs/">Explore documentation <span aria-hidden="true">→</span></a>
          <a class="home-button launch-secondary" href="/account/">Open customer portal <span aria-hidden="true">↗</span></a>
        </div>
        <div class="launch-notes"><span>One license key</span><span>Plugin-by-plugin guides</span><span>Built for your community</span></div>
      </div>

      <div class="workspace" aria-label="Explore the Lumen workspace">
        <div class="workspace-bar"><span class="workspace-mark">L</span><strong>Your Lumen workspace</strong><span class="workspace-preview">PREVIEW</span></div>
        <div class="workspace-body">
          <div class="workspace-rail" aria-hidden="true"><span class="workspace-rail-active">◈</span><span>⌘</span><span>✦</span><span>⚙</span><i /></div>
          <div class="workspace-main">
            <div class="workspace-heading"><div><span class="workspace-kicker">A LITTLE LESS ADMIN</span><h2>A lot more possibility.</h2></div><span class="workspace-emblem" aria-hidden="true">✦</span></div>
            <a href="/getting-started/" class="workspace-setup"><span class="workspace-setup-icon" aria-hidden="true">↗</span><span><strong>Your next great server starts here</strong><small>Requirements. Installation. First launch.</small></span><span aria-hidden="true">→</span></a>
            <div class="workspace-section-label"><span>THE TOOLKIT</span><span>Made to work together</span></div>
            <div class="workspace-tools">
              <a href="/plugins/"><span class="workspace-tool-icon" aria-hidden="true">✦</span><strong>Plugins</strong><small>Find your next upgrade</small><span class="workspace-tool-link">Explore library ↗</span></a>
              <a href="/getting-started/licensing"><span class="workspace-tool-icon" aria-hidden="true">⌘</span><strong>One key.</strong><small>Every Lumen plugin</small><span class="workspace-tool-link">License guide ↗</span></a>
            </div>
            <a class="workspace-guide" href="/docs/"><span aria-hidden="true">≡</span><span><strong>Answers, without the digging.</strong><small>Commands, configuration &amp; permissions</small></span><span aria-hidden="true">→</span></a>
            <div class="workspace-footer"><span><i /> BUILT FOR MINECRAFT</span><span>Less friction. More creating.</span></div>
          </div>
        </div>
      </div>
    </section>

    <nav class="home-entry" aria-label="Explore Lumen Studios">
      <a class="home-entry-card" href="/docs/">
        <span class="home-entry-icon home-entry-icon-docs" aria-hidden="true">⌘</span>
        <span class="home-entry-copy"><strong>Documentation</strong><small>Setup guides and answers</small></span>
        <span class="home-entry-arrow" aria-hidden="true">↗</span>
      </a>
      <a class="home-entry-card" href="/plugins/">
        <span class="home-entry-icon home-entry-icon-plugins" aria-hidden="true">✦</span>
        <span class="home-entry-copy"><strong>Plugin library</strong><small>Find tools for your server</small></span>
        <span class="home-entry-arrow" aria-hidden="true">↗</span>
      </a>
      <a class="home-entry-card" href="/account/">
        <span class="home-entry-icon home-entry-icon-account" aria-hidden="true">◈</span>
        <span class="home-entry-copy"><strong>Customer portal</strong><small>Your products and account</small></span>
        <span class="home-entry-arrow" aria-hidden="true">↗</span>
      </a>
    </nav>

    <section class="home-proof" aria-label="Lumen Studios principles">
      <div class="home-proof-copy">
        <span class="home-eyebrow"><span class="home-pulse" /> BUILT FOR THE PEOPLE BEHIND THE SERVER</span>
        <h2>Make your server<br><span>feel like yours.</span></h2>
        <p>Discover thoughtful tools for your community, follow clear guides, and keep your Lumen products together in one place.</p>
        <div class="home-proof-actions">
          <a class="home-button home-button-primary" href="/plugins/">Find your plugin <span>↗</span></a>
          <a class="home-text-link" href="/account/">Go to customer portal <span>→</span></a>
        </div>
      </div>

      <div class="home-orbit-scene" aria-label="Animated illustration of a plugin moving from setup to a running server">
        <div class="home-orbit home-orbit-outer" />
        <div class="home-orbit home-orbit-inner" />
        <div class="home-orbit home-orbit-dash" />
        <div class="home-glow" />
        <div class="home-energy-line"><i /><i /><i /></div>
        <div class="home-float-card home-float-card-top">
          <span class="home-card-dot" />
          <span>Ready to install</span>
          <strong>Plugin.jar</strong>
        </div>
        <div class="home-cube">
          <div class="home-cube-face home-cube-front"><span>✦</span></div>
          <div class="home-cube-face home-cube-side" />
          <div class="home-cube-face home-cube-top" />
        </div>
        <div class="home-float-card home-float-card-bottom">
          <span class="home-server-icon"><i /><i /><i /></span>
          <span><strong>Server online</strong><small>All systems ready</small></span>
          <span class="home-online-dot" />
        </div>
        <span class="home-spark home-spark-one">✦</span>
        <span class="home-spark home-spark-two">·</span>
        <span class="home-spark home-spark-three">✧</span>
      </div>
    </section>

    <section class="home-feature-showcase" aria-label="What you can do with Lumen Studios">
      <div class="home-section-heading home-feature-heading">
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
        <span class="home-license-halo" />
        <span class="home-license-orbit home-license-orbit-one" />
        <span class="home-license-orbit home-license-orbit-two" />
        <div class="home-license-token">
          <span>✦</span>
          <small>ONE KEY</small>
        </div>
        <div class="home-license-chip home-license-chip-one"><i>LA</i> Lumen Auction</div>
        <div class="home-license-chip home-license-chip-two"><i>LD</i> Lumen Duels</div>
        <div class="home-license-chip home-license-chip-three"><i>LS</i> Lumen Shards</div>
        <span class="home-license-spark home-license-spark-one">✧</span>
        <span class="home-license-spark home-license-spark-two">✦</span>
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

    <section class="home-portal">
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
        <div class="home-portal-spark">✦</div>
      </div>
      <div class="home-portal-copy">
        <span class="home-eyebrow">YOUR CUSTOMER PORTAL</span>
        <h2>A home for your<br><span>Lumen products.</span></h2>
        <p>Keep customer tools separate from documentation. View the products connected to your account, check license details, and see which servers are using a license.</p>
        <a class="home-button home-button-secondary" href="/account/">Explore the portal <span>→</span></a>
      </div>
    </section>

    <section class="home-final">
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: clamp(32px, 5vw, 76px);
  align-items: center;
  padding: clamp(48px, 7vw, 100px) 0 64px;
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

.workspace {
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgb(149 108 255 / 28%);
  border-radius: 16px;
  background: var(--vp-c-bg);
  box-shadow: 0 24px 80px rgb(52 20 110 / 18%), 0 0 90px rgb(123 63 242 / 9%);
  transform: perspective(1400px) rotateY(-5deg) rotateX(2deg);
  animation: workspace-enter 800ms ease both;
}

.workspace-bar { display: flex; align-items: center; gap: 10px; padding: 15px 18px; border-bottom: 1px solid var(--vp-c-divider); background: var(--vp-c-bg-soft); }
.workspace-mark { display: grid; width: 24px; height: 24px; place-items: center; border-radius: 6px; background: linear-gradient(135deg, #bc9cff, #6026cf); color: white; font-weight: 800; font-style: italic; }
.workspace-bar strong { font-size: 11px; font-weight: 550; }
.workspace-preview { margin-left: auto; font-size: 8px; letter-spacing: 0.08em; color: var(--home-muted); }
.workspace-body { display: grid; grid-template-columns: 48px minmax(0, 1fr); }
.workspace-rail { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 21px 0; border-right: 1px solid var(--vp-c-divider); color: var(--home-muted); }
.workspace-rail span { display: grid; width: 28px; height: 28px; place-items: center; font-size: 16px; }
.workspace-rail .workspace-rail-active { border-radius: 7px; background: var(--vp-c-brand-soft); color: var(--vp-c-brand-1); }
.workspace-rail i { width: 20px; height: 20px; margin-top: auto; border: 1px solid var(--vp-c-divider); border-radius: 50%; background: var(--vp-c-brand-soft); }
.workspace-main { min-width: 0; padding: 24px; background: radial-gradient(ellipse at 100% 0, rgb(123 63 242 / 8%), transparent 65%); }
.workspace-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.workspace-kicker { color: var(--home-muted); font-size: 8px; letter-spacing: 0.14em; }
.workspace-heading h2 { margin: 5px 0 22px; padding: 0; border: 0; font-size: 20px; letter-spacing: -0.04em; line-height: 1.4; }
.workspace-emblem { color: #a986ff; font-size: 36px; filter: drop-shadow(0 0 16px rgb(149 108 255 / 50%)); }
.workspace-setup { display: flex; align-items: center; gap: 12px; padding: 14px; border: 1px solid rgb(149 108 255 / 30%); border-radius: 9px; background: linear-gradient(110deg, rgb(123 63 242 / 14%), rgb(123 63 242 / 4%)); color: var(--home-ink); }
.workspace-setup > span:last-child { margin-left: auto; color: var(--vp-c-brand-1); }
.workspace-setup-icon { color: #a986ff; font-size: 24px; }
.workspace strong, .workspace small { display: block; }
.workspace-setup strong, .workspace-guide strong { font-size: 11px; line-height: 1.5; font-weight: 600; }
.workspace small { margin-top: 4px; color: var(--home-muted); font-size: 9px; line-height: 1.5; }
.workspace-section-label { display: flex; justify-content: space-between; gap: 12px; margin: 24px 0 10px; color: var(--home-muted); font-size: 8px; }
.workspace-section-label > span:first-child { letter-spacing: 0.12em; }
.workspace-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.workspace-tools a { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 9px; background: var(--vp-c-bg-soft); color: var(--home-ink); }
.workspace-tool-icon { display: grid; width: 30px; height: 30px; margin-bottom: 12px; place-items: center; border: 1px solid rgb(149 108 255 / 25%); border-radius: 8px; color: #956cff; background: var(--vp-c-brand-soft); }
.workspace-tools strong { font-size: 16px; letter-spacing: -0.03em; }
.workspace-tool-link { margin-top: 16px; color: var(--vp-c-brand-1); font-size: 9px; }
.workspace-guide { display: flex; align-items: center; gap: 12px; margin-top: 12px; padding: 14px 0; color: var(--home-ink); }
.workspace-guide > span:first-child { color: var(--vp-c-brand-1); font-size: 24px; }
.workspace-guide > span:last-child { margin-left: auto; }
.workspace-footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding-top: 14px; border-top: 1px solid var(--vp-c-divider); color: var(--home-muted); font-size: 8px; }
.workspace-footer > span:first-child { display: flex; align-items: center; gap: 6px; font-size: 7px; letter-spacing: 0.08em; }
.workspace a { transition: border-color 180ms ease, background-color 180ms ease; }
.workspace a:hover { border-color: var(--vp-c-brand-1); background-color: var(--vp-c-brand-soft); }

@keyframes workspace-enter {
  from { opacity: 0; transform: perspective(1400px) rotateY(-9deg) translateY(24px); }
  to { opacity: 1; transform: perspective(1400px) rotateY(-5deg) rotateX(2deg); }
}

@media (max-width: 960px) {
  .launch { gap: 32px; }
  .launch .launch-title { font-size: 46px; }
  .workspace-main { padding: 18px; }
  .workspace-body { grid-template-columns: 36px minmax(0, 1fr); }
}

@media (max-width: 720px) {
  .launch { grid-template-columns: 1fr; padding-top: 36px; gap: 36px; }
  .launch-copy { text-align: center; }
  .launch .launch-title { font-size: clamp(40px, 10vw, 64px); }
  .launch-description { margin-inline: auto; font-size: 16px; }
  .launch-actions, .launch-notes { justify-content: center; }
  .workspace { width: 100%; max-width: 520px; margin-inline: auto; transform: none; animation: none; }
}

.launch a:focus-visible { outline: 2px solid var(--vp-c-brand-1); outline-offset: 4px; }

@media (prefers-reduced-motion: reduce) {
  .workspace { animation: none; transform: none; }
}

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
  animation: home-key-orbit 9s linear infinite;
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
  animation: home-token-float 4s ease-in-out infinite;
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
  animation: home-code-blink 1.8s ease-in-out infinite alternate;
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
  animation: home-pill-rise 3.8s ease-in-out infinite;
}

.home-product-pills span:nth-child(2) { animation-delay: -1.2s; }
.home-product-pills span:nth-child(3) { animation-delay: -2.4s; }

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
  animation: home-slot-in 0.7s both;
}

.home-ip-slot-two { animation-delay: 0.25s; }
.home-ip-slot-three { animation-delay: 0.5s; }
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
  animation: home-key-orbit 12s linear infinite;
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
  animation: home-link-flow 2.4s linear infinite;
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
  animation: home-sweep 4s ease-in-out infinite;
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
.home-search-typing { overflow: hidden; color: var(--home-muted); font-size: 0.63rem; white-space: nowrap; animation: home-search-type 5s steps(12, end) infinite; }
.home-search-bar > i { width: 1px; height: 12px; background: var(--home-purple); animation: home-caret 0.9s steps(2) infinite; }
.home-search-result { min-height: 44px; margin-left: 13px; animation: home-result-in 5s ease-in-out infinite; }
.home-search-result-two { margin-left: 29px; animation-delay: -2.5s; }
.home-search-result > span { color: var(--vp-c-text-3); font-size: 0.52rem; }
.home-search-result > b { color: var(--home-ink); font-size: 0.61rem; }
.home-search-result > small { color: var(--home-muted); font-size: 0.53rem; }
.home-search-result > i { margin-left: auto; color: var(--home-purple); font-size: 0.7rem; font-style: normal; }
.home-search-spark { position: absolute; top: 17px; right: 16px; color: #b99bff; animation: home-sparkle 2.5s ease-in-out infinite; }

.home-motion-ready .home-reveal {
  opacity: 0;
  transform: translateY(22px) scale(0.985);
  transition: opacity 650ms ease, transform 650ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.home-motion-ready .home-reveal.is-visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.home-feature-card:nth-child(2) { transition-delay: 70ms; }
.home-feature-card:nth-child(3) { transition-delay: 140ms; }
.home-feature-card:nth-child(4) { transition-delay: 210ms; }

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
  animation: home-rail-flow 4s ease-in-out infinite;
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
  animation: home-window-float 7s ease-in-out infinite;
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
  animation: home-breathe 5s ease-in-out infinite;
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

@keyframes home-window-float {
  0%, 100% { transform: rotateY(9deg) rotateX(3deg) translateY(0); }
  50% { transform: rotateY(7deg) rotateX(1deg) translateY(-7px); }
}

@keyframes home-orbit {
  to { transform: rotateX(68deg) rotateZ(340deg); }
}

@keyframes home-rail-flow {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(430%); }
}

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
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }

  .home-motion-ready .home-reveal {
    opacity: 1;
    transform: none;
  }
}
</style>
