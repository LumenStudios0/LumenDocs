---
layout: home
title: Lumen Studios Documentation
titleTemplate: Official plugin guides
hero:
  name: Lumen Studios
  text: Tools for worlds worth building.
  tagline: Official guides for installing, configuring, and getting more from Lumen Studios Minecraft plugins.
  image:
    src: /logo.svg
    alt: Lumen Studios logo
  actions:
    - theme: brand
      text: Explore plugins
      link: /plugins/
    - theme: alt
      text: Get started
      link: /getting-started/
features:
  - icon: ◈
    title: A guide for every plugin
    details: Find setup instructions, commands, permissions, configuration notes, and product-specific help.
    link: /plugins/
    linkText: Browse the plugin catalog
  - icon: ⌘
    title: Searchable by design
    details: Search the documentation instantly with VitePress local search—no account or external service needed.
    link: /getting-started/
    linkText: Start here
  - icon: ✦
    title: Built for server teams
    details: Practical guidance for administrators, clear dependency notes, and troubleshooting steps.
    link: /troubleshooting
    linkText: Solve an issue
---

<div class="home-grid">
  <a class="home-card" href="/LumenDocs/plugins/">
    <span class="home-card-kicker">PLUGIN CATALOG</span>
    <strong>Find your next upgrade</strong>
    <span>Explore economy, marketplace, moderation, PvP, and server utility plugins.</span>
    <span class="home-card-arrow">Browse plugins <span aria-hidden="true">↗</span></span>
  </a>
  <a class="home-card" href="/LumenDocs/getting-started/installation">
    <span class="home-card-kicker">QUICK START</span>
    <strong>Install with confidence</strong>
    <span>Follow a safe, repeatable plugin installation process for your server.</span>
    <span class="home-card-arrow">Read the guide <span aria-hidden="true">↗</span></span>
  </a>
  <a class="home-card" href="/LumenDocs/troubleshooting">
    <span class="home-card-kicker">HELP & SUPPORT</span>
    <strong>Get back in the game</strong>
    <span>Check common configuration, dependency, permission, and startup issues.</span>
    <span class="home-card-arrow">Troubleshoot <span aria-hidden="true">↗</span></span>
  </a>
</div>

<style>
.home-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  max-width: 1152px;
  margin: 0 auto 72px;
  padding: 0 24px;
}
.home-card {
  display: flex;
  min-height: 194px;
  flex-direction: column;
  gap: 12px;
  padding: 22px;
  border: 1px solid rgba(185, 164, 220, .14);
  border-radius: 14px;
  background: linear-gradient(145deg, rgba(25, 19, 36, .92), rgba(17, 13, 25, .92));
  color: inherit;
  text-decoration: none !important;
  transition: border-color .18s ease, transform .18s ease;
}
.home-card:hover {
  border-color: rgba(156, 115, 255, .52);
  transform: translateY(-2px);
}
.home-card-kicker {
  color: #a986ff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .12em;
}
.home-card strong { font-size: 17px; }
.home-card > span:not(.home-card-kicker):not(.home-card-arrow) {
  color: #b6adc5;
  font-size: 14px;
  line-height: 1.6;
}
.home-card-arrow {
  display: flex;
  justify-content: space-between;
  margin-top: auto;
  color: #c0a3ff;
  font-size: 13px;
  font-weight: 600;
}
@media (max-width: 760px) {
  .home-grid { grid-template-columns: 1fr; margin-bottom: 48px; }
  .home-card { min-height: 160px; }
}
</style>
