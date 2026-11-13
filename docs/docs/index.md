---
title: Documentation
description: Lumen Studios product documentation, setup guides, and support resources
---

<div class="docs-hub-label">LUMEN STUDIOS / THE GUIDEBOOK</div>

# Documentation

Find installation instructions, compatibility details, configuration references, and troubleshooting for Lumen Studios products.

<div class="docs-hub-intro">
  <span>THE LUMEN GUIDEBOOK</span>
  <p>Start with the setup path, jump straight to a product, or find a fix. Each guide is organized around what you need to do next.</p>
</div>

<div class="docs-hub-grid">
  <a href="/getting-started/" class="docs-hub-card docs-hub-card-featured">
    <span class="docs-hub-eyebrow">Start here</span>
    <strong>Getting started</strong>
    <span>Check requirements, install your first plugin, and understand licensing.</span>
    <span class="docs-hub-link">Open the setup guides →</span>
  </a>
  <a href="/plugins/" class="docs-hub-card">
    <span class="docs-hub-eyebrow">Product library</span>
    <strong>Browse plugins</strong>
    <span>Find a plugin and jump straight to its commands, settings, and features.</span>
    <span class="docs-hub-link">Explore plugins →</span>
  </a>
  <a href="/troubleshooting" class="docs-hub-card">
    <span class="docs-hub-eyebrow">Help &amp; support</span>
    <strong>Troubleshooting</strong>
    <span>Resolve common setup problems and find the right support channel.</span>
    <span class="docs-hub-link">Get help →</span>
  </a>
  <a href="/reports/" class="docs-hub-card">
    <span class="docs-hub-eyebrow">Help us improve</span>
    <strong>Reports &amp; requests</strong>
    <span>Report a bug, share a compatibility result, or request a feature.</span>
    <span class="docs-hub-link">Open reports →</span>
  </a>
</div>

<div class="docs-hub-popular">
  <div>
    <span class="docs-hub-eyebrow">QUICK START</span>
    <strong>New to Lumen?</strong>
  </div>
  <a href="/getting-started/installation">Install a plugin <span>↗</span></a>
  <a href="/getting-started/compatibility">Check compatibility <span>↗</span></a>
  <a href="/getting-started/licensing">Understand licensing <span>↗</span></a>
</div>

<style>
.docs-hub-intro {
  max-width: 690px;
  margin: 20px 0 26px;
  padding: 24px;
  border: 1px solid var(--lumen-card-border);
  border-radius: 14px;
  background: radial-gradient(ellipse at top right, var(--vp-c-brand-soft), transparent 80%), var(--lumen-card-bg);
}

.docs-hub-label {
  margin-bottom: 18px;
  color: var(--vp-c-brand-1);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.14em;
}

.docs-hub-label + h1 {
  margin-top: 0;
}

.docs-hub-intro > span {
  color: var(--vp-c-brand-1);
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.11em;
}

.docs-hub-intro p {
  margin: 7px 0 0;
  color: var(--vp-c-text-2);
  line-height: 1.7;
}

.docs-hub-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 28px 0;
  counter-reset: guide;
}

.vp-doc a.docs-hub-card {
  display: grid;
  position: relative;
  min-width: 0;
  min-height: 215px;
  align-content: start;
  gap: 11px;
  padding: 25px;
  border: 1px solid var(--lumen-card-border);
  border-radius: 15px;
  background: var(--lumen-card-bg);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
  counter-increment: guide;
}

.docs-hub-card::before {
  content: "0" counter(guide);
  position: absolute;
  top: 24px;
  right: 24px;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
  font-size: 11px;
}

@media (max-width: 540px) {
  .docs-hub-grid { grid-template-columns: 1fr; }
  .vp-doc a.docs-hub-card { min-height: 185px; }
}

.vp-doc a.docs-hub-card:hover {
  transform: translateY(-3px);
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 12px 30px rgb(123 63 242 / 12%);
}

.docs-hub-eyebrow {
  color: var(--vp-c-brand-1);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.docs-hub-card strong {
  font-size: 1.08rem;
}

.docs-hub-card > span:not(.docs-hub-eyebrow):not(.docs-hub-link) {
  color: var(--vp-c-text-2);
  font-size: 0.87rem;
  line-height: 1.6;
}

.docs-hub-link {
  margin-top: auto;
  color: var(--vp-c-brand-1);
  font-size: 0.83rem;
  font-weight: 650;
}

.docs-hub-popular {
  display: grid;
  grid-template-columns: minmax(125px, 0.8fr) repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 10px;
  margin: 26px 0 14px;
  padding: 16px;
  border: 1px solid var(--lumen-card-border);
  border-radius: 15px;
  background: var(--lumen-card-bg);
}

.docs-hub-popular > div {
  display: grid;
  gap: 4px;
}

.docs-hub-popular strong {
  font-size: 0.9rem;
}

.vp-doc .docs-hub-popular > a {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--vp-c-text-2);
  font-size: 0.78rem;
  font-weight: 600;
  text-decoration: none;
  transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
}

.vp-doc .docs-hub-popular > a:hover {
  border-color: var(--lumen-card-border);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
}

.docs-hub-popular > a span {
  color: var(--vp-c-brand-1);
}

@media (prefers-reduced-motion: reduce) {
  .vp-doc a.docs-hub-card { transition: none; }
  .vp-doc a.docs-hub-card:hover { transform: none; }
}

@media (max-width: 720px) {
  .docs-hub-popular {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .docs-hub-popular > div {
    padding: 0 10px 6px;
  }
}
</style>
