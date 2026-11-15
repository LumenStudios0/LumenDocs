---
title: Plugin licensing
description: Get a Lumen license, connect a purchase, and integrate license checks in a plugin.
---

# Plugin licensing

## Get and use a customer license

1. Sign in to the website with the Discord account that should own the license.
2. Open [My licenses](/account/licenses). Staff-granted licenses appear there without BuiltByBit sign-in. For a BuiltByBit purchase, link the same Discord account on BuiltByBit, then choose **Check Discord purchases** on the license page. If that check is unavailable, choose **Use BuiltByBit sign-in instead**.
3. Copy your shared Lumen license key from My licenses. Add the same key to the license setting in each eligible plugin; the exact config setting is plugin-specific.
4. Add your Minecraft server's public IPv4 or IPv6 address under **Manage server IPs**. Up to three unique addresses are allowed. A key with no allowed IP cannot validate.
5. Restart the server and check the plugin startup log. If it reports a license problem, open a [License support request](/reports/) with the plugin name and sanitized error message.

Keep the license key private. Never post it, a plugin token, passwords, or a full server config in a support request or public repository. If you claim a BuiltByBit purchase for the first time and receive a new shared key, replace any old keys in your plugin configs and add your server IPs again.

## Integrate licensing into a plugin

Register the plugin in the staff **Plugins & products** registry and save its one-time **Plugin ID** and **Plugin token**. Create a license product and link the plugin to it. Each product has its own **Product ID**. The product must be active and linked before licenses for it can validate.

Send validation requests from the plugin to the licensing API:

```http
POST https://license.lumenstudio.fyi/v1/validate
Content-Type: application/json
X-Plugin-Token: YOUR_PLUGIN_TOKEN
```

```json
{
  "licenseKey": "CUSTOMER_PROVIDED_KEY",
  "pluginId": "YOUR_PLUGIN_ID",
  "productId": "YOUR_PRODUCT_ID",
  "serverId": "stable-id-for-this-server"
}
```

`serverId` is optional, but use a stable identifier if you want the service to recognize the same server across checks. Read the JSON response and enable licensed features only when `valid` is `true`; an HTTP 200 response may still report an invalid license. If validation cannot be completed, do not silently grant access.

The plugin token identifies the registered plugin; it is not an administrator credential and must never be used to call admin endpoints. Tokens bundled in a JAR can be extracted, so do not treat one as a secret capable of authorizing privileged actions. Never ship the licensing administrator token or BuiltByBit credentials in a plugin.

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
