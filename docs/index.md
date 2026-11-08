---
layout: home
title: Lumen Studios
titleTemplate: Minecraft plugins and guides
hero:
  name: Lumen Studios
  text: Good tools. Clear answers.
  tagline: Find the right plugin, get it set up, and get back to running your server.
  image:
    src: /assets/lumen-logo.png
    alt: Lumen Studios logo
  actions:
    - theme: brand
      text: Browse plugins
      link: /plugins/
    - theme: alt
      text: Set up a plugin
      link: /getting-started/installation
features:
  - icon: ◈
    title: Start with your server
    details: Each guide calls out the versions, dependencies, and setup details that matter before you install.
    link: /getting-started/compatibility
    linkText: Check compatibility
  - icon: ⌘
    title: Find the answer you need
    details: Search commands, permissions, and settings across the plugin guides.
    link: /plugins/
    linkText: Find a plugin
  - icon: ✦
    title: Need a license?
    details: We’ll walk you through getting one from the Lumen Studios Discord.
    link: /getting-started/licensing
    linkText: Get license help
---

<div class="brand-banner">
  <img src="/assets/lumen-banner.png" alt="Lumen Studios — purple banner" />
</div>

<div class="home-grid">
  <a class="home-card" href="/LumenDocs/plugins/">
    <span class="home-card-kicker">THE PLUGINS</span>
    <strong>What are you setting up?</strong>
    <span>Browse the plugin guides and find the one that fits your server.</span>
    <span class="home-card-arrow">See all plugins <span aria-hidden="true">↗</span></span>
  </a>
  <a class="home-card" href="/LumenDocs/getting-started/installation">
    <span class="home-card-kicker">FIRST TIME HERE?</span>
    <strong>Start with the basics</strong>
    <span>A few simple checks can save a lot of time when installing a plugin.</span>
    <span class="home-card-arrow">Installation guide <span aria-hidden="true">↗</span></span>
  </a>
  <a class="home-card" href="/LumenDocs/getting-started/licensing">
    <span class="home-card-kicker">LICENSE SUPPORT</span>
    <strong>We’ll help you get set up</strong>
    <span>Join our Discord and open a license support ticket.</span>
    <span class="home-card-arrow">Get a license <span aria-hidden="true">↗</span></span>
  </a>
</div>

<style>
.brand-banner {
  max-width: 1152px;
  margin: -18px auto 38px;
  padding: 0 24px;
}
.brand-banner img {
  display: block;
  width: 100%;
  max-height: 340px;
  object-fit: cover;
  border: 1px solid rgba(185, 164, 220, .16);
  border-radius: 16px;
  box-shadow: 0 18px 60px rgba(58, 21, 132, .2);
}
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
  transition: border-color 180ms ease, transform 180ms ease;
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
  .brand-banner { margin-top: 0; margin-bottom: 28px; }
  .brand-banner img { max-height: 240px; border-radius: 12px; }
  .home-grid { grid-template-columns: 1fr; margin-bottom: 48px; }
  .home-card { min-height: 160px; }
}
</style>
