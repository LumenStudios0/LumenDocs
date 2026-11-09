<template>
  <div class="home-experience">
    <section class="home-proof" aria-label="Lumen Studios principles">
      <div class="home-proof-copy">
        <span class="home-eyebrow"><span class="home-pulse" /> BUILT FOR THE PEOPLE RUNNING SERVERS</span>
        <h2>Less setup friction.<br><span>More time in game.</span></h2>
        <p>Pick a tool, understand what it needs, and bring it online with confidence. The details are easy to find, and your customer tools have their own dedicated space.</p>
        <div class="home-proof-actions">
          <a class="home-button home-button-primary" href="/plugins/">Find your plugin <span>↗</span></a>
          <a class="home-text-link" href="/account/">Go to customer portal <span>→</span></a>
        </div>
      </div>

      <div class="home-orbit-scene" aria-label="Animated illustration of a plugin moving from setup to a running server">
        <div class="home-orbit home-orbit-outer" />
        <div class="home-orbit home-orbit-inner" />
        <div class="home-glow" />
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
  width: min(1120px, 100%);
  margin: 14px auto 80px;
  color: var(--home-ink);
}

.home-experience a {
  text-decoration: none;
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
  .home-final { align-items: flex-start; flex-direction: column; margin-top: 48px; }
  .home-final-actions { margin-top: 5px; }
}

@media (max-width: 420px) {
  .home-proof,
  .home-portal { padding: 28px 18px; }
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
}
</style>
