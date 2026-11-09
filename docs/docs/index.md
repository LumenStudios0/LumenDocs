---
title: Documentation
description: Lumen Studios product documentation, setup guides, and support resources
---

# Documentation

Find installation instructions, compatibility details, configuration references, and troubleshooting for Lumen Studios products.

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

<style>
.docs-hub-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin: 28px 0;
}

.docs-hub-card {
  display: grid;
  min-height: 185px;
  align-content: start;
  gap: 11px;
  padding: 20px;
  border: 1px solid var(--lumen-card-border);
  border-radius: 15px;
  background: var(--lumen-card-bg);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: border-color 180ms ease, transform 180ms ease, box-shadow 180ms ease;
}

.docs-hub-card:hover {
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

@media (prefers-reduced-motion: reduce) {
  .docs-hub-card { transition: none; }
  .docs-hub-card:hover { transform: none; }
}
</style>
