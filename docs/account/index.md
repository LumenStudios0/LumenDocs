---
title: Customer dashboard
description: Lumen Studios customer account dashboard
---

# Customer dashboard

Welcome to your Lumen Studios account area. License and purchase records will be connected to your Discord account in a future update.

<div class="account-dashboard-grid">
  <a class="account-dashboard-card" href="/account/licenses">
    <span class="account-dashboard-icon" aria-hidden="true">⌁</span>
    <strong>My licenses</strong>
    <span>View license details and manage up to three server IP addresses.</span>
    <span class="account-dashboard-action">Open licenses →</span>
  </a>
  <a class="account-dashboard-card" href="/account/products">
    <span class="account-dashboard-icon" aria-hidden="true">▦</span>
    <strong>Products purchased</strong>
    <span>Browse owned products and find other Lumen Studios plugins.</span>
    <span class="account-dashboard-action">Browse products →</span>
  </a>
  <a class="account-dashboard-card" href="/account/settings">
    <span class="account-dashboard-icon" aria-hidden="true">⚙</span>
    <strong>Account settings</strong>
    <span>Review your Discord sign-in and session information.</span>
    <span class="account-dashboard-action">Open settings →</span>
  </a>
</div>

<style>
.account-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin: 28px 0;
}

.account-dashboard-card {
  display: grid;
  min-height: 205px;
  align-content: start;
  gap: 12px;
  padding: 20px;
  border: 1px solid var(--lumen-card-border);
  border-radius: 15px;
  background: var(--lumen-card-bg);
  color: var(--vp-c-text-1);
  text-decoration: none;
  transition: border-color 160ms ease, transform 160ms ease;
}

.account-dashboard-card:hover {
  transform: translateY(-2px);
  border-color: var(--vp-c-brand-1);
}

.account-dashboard-icon {
  color: var(--vp-c-brand-1);
  font-size: 1.6rem;
}

.account-dashboard-card strong {
  font-size: 1.05rem;
}

.account-dashboard-card > span:not(.account-dashboard-icon):not(.account-dashboard-action) {
  color: var(--vp-c-text-2);
  font-size: 0.88rem;
  line-height: 1.6;
}

.account-dashboard-action {
  align-self: end;
  margin-top: auto;
  color: var(--vp-c-brand-1);
  font-size: 0.84rem;
  font-weight: 650;
}
</style>
