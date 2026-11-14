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

Push changes to `main` or run **Deploy documentation** from the repository’s Actions tab. GitHub Actions builds the site, waits up to one minute for uploaded artifact metadata to become visible, and publishes it to GitHub Pages.

The VitePress `base` is `/`, matching the custom domain in `docs/public/CNAME`. Keep existing routes and navigation destinations unchanged when updating the design.

The homepage layout and animations live in `docs/.vitepress/theme/HomeExperience.vue`; `docs/index.md` mounts that component. The workspace sidebar, Explore menu, and breadcrumbs are rendered by `docs/.vitepress/theme/index.ts`. Shared docs styling lives in `docs/.vitepress/theme/custom.css`, and the documentation hub is styled in `docs/docs/index.md`. Check both desktop and mobile layouts with the production preview before publishing.

## Assistant and bug reports

The assistant and admin dashboard use the Cloudflare Worker in `worker/chat.js` through the same-origin `https://lumenstudio.fyi/api/` route. Discord OAuth starts at `https://lumen-docs-assistant.lumennetwork0.workers.dev/auth/login` and returns to `/auth/callback` on that same host. Keep `workers_dev = true` in `wrangler.toml`: custom-domain routes alone do not enable this hostname. The login and callback must share a host so the browser sends the OAuth state cookie. The Worker deployment checks the live redirect to Discord and its callback/cookie configuration.

New website tickets send a short staff-dashboard link through the existing Discord webhook. Ticket details, usernames, and logs stay on the website; Discord receives only "A new ticket has been opened! Click here to open it." Configure the webhook only as a Cloudflare Worker secret, then deploy through the Worker workflow so the D1 migrations are applied:

```sh
npx wrangler secret put DISCORD_BUG_REPORT_WEBHOOK
```

Never put the webhook URL in site code, GitHub Pages variables, or committed files. If a webhook URL has been shared publicly, delete it and create a replacement before configuring the secret. Run worker tests with `npm run test:worker`.

## License workspaces

The customer dashboard reads shared-license status, verified product IDs, IP usage, and connected installations from the Worker. Customers can reconnect BuiltByBit to refresh purchases, copy key-free diagnostics, search reported installations, and replace the complete three-address allowlist. Removing the last IP disables validation; the interface asks for confirmation. A first shared-key claim replaces legacy per-product keys and requires updating plugin configs and server IPs.

The staff workspace at `/admin/` has customer profiles with license controls, licensing audit, and the plugin/product registry. Customer and audit lists are paginated; filters, sorting, attention counts (including active licenses expiring within 30 days), and CSV exports apply only to the loaded page or selected customer. The registry loads all pages for complete linking and grant choices. Exports omit keys and IP addresses; audit details redact credential-named fields. New license keys are masked and cleared when switching customers or signing out. Worker authorization and supported mutation routes remain the enforcement layer. These features require the configured licensing backend described in `worker/README.md`; customers see a clear maintenance/unavailable notice while verified staff retain technical diagnostics. Unavailable data is never presented as a successful empty account.

Website roles are **Guest, Client, Support team, Developer, Studio Lead, Owner**, in ascending order. **Users & roles** lets authorized staff assign only lower roles to lower-ranked users; only owners can assign Owner. **Website settings** provides saved per-role permissions, support/forum intake controls, and an access/settings audit. Support staff can grant licenses and edit IPs by default. Roles are rechecked on every request and persist in D1, independently of Discord server roles and purchase entitlements. The original owner is protected from removal. Registry permissions separately control registration, activation, unlinking, and confirmed plugin/product deletion. See `worker/README.md` for the permission catalog, delegation rules and deployment requirements.

**Plugins & products** also edits existing display names without changing IDs. The archive-based VPS needs the small plugin-editing updater documented in `worker/README.md` for plugin names; product names already work. Service status includes automatic BuiltByBit API availability and independent staff overrides.

Tickets belong automatically to the verified Discord account, without a username field. Customers can edit the title and original details of their open tickets. Staff can rename tickets, assign authorized staff, add up to eight labels, and filter by assignment/status/label. Discord ticket links open the matching conversation in **Staff Dashboard**. Alerts are queued atomically with tickets, retried by the five-minute job up to five attempts, and show delivery status/retry controls to staff. Delivery is at-least-once: after an ambiguous timeout, verify Discord before manually retrying.

Run `npm run test:licensing` for expiry-boundary, allowlist, CSV, and audit-redaction checks. The Pages workflow runs these alongside the Worker tests.

