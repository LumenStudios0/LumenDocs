# Lumen Studios Docs

The Lumen Studios plugin guides, built with VitePress. Read them at [lumenstudio.fyi](https://lumenstudio.fyi/).

Features include beautiful UI animations, Discord authentication, and an AI-powered assistant.

## Local development

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run docs:dev
```

VitePress prints the local address when the dev server starts. Create and preview a production build with:

```sh
npm run docs:build
npm run docs:preview
```

## Publishing

Push changes to `main` or run **Deploy documentation** from the repository’s Actions tab. GitHub Actions builds the site and publishes it to GitHub Pages.

The VitePress `base` is `/`, matching the custom domain in `docs/public/CNAME`. Keep existing routes and navigation destinations unchanged when updating the design.

The homepage layout and animations live in `docs/.vitepress/theme/HomeExperience.vue`; `docs/index.md` mounts that component. The workspace sidebar, Explore menu, and breadcrumbs are rendered by `docs/.vitepress/theme/index.ts`. Shared docs styling lives in `docs/.vitepress/theme/custom.css`, and the documentation hub is styled in `docs/docs/index.md`. Check both desktop and mobile layouts with the production preview before publishing.

## Assistant and bug reports

The assistant and admin dashboard use the Cloudflare Worker in `worker/chat.js` through the same-origin `https://lumenstudio.fyi/api/` route. Discord OAuth starts at `https://lumen-docs-assistant.lumennetwork0.workers.dev/auth/login` and returns to `/auth/callback` on that same host. Keep `workers_dev = true` in `wrangler.toml`: custom-domain routes alone do not enable this hostname. The login and callback must share a host so the browser sends the OAuth state cookie. The Worker deployment checks the live redirect to Discord and its callback/cookie configuration.

Configure the Discord webhook only as a Cloudflare Worker secret, then deploy the worker:

```sh
npx wrangler secret put DISCORD_BUG_REPORT_WEBHOOK
npx wrangler deploy
```

Never put the webhook URL in site code, GitHub Pages variables, or committed files. If a webhook URL has been shared publicly, delete it and create a replacement before configuring the secret. Run worker tests with `npm run test:worker`.

## License workspaces

The customer dashboard reads shared-license status, verified product IDs, IP usage, and connected installations from the Worker. Customers can reconnect BuiltByBit to refresh purchases, copy key-free diagnostics, search reported installations, and replace the complete three-address allowlist. Removing the last IP disables validation; the interface asks for confirmation. A first shared-key claim replaces legacy per-product keys and requires updating plugin configs and server IPs.

The staff workspace at `/admin/` has customer, license inventory, audit, and product registry views. Lists are paginated; filters, sorting, attention counts (including active licenses expiring within 30 days), and CSV exports apply only to the loaded page or selected customer. Exports omit keys and IP addresses; audit details redact credential-named fields. New license keys are masked and cleared when switching customers or signing out. Existing Worker authorization and supported mutation routes remain the enforcement layer. These features require the configured licensing backend described in `worker/README.md`; an unavailable service is shown as an error, not an empty successful result.

Run `npm run test:licensing` for expiry-boundary, allowlist, CSV, and audit-redaction checks. The Pages workflow runs these alongside the Worker tests.

If the licensing backend is unavailable, the signed-in studio owner can select **Open my editable test account** on `/admin/`. The page verifies the owner ID and role through the Worker's `/auth/me` endpoint before enabling this explicit local mode. It seeds the owner account, two synthetic products, and a test license; grants, restrictions, verification, IP changes, deletion, and audit events are simulated and saved only in this browser's local storage. Keys are labeled `TEST-ONLY-NOT-VALID` and cannot activate plugins. **Reset test data** restores the seed; **Exit test mode** returns to the real API. Mode is not automatically enabled on failure or on reload, and changing the signed-in session exits it. Discord authentication still requires a working Worker. This is a UI practice tool, not a backend substitute or an authorization bypass.

## Keeping guides accurate

Commands and supported versions can vary by release, so check the notes that came with your jar. Need a license? Follow the [Discord license guide](https://lumenstudios0.github.io/LumenDocs/getting-started/licensing). Never add license keys, plugin tokens, database passwords, Discord webhooks, or other private credentials here.
