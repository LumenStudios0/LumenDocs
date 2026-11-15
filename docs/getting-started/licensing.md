---
title: Plugin licensing
description: Get a Lumen license, connect a purchase, and set up server IPs.
---

# Plugin licensing

## Get and use a customer license

1. Sign in to the website with the Discord account that should own the license.
2. Open [My licenses](/account/licenses). Staff-granted licenses appear there without BuiltByBit sign-in. For a BuiltByBit purchase, link the same Discord account on BuiltByBit, then choose **Check Discord purchases** on the license page. If that check is unavailable, choose **Use BuiltByBit sign-in instead**.
3. Copy your shared Lumen license key from My licenses. Add the same key to the license setting in each eligible plugin; the exact config setting is plugin-specific.
4. Add your Minecraft server's public IPv4 or IPv6 address under **Manage server IPs**. Up to three unique addresses are allowed. A key with no allowed IP cannot validate.
5. Restart the server and check the plugin startup log. If it reports a license problem, open a [License support request](/reports/) with the plugin name and sanitized error message.

Keep the license key private. Never post it, a plugin token, passwords, or a full server config in a support request or public repository. If you claim a BuiltByBit purchase for the first time and receive a new shared key, replace any old keys in your plugin configs and add your server IPs again.

<p class="license-cta">
  <a href="/reports/">Open the Support center <span aria-hidden="true">→</span></a>
</p>

<style>
.license-cta a {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  margin: 8px 0;
  padding: 12px 18px;
  border: 1px solid rgba(156, 115, 255, .4);
  border-radius: 10px;
  background: rgba(123, 63, 242, .14);
  color: #c0a3ff;
  font-weight: 600;
  text-decoration: none;
}
.license-cta a:hover { background: rgba(123, 63, 242, .24); }
</style>