If the licensing backend is unavailable, the signed-in studio owner can select **Open my editable test account** on `/admin/`. The page verifies the owner ID and role through the Worker's `/auth/me` endpoint before enabling this explicit local mode. It seeds the owner account, two synthetic products, and a test license; grants, restrictions, verification, IP changes, deletion, and audit events are simulated and saved only in this browser's local storage. Keys are labeled `TEST-ONLY-NOT-VALID` and cannot activate plugins. **Reset test data** restores the seed; **Exit test mode** returns to the real API. Mode is not automatically enabled on failure or on reload, and changing the signed-in session exits it. Discord authentication still requires a working Worker. This is a UI practice tool, not a backend substitute or an authorization bypass.

## Keeping guides accurate

Commands and supported versions can vary by release, so check the notes that came with your jar. Need a license? Follow the [Discord license guide](https://lumenstudios0.github.io/LumenDocs/getting-started/licensing). Never add license keys, plugin tokens, database passwords, Discord webhooks, or other private credentials here.

## Website support and operations

**Community Support** (`/known-issues`, URL kept for old links) is a Discord-style forum. Anyone can read. Signed-in Discord users can start threads in #general, #help, #bug-reports, #suggestions, and #showcase, and reply to any thread; only staff post in #announcements. Posts show the author's Discord display name, never the Discord ID. Staff replies get the purple **Support** tag and move open threads to *answered*. Authors can mark their own threads resolved. Staff see moderation tools on each thread: pin, lock, hide/restore threads and replies, and change status. Forum data lives in D1 migration `0003_community_forum.sql`.

The **Staff Dashboard** retains `/admin/` and adds **Tickets, updates & status**, independently of the licensing backend. Customers create private website tickets at `/reports/` or `/account/tickets`; both submissions and replies require a verified Discord session. Staff can reply using reviewed presets, change ticket status, publish sanitized known issues to the **#known-issues** channel of **Community Support** (`/known-issues`), and send in-app updates or announcements to all subscribers, a selected plugin topic, or staff. Customers choose notification topics and preferences at `/account/notifications`. Notification delivery is on the website, not email or Discord.

Persistent tickets, replies, preferences, announcements, and service status use the Worker's `COMMUNITY_DB` D1 binding. The Worker workflow provisions the `lumen-community` database and applies migrations before deployment; the Cloudflare deployment token needs D1 edit permission in addition to Worker edit permission. Missing storage or denied access is reported explicitly rather than shown as an empty successful result. Public known-issue posts require staff moderation, and public views do not expose customer identities or private tickets.

An older Worker returns `Not found` for new `/community/*` routes. The website treats that as a missing service connection, not a missing customer ticket. Reports check readiness before enabling Send; unavailable ticket, notification, and staff controls remain disabled, with a connection recheck and Discord support link. A genuine `Ticket not found` response for a private conversation remains a normal ownership/not-found error. The site does not invent healthy service statuses or pretend unsent tickets were saved.

| Feature | Required connection |
| --- | --- |
| Documentation, navigation, compatibility checker, local error search, bookmarks, music and paper lanterns | No Worker |
| Discord sign-in and verified staff/owner access | OAuth Worker and Discord credentials |
| Website tickets, replies, edits, assignment/labels, Community Support forum and known issues, in-app notifications/preferences | Updated website Worker and migrated D1 database |
| Live service status, automatic probes and staff overrides | Updated website Worker, D1 and five-minute cron |
| New-ticket Discord alerts | Website Worker/D1 plus `DISCORD_BUG_REPORT_WEBHOOK` secret |
| Licenses, purchase linking, product ownership, IPs, connected servers, account directory/deletion and staff license controls | Worker plus HTTPS licensing API and its server-only credentials; purchase linking also needs BuiltByBit OAuth |
| Remote AI answers | Worker and configured AI-provider credentials; local docs search needs no Worker |

`/status` shows reachability probes and staff maintenance overrides. Automatic checks run every five minutes, within the requested 1–10-minute window; the status page refreshes every five minutes while visible. Manual overrides remain until staff switch back to Automatic. Probes check website reachability, the Discord OAuth redirect, and licensing availability—not every plugin or customer's Minecraft server.

Status badges keep text labels and use light/dark palettes: operational/resolved green, degraded/waiting amber, outage red, maintenance purple, unknown/closed slate, open blue, and investigating orange. Effective and automatic service results are colored separately so overrides do not hide the probe result.

Staff replies use a purple outlined card and a SUPPORT tag beside the author name in customer and staff conversations. This distinction uses the server-provided reply staff flag, not the viewer's role or the author's display name.

The compatibility checker at `/getting-started/compatibility` covers identified studio plugins and upcoming/unverified projects using pinned repository manifest evidence. It distinguishes declared Java/API/dependency requirements from actual runtime testing. `/error-guides` searches known messages locally, without uploading logs. Documentation bookmarks at `/bookmarks` also remain in local browser storage and need no sign-in. Run `npm run test:website`, `npm run test:licensing`, and `npm run test:worker` before publishing.
