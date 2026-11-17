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

The customer dashboard reads account-license status, eligible product IDs, IP usage, and connected installations from the Worker. Staff-granted licenses are available through the customer's Discord account without BuiltByBit sign-in once the licensing API updater described in `worker/README.md` is installed. Dashboard grants create a private in-site notification; failed notification delivery is reported to staff without repeating the grant. Customers can also optionally check BuiltByBit purchases, copy key-free diagnostics, search reported installations, and replace the complete IP allowlist. The loyalty IP updater enables a default allowance of 3 addresses, increasing to Spark 4, Radiance 5, Nova 7 and Elite 10; a higher staff-configured allowance is preserved. The website displays the backend's actual limit, including unlimited on older installations. Removing the last IP disables validation; the interface asks for confirmation. A first marketplace claim replaces legacy per-product keys and requires updating plugin configs and server IPs.

The staff workspace at `/admin/` has customer profiles with license controls, licensing audit, and the plugin/product registry. Customer and audit lists are paginated; filters, sorting, attention counts (including active licenses expiring within 30 days), and CSV exports apply only to the loaded page or selected customer. The registry loads all pages for complete linking and grant choices. Exports omit keys and IP addresses; audit details redact credential-named fields. New license keys are masked and cleared when switching customers or signing out. Worker authorization and supported mutation routes remain the enforcement layer. These features require the configured licensing backend described in `worker/README.md`; customers see a clear maintenance/unavailable notice while verified staff retain technical diagnostics. Unavailable data is never presented as a successful empty account.

Website roles are **Guest, Client, Support team, Developer, Studio Lead, Owner**, in ascending order. **Users & roles** lets authorized staff assign only lower roles to lower-ranked users; only owners can assign Owner. **Website settings** provides saved per-role permissions, support/forum intake controls, and an access/settings audit. Support staff can grant licenses and edit IPs by default. Roles are rechecked on every request and persist in D1, independently of Discord server roles and purchase entitlements. The original owner is protected from removal. Registry permissions separately control registration, activation, unlinking, and confirmed plugin/product deletion. See `worker/README.md` for the permission catalog, delegation rules and deployment requirements.

**Plugins & products** also edits existing display names without changing IDs. The archive-based VPS needs the small plugin-editing updater documented in `worker/README.md` for plugin names; product names already work. Service status includes automatic BuiltByBit API availability and independent staff overrides.

The header keeps account navigation compact and has a separate notification bell with the full unread count. **Login / Signup** offers two Discord-backed entry tabs; verified signups persist in D1 and appear under **Users & roles** with registration and last-seen dates. The website changelog is at `/changelogs/`; automatically collected plugin release notes remain separate.

Confirmations use accessible, in-site dialogs rather than browser alert boxes; permanent staff deletions still require typing the exact ID. BuiltByBit purchase claims support the Discord identity linked on BuiltByBit, with server-side creator API access and resource mappings required as described in `worker/README.md`. Customer OAuth remains an optional alternative.

Tickets belong automatically to the verified Discord account, without a username field. Customers can edit the title and original details of their open tickets. Staff can rename tickets, assign authorized staff, add up to eight labels, and filter by assignment/status/label. Discord ticket links open the matching conversation in **Staff Dashboard**. Alerts are queued atomically with tickets, retried by the five-minute job up to five attempts, and show delivery status/retry controls to staff. Delivery is at-least-once: after an ambiguous timeout, verify Discord before manually retrying.

Run `npm run test:licensing` for expiry-boundary, allowlist, CSV, and audit-redaction checks. The Pages workflow runs these alongside the Worker tests.

**Licenses & accounts → Licenses & plugins** lists the paginated license inventory. Each customer opens into a separate **Licenses & plugins** area for grants, expiry edits, server access, and confirmed revocations, alongside **Account & verification**. Bulk give is scoped to that customer with no plugin-selection cap and a searchable live product registry, including newly registered products after refresh. Inactive or unlinked products remain visible with an explanation but cannot be granted. Select all includes every eligible product. Bulk take remains limited to 10 licenses per operation. Bulk grants preserve existing active access; uncertain/failed results stop later operations and show per-item outcomes. Taking licenses revokes them rather than deleting the customer or audit history. Expiration changes require a future date and do not issue a new key; the licensing API also reactivates suspended licenses when changing expiry, which the confirmation explains.

**Lumen Loyalty** at `/account/loyalty` counts distinct active, unexpired entitlements for active products with linked plugins in the complete licensing registry: Spark requires 3, Radiance 6 and Nova 9. Elite requires all currently eligible registered products and takes precedence over the numeric thresholds. Staff grants and trials also count while active because the licensing service does not distinguish paid purchases here. An incomplete registry can misrepresent the all-products tier, so keep it current. Customers may add signed-in Discord users as sub-clients per owned product; eligible sub-clients can download that product's private JARs, but do not receive ownership, keys, IP management, or plugin validation. Owners can remove shares after expiry. Each download rechecks owner access and current tier, suspending assignments beyond a downgraded per-plugin limit in creation order.

Tier-based IP enforcement additionally needs the VPS updater in `worker/README.md`; deploying only the website cannot change the licensing server's limits. Coupons are issued separately through BuiltByBit as documented below. Giveaways, voting, priority support and early access remain planned.

**Lumen Points** at `/account/points` is separate from staff XP and coupons. Members automatically receive a unique copyable referral code. Verified eligible BuiltByBit purchases earn 10 LP per $1 USD actually paid after discounts; historical eligible purchases are included, and fractional points are preserved. A buyer may redeem another member's code once, within 24 hours of a paid purchase. The referrer receives an additional 50% of points from eligible purchases in those preceding 24 hours; the buyer keeps all purchase points. Self-referrals and reusing a BuiltByBit account across points wallets are blocked. One-time loyalty milestone bonuses are Spark 50, Radiance 100, Nova 150, and Elite 250 LP. Daily/weekly/monthly task views track purchase and referral earnings without multiplying them; milestones never reset. The animated wallet supports pausing and reduced motion. There is no points spending or cash redemption yet. The five-minute background job credits historical purchases and milestones for registered members before their first points-page visit, in bounded batches without duplicate awards. Subsequent earnings refresh when the points page opens or **Check earnings** is used, with one-minute caching and explicit per-source verification errors.

**Member profiles** at `/members/` provide paginated name/Discord-ID search and a Discord-inspired editor: display name, bio, pronouns, custom status, accent/banner colors, HTTPS website/showcase links, favorite plugin, Discord avatar, live preview and shareable links. All profiles are automatically public, including previously unpublished profiles; identity/badges appear on forum and authorized ticket messages. **My profile** in the username dropdown opens `/account/profile` directly in owner-edit mode. No license details, private ticket content or online/activity timestamps are published. Only the signed-in owner can edit, with revision checks to prevent overwrites. Loyalty badges are server verified on profile/account loyalty refresh, expire after 24 hours without verification and cannot be edited by clients.

The home page highlights plugin browsing, setup and account access. The account dashboard presents licenses, products and support first, with other tools under **More account tools**. Profile editing starts with the basics; appearance, badges, links and servers expand separately. Invalid fields in collapsed sections reopen automatically.

Tier badges share custom SVG art across profiles, messages, the dashboard and the loyalty tier gallery: Spark's drawn lightning, Radiance's orbiting rays, Nova's starburst/constellation, and Elite's crystal crown and particles. Drawing, circuit trails and light sweeps are clipped inside the badge; names and surrounding content do not animate. Reduced-motion preferences disable these effects, and the shared motion controller pauses hidden/offscreen badges.

The **My profile** badge picker adds animated Staff shields, Developer circuit/code sigils, Studio Lead radar compasses and Owner orbital seals. Users may display any combination of their unlocked badges, including lower loyalty tiers and lower staff ranks; Owner can display all eight. The server derives staff eligibility from current website roles on every read and filters saved selections after demotion or loyalty expiry/downgrade. Badges are cosmetic: selecting Elite or any inherited staff badge never changes licensing entitlements, limits or permissions.

**Profile customization:** Spark unlocks 15 themed backgrounds (10 animated, 5 static) and 12 avatar frames; Radiance adds 12 animated avatar decorations. Higher tiers inherit the unlocks and Owner can use all cosmetics. Saved premium appearance is suppressed when verified eligibility expires, without deleting the selections. All profiles can upload a banner (PNG/JPEG/WebP input up to 8 MiB, browser-fitted without cropping and re-encoded to a static 1200 x 400 WebP, stored limit 256 KiB) and publish up to 3 Minecraft server cards with Java/Bedrock copyable addresses, versions, gamemodes, self-reported Lumen plugin labels, HTTPS logo/social/trailer links and up to 4 linked screenshots with alt text per server. Banner uploads persist only on profile save, atomically with revision checks.

Spark and higher can also set profile card, text and link colors in addition to the existing accent and banner colors. Uploaded banners appear without the default geometric overlay. Custom card colors are hidden when eligibility expires and restored when it returns.

Five selectable achievements are derived from real data: Introduced (40-character bio), Server Builder (published server card), Conversation Starter (visible public thread), Community Contributor (reply in a visible thread), and Lumen Regular (30-day-old profile). Save to unlock profile achievements, then choose them in the badge picker. Hidden/moderated activity does not count, and removed qualifying content hides its achievement. There are no fabricated giveaway, purchase or server-ownership awards. Preset motion respects reduced-motion and hidden/offscreen pauses.

Authorized staff automatically see the recoverable **Account license key** when inspecting a license, with copy/hide controls and a separate `licenses.keys` permission enabled for Support team and above by default. Inspection is audited without recording the key; responses are not cached and the displayed value clears on profile, session, or permission changes. The shared account key is not the original key of a legacy hash-only license; unrecoverable keys show an explicit explanation rather than generating a replacement.

The motion system replaces the old floating workspace, ambient waves, and default shooting stars with a 3D plugin engine, scroll-driven cube separation, circuit traces, and coordinated deployment/access/portal sequences. Shared masked heading reveals, staggered panels, pointer lighting, press feedback, unfolding menus, assistant transitions, and a route light sweep cover documentation, customer tools, and the red staff workspace. Dynamic panels are observed as they mount; keyboard focus reveals pending content immediately. Scenes pause offscreen and motion pauses in hidden tabs; reduced-motion users receive static, visible content with no pointer tilt.

If the licensing backend is unavailable, the signed-in studio owner can select **Open my editable test account** on `/admin/`. The page verifies the owner ID and role through the Worker's `/auth/me` endpoint before enabling this explicit local mode. It seeds the owner account, two synthetic products, and a test license; grants, restrictions, verification, IP changes, deletion, and audit events are simulated and saved only in this browser's local storage. Keys are labeled `TEST-ONLY-NOT-VALID` and cannot activate plugins. **Reset test data** restores the seed; **Exit test mode** returns to the real API. Mode is not automatically enabled on failure or on reload, and changing the signed-in session exits it. Discord authentication still requires a working Worker. This is a UI practice tool, not a backend substitute or an authorization bypass.

## Publishing and support workflows

**Staff center** at `/staff/` provides a command center, searchable private staff/developer guides, and a playbook for every public-catalog plugin, including coming-soon enquiry guidance. Both `/staff/` and `/admin/` use staff-only navigation and a red-and-black theme covering the logo, dashboard, scrollbars, and AI assistant; leaving the staff area restores the normal theme. The reader includes section navigation, estimated reading time, focus mode, saved guides, and read/unread filters. Saved/read preferences store guide IDs only, separately per verified staff account in this browser; guide bodies and tokens are never stored in these preferences. The shift checklist is session-only, not an audit record. The handover tool copies a blank template for completion in private tickets.

Guide access requires Support team rank or higher and `staff.docs`. Dashboard tools retain their separate permissions. Guide content is served by the authenticated Worker, not embedded in public Pages assets, docs search, or the AI assistant's Markdown corpus. Staff can enter from their account menu or Staff Dashboard. Website settings includes Guest/Client toggles for new support requests, trials, and community posts; those roles cannot receive staff privileges or product ownership through these switches.

The staff center includes separate team availability, persistent tasks, hierarchical private warnings, a commission pipeline, and guide feedback. Visible staff pages keep presence fresh; "Last online" is the last heartbeat and "Last did" is a safe label for a supported successful action. Availability is self-reported, not a response guarantee. Reply-editor leases prevent conflicting staff replies, with drafts retained on conflicts. Each ticket type has its own estimated initial response wait based on the last 30 days of actual first staff replies; fewer than three samples shows insufficient data rather than an invented estimate.

Personal dashboard widget choices persist per verified actor in this browser. Onboarding paths and practice scenarios are private, training-only, and never alter live records; practice progress is visit-only. Staff accounts automatically use a separate **server-local staff assistant** for detailed private playbooks, copy-ready Java/configuration/Maven examples, and permission-aware aggregate operations counts. Private questions and staff records are not forwarded to the public AI provider. This assistant is read-only; authorized forms still perform real changes. The Java licensing lifecycle example targets conventional Bukkit/Paper scheduling, not Folia.

Customers can select a plugin and request a trial at `/account/trials` even when the licensing service is unavailable. Requests appear in **Tickets, updates & status**, and staff receive an in-app notification. Approval grants an actual time-limited license and therefore requires license-grant permission, a working licensing API, and an active matching product linked to a plugin. Unavailable or unlinked products remain pending until configured; existing access is preserved. Closed tickets accept owner-only satisfaction ratings; staff can escalate tickets and configure unanswered-ticket reminders through the existing Discord webhook.

Staff notifications support HTTPS image links, rich formatting, and scheduled publication. Published staff updates and product releases appear at `/updates`. Formatting includes headings, bold, italic, code, and allowlisted text colors; raw HTML is not executed. The status page keeps incident history, and customers can subscribe to published known issues.

**Only give missing plugins** replaces the customer bulk-give selection with all grantable products they do not currently have active, unexpired access to, regardless of the search filter. Expired, revoked, or suspended licenses do not count as active access. The button selects products only; staff must still review and confirm the grant.

**Plugins & products** includes bulk grants (up to 10 customers per batch) and a release manager with drafts, stable/beta channels, compatibility notes, and public release notes. Each successful bulk grant sends a private notification. Existing active access is skipped; uncertain upstream results must be checked on the customer profile before retrying.

**Private plugin downloads** appear in My account and the staff release manager. Staff with product-management permission can choose a plugin and upload a trusted JAR (up to 32 MiB) directly in **Plugins & products → Product release manager**. Uploads are privately stored and verified, but are not malware-scanned; they do not create products or grant licenses. Every customer download rechecks the signed-in account's canonical active entitlement, and the browser verifies the SHA-256 fingerprint before saving. Staff can also use the optional **Build private plugin downloads** workflow when source repository access is configured. Neither uploads nor failed builds replace existing downloads.

Expiry reminders run with the five-minute job, scanning customer entitlements in bounded pages. Notifications are private and deduplicated separately for the seven-day and one-day windows. Deployment applies community migrations automatically; no new storage credentials or webhook are required.

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
