# Optional AI assistant backend

The documentation site is hosted on GitHub Pages, which cannot keep an AI API key private or run server code. This Cloudflare Worker keeps the DeepSeek key server-side and limits requests to the documentation origin.

1. Install Wrangler and authenticate to the Cloudflare account that will host the Worker.
2. Revoke the key shared in chat and create a fresh one. From the repository root, store the new DeepSeek key as a Worker secret with `npx wrangler secret put DEEPSEEK_API_KEY`. Paste the key only into Wrangler's secure prompt; do not put it in a file, build variable, or commit.
3. Deploy the Worker with `npx wrangler deploy`.
4. The GitHub Pages workflows build the site with the same-origin `https://lumenstudio.fyi/api/chat` endpoint configured in `.github/workflows/deploy.yml` and `.github/workflows/refresh-changelogs.yml`.
5. Push a commit to `main` to rebuild the GitHub Pages site with the endpoint configured.

Browser API requests use the same-origin `https://lumenstudio.fyi/api/` route so the docs site and Worker API work under restrictive browser policies. Discord login starts on the Worker domain so its secure OAuth state cookie is available at the callback. The Worker accepts requests only from the explicitly configured Lumen origins (`https://lumenstudio.fyi`, `https://www.lumenstudio.fyi`, and `https://lumenstudios0.github.io`), limits each IP to 10 questions per minute, bounds question and documentation-context sizes, and does not log prompts or provider responses. The assistant sends the question and matching documentation excerpts to DeepSeek when enabled; the page's local guide search remains the fallback if no endpoint is configured.

## Bug, compatibility, and feature reports

`POST /bug-report` and `POST /reports` are compatibility aliases for signed-in community ticket creation, not anonymous Discord webhook APIs. They accept the older report payloads, require a valid Discord session, use the community D1 store and its rate limiter, and return the normal `{ "ticket": ... }` response. `/bug-report` creates a bug ticket; `/reports` accepts bug, compatibility, or feature reports. Compatibility submissions still require a recognized test result. The supplied Discord username is ignored in favor of the verified account, and any supplied product/license key is discarded and never stored. Existing callers must now send `Authorization: Bearer <session>`.

All new tickets, including these aliases and private known-issue submissions, queue a Discord alert in the same D1 transaction as the ticket. The existing `DISCORD_BUG_REPORT_WEBHOOK` secret receives only a short link to `/admin/?ticket=<id>`, never customer identities or report contents, and never mentions Discord users/roles. Apply `0002_ticket_routing.sql` through the Worker deployment workflow. Failed delivery does not undo a saved ticket: the scheduled five-minute checks retry pending alerts, with a five-attempt bound and a lease to prevent concurrent sends. Delivery is at-least-once; a timeout can be ambiguous. Staff see delivery diagnostics and should check Discord before retrying.

`PUT /community/tickets/<id>` lets only the ticket owner edit its `title` and `body` while not closed. It cannot change routing or identity. Staff `PUT /community/staff/tickets/<id>` accepts `status`, optional `title`, `assigneeId` (an authorized staff ID or `null`), and `labels` (up to eight 30-character labels). Labels are normalized to lowercase and visible to the owner. `GET /community/staff/members` returns the authorized assignment directory and current staff ID. The staff queue supports `status`, `assigned=all|unassigned|<staff-id>`, and `label` filters. `POST /community/staff/tickets/<id>/alert` retries a pending/failed alert, never an already-sent alert. Every staff route rechecks Discord authorization.

Customer licensing responses mask server/configuration failures with a maintenance/unavailable description. Staff retain the original diagnostics, including when using the customer license page. Authorization and form-validation failures remain explicit; failed requests never imply saved edits or valid licenses.

## Discord sign-in

Discord sign-in is optional and does not restrict access to the documentation. It uses the Worker endpoint embedded by the Pages workflow; the Discord access token stays on the Worker. Customer sessions persist in browser local storage and expire after 30 days of inactivity; staff sessions expire after 8 hours. Active sessions are renewed before expiry, and signing out clears the stored token.

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and open **OAuth2**.
2. Add the exact redirect URI `https://YOUR-WORKER-HOST/auth/callback`, replacing `YOUR-WORKER-HOST` with the deployed Worker host. Save the OAuth2 page.
3. From the repository root, configure the Worker secrets. Wrangler prompts securely for each value:

   ```sh
   npx wrangler secret put DISCORD_CLIENT_ID
   npx wrangler secret put DISCORD_CLIENT_SECRET
   npx wrangler secret put AUTH_SIGNING_SECRET
   ```

   Use the application's client ID and client secret for the first two values. Generate a random value of at least 32 characters for `AUTH_SIGNING_SECRET` (for example, `openssl rand -hex 32`); never commit it or put it in a Pages build variable.
4. Deploy the Worker with `npx wrangler deploy`.
5. Confirm the GitHub Pages workflows use the deployed Worker URL followed by `/chat`, then rebuild and deploy the GitHub Pages site.

The Worker uses Discord's `identify` scope, validates OAuth state with a short-lived HttpOnly cookie, and signs a persistent browser session. Customer sessions are stored in browser local storage and expire after 30 days of inactivity; `/auth/me` renews them while they're active. Staff sessions expire after 8 hours and refresh during use. Signing out clears the saved browser session. Tokens stay in the browser and are never embedded in the Pages build. The Pages workflow does not deploy Worker changes.

The header's **Login / Signup** dialog has separate tabs, both backed by verified Discord OAuth rather than a second password system. The first successful OAuth callback saves the account to `COMMUNITY_DB` before issuing the website session; a database failure reports an explicit error instead of claiming signup succeeded. Repeated sign-ins update the verified profile and last-seen time without duplicating accounts or resetting roles. `/auth/me` also refreshes this directory entry. **Staff Dashboard → Users & roles** shows recorded registration and last-seen dates. Migration `0005_member_registration.sql` adds the first-recorded registration date; historical signup dates are not reconstructed.

The compact account menu links to My account, support tickets and (when authorized) Staff Dashboard, plus Sign out. Licenses, purchases and account settings remain in My account. A separate bell shows recent notifications and the exact unread total, polls once per minute while the page is visible, and refreshes after read/preference changes. Notification failures show an unavailable indicator rather than a false zero.

## Staff admin dashboard and license service

The customer menu shows **Staff Dashboard** only when the Worker confirms the signed-in Discord account has `dashboard.view`. The original owner ID `1400375985211441242` is permanently protected. The existing studio lead ID `1012053634911064114` defaults to Studio Lead; optional `ADMIN_DISCORD_IDS` default to Support team, not unrestricted administrators. Saved website role assignments override these defaults except for the protected original owner. Access is checked again on every admin API request; a hidden menu link is not an authorization control.

The Worker proxies a narrow allowlist of customer, license, product, and audit routes to the licensing API. The licensing administrator token is held only as a Worker secret and is never sent to or embedded in the Pages site. Admin mutations are audited by Discord ID and role. Account bans and holds block future license validation; they do not revoke license records or end an already-issued one-hour website session. Verification requests are recorded in the licensing service; a customer notification is not sent by this integration.

The staff directory displays customers who have synced a Discord username to a non-deleted website account; legacy license records remain in the licensing database but are not shown until the customer signs in. The website syncs verified Discord profiles on sign-in or page load, and **Account Settings** can retry the sync. Directory counts and pagination still include unsynced licensing records. Staff grant licenses from a dropdown of documented plugins: only unambiguous, active registered products with a linked plugin are selectable. The grant is stored in the same API used by the Discord bot; it does not send the key to Discord. Customers can delete their own account from **Account Settings**, and staff can delete it from the admin profile. Deletion revokes active licenses, removes their allowed IPs and server/Minecraft bindings, erases the stored Discord username, and retains minimal license/audit history.

In **Staff Dashboard → Plugins & products**, appropriately permitted staff can register plugins, create products, and link an existing plugin to an existing product. The screen loads all registry pages and writes to the same database used by the Discord bot. Start from a documented plugin to fill the names and suggested IDs, but verify the plugin ID against the exact ID embedded in the distributed jar. Save a newly issued plugin token securely before leaving or refreshing the screen: it is displayed only for that registration and is not saved in browser storage. Registration does not modify jars, publish documentation, or rotate existing tokens.

Reuse existing products instead of creating duplicates, then link the plugin to its product. Linking extends access for existing licenses of that product, so the dashboard asks for confirmation. Matching active, documented products become grantable from customer profiles; coming-soon or ambiguous matches remain disabled. Local test mode intentionally disables registry writes. The backend must support `GET|POST /v1/admin/plugins`, `GET|POST /v1/admin/products`, and `POST /v1/admin/products/{product_id}/plugins/{plugin_id}`.

Existing plugin/product cards have **Edit**, activation and permanent deletion controls, gated by the corresponding manage/delete permissions. Editing changes the display name (1–120 characters); IDs stay fixed because jars, links and licenses reference them. The Worker permits only `name` and/or boolean `active` for `PATCH /v1/admin/{plugins|products}/{id}` and checks that a successful name update was actually applied. Renaming does not rotate tokens, alter links or grant licenses. Products with legacy IDs matched only by their old display name may need their documented name restored to remain selectable in the documented grant dropdown.

Registry removal has separate permissions for activation, unlinking, and deletion. Deactivate each linked product, unlink its plugin, then delete the unlinked plugin; the dashboard never performs these destructive steps automatically. Deletion requires typing the ID. Product deletion is also available, but the backend refuses it while any license records reference the product. `DELETE` is permitted on individual plugins, products and product/plugin links. Token rotation and arbitrary registry fields remain unavailable.

The archive-based VPS API already supports product names, but its original plugin PATCH accepts only activation. To enable plugin names, run this on the VPS:

```bash
cd /opt/lumen-license
curl --fail --show-error --location https://raw.githubusercontent.com/LumenStudios0/LumenDocs/main/scripts/upgrade-plugin-editing.py -o /tmp/lumen-plugin-editing.py
python3 /tmp/lumen-plugin-editing.py backend
docker compose up -d --build --no-deps api bot
```

The updater validates both source files before editing, preserves `.before-plugin-editing.bak` backups, and is safe to rerun on an already-updated installation. It refuses unknown source layouts rather than guessing; review those manually. It changes no database schema, IDs, secrets, tokens or migration files. Without this VPS update, plugin-name edits show an explicit upgrade error; activation/deletion and product-name editing still work.

### Website roles and saved permissions

The six fixed ranks are **Guest < Client < Support team < Developer < Studio Lead < Owner**. One website role applies to each signed-in Discord user. These are not Discord server roles, licenses, or proof of a purchase; unassigned visitors default to Guest, and Client is assigned explicitly.

| Preset | Default staff capabilities |
| --- | --- |
| Guest, Client | No Staff Dashboard access; normal signed-in customer features remain available |
| Support team | Customer/license reads, grants, license status/IP changes, verification, licensing audit, registry reads, ticket reads/replies/routing/alert retries, forum moderation and lower-role assignment |
| Developer | Support permissions plus plugin registration/activation, product creation/activation/linking/unlinking, known issues, notifications, announcements and service status |
| Studio Lead | All preset permissions, but may manage only lower roles and users |
| Owner | All permissions; may assign any role. The original owner cannot be changed and Owner permissions are immutable |

Use **Users & roles** (`roles.assign`) to search verified website identities or enter a Discord ID. Users appear after their next verified `/auth/me` request. Non-owners cannot change themselves, peers, or higher-ranked users, assign their own/higher role, or delegate a role containing permissions they do not hold. Owner may create additional owners without risking the protected original account.

Use **Website settings** (`settings.view`) to inspect role permissions. `settings.roles` additionally permits editing strictly lower roles, but never granting permissions the editor does not possess. The complete permission catalog and preset definitions are in `shared/permissions.mjs`. Each role has an independent saved set; changing a lower role does not rewrite higher roles. `dashboard.view` is required for staff API areas, and useful license-grant access also needs `customers.view` and `plugins.view`. `audit.view` is optional when inspecting customers. Permission changes are read on every request, not trusted from a JWT or browser storage; existing sessions immediately lose revoked capabilities. **Refresh my permissions** updates visible controls.

`settings.site` allows pausing new support tickets/issue submissions and making the forum read-only, with editable customer-facing messages. Existing tickets and replies remain available; ticket managers and forum moderators may continue working. `settings.audit` grants the paginated website access/settings history, independent of the licensing audit. Each mutation and its audit entry commit atomically, and revision checks reject stale saves rather than overwriting another staff member's changes.

Role assignments, role permission overrides, settings, and their audit records persist in the existing `COMMUNITY_DB` via migration `0004_website_access.sql`. Deploy through the Worker workflow to apply it before activating the code. A configured database error fails authorization closed rather than restoring defaults. Without a database binding only environment bootstrap roles work; settings explicitly report the missing database. No new VPS credentials or backend migrations are needed for website roles.

To connect the dashboard after the licensing API is available over HTTPS:

1. Deploy the updated licensing service and apply its database migration (`alembic upgrade head`, or rebuild and restart the updated Docker Compose stack, which applies migrations during API startup). A healthy `/healthz` alone does not mean the installed API supports customer accounts: check its `/openapi.json` for `/v1/admin/users` and `/v1/admin/users/{discord_id}/identity`. Preserve the existing `.env` and database volume when upgrading. Keep the API private behind HTTPS and ensure its `ADMIN_API_TOKEN` is configured.
2. Set `LICENSE_API_URL` to the licensing API's HTTPS base URL and set `LICENSE_ADMIN_API_TOKEN` to the exact `ADMIN_API_TOKEN` configured in the VPS `.env`. Cloudflare Workers cannot fetch bare IP addresses (error 1003), so use the hostname `https://license.lumenstudio.fyi`: a **DNS only** `A` record pointing at the VPS (`178.238.238.15`), served by the licensing repo's Caddy `API_HOSTNAME` site. Plugins keep using the IP. First confirm `https://license.lumenstudio.fyi/healthz` returns `{"status":"ok"}`. The **Licensing connection diagnostics** workflow checks the Worker secrets, DNS, and reachability, and its `set-worker-url` action sets `LICENSE_API_URL` once the hostname answers. In **Cloudflare → Workers & Pages → lumen-docs-assistant → Settings → Variables and Secrets**, add `LICENSE_API_URL` as a Worker setting and `LICENSE_ADMIN_API_TOKEN` as a secret. Never paste the administrator token into an AI chat, Pages variable, source file, or this repository. Alternatively, with authenticated Wrangler, use:

   ```sh
   npx wrangler secret put LICENSE_API_URL
   npx wrangler secret put LICENSE_ADMIN_API_TOKEN
   ```

   Enter the HTTPS API base URL and the same administrator token used by the licensing API.
3. If adding other staff, set `ADMIN_DISCORD_IDS` in `wrangler.toml` to comma-separated Discord account IDs. The two built-in owner accounts are always authorized.
4. Deploy the Worker with `npx wrangler deploy`, then push the site changes so GitHub Pages builds the `/admin/` dashboard. The Pages workflow embeds the deployed Worker `/chat` endpoint at build time.
5. Apply the licensing backend changes and run its tests before using account controls. To remove an entitlement, revoke its license; records are retained for audit history. Each license supports at most three numeric IPv4/IPv6 addresses.

If the dashboard says `LICENSE_SERVICE_UNAVAILABLE`, one or both Worker settings are missing. If both are present but calls time out, check that `/healthz` is reachable from the public internet over HTTPS and that ports 80 and 443 are open on the VPS. GitHub Pages deployment alone does not configure the Worker secrets or deploy the licensing backend.

## BuiltByBit purchase claims and customer license controls

The customer portal can verify BuiltByBit purchases, issue one shared key across mapped Lumen products, and manage its server IP allowlist. It requires the updated licensing backend and a separately deployed Worker; GitHub Pages deployment alone does not enable these controls.

- `GET /account/servers` — connected servers for the signed-in Discord account.
- `GET /account/license-key` — retrieve the customer's shared key.
- `GET /account/license-ips` — retrieve the shared key's allowed IP addresses.
- `PUT /account/license-ips` — replace its allowlist with at most three unique IPv4/IPv6 addresses.

Customer routes require a valid `Authorization: Bearer <session>` header and are rate limited by account. The Worker derives the customer ID from the signed Discord session; browser-supplied IDs are never used. The administrator credential stays server-side, and customer IP changes are audited by the licensing API.

1. In the BuiltByBit developer dashboard, create an OAuth application with permission to read the signed-in buyer's licenses. BuiltByBit's V2 buyer-license endpoint may require an active Ultimate upgrade and the appropriate API access. Set the exact OAuth redirect URI to `https://lumenstudio.fyi/account/licenses/`. Confirm any required OAuth/API scopes in the dashboard and configure the optional `BUILDBYBIT_OAUTH_SCOPE` Worker variable if needed.
2. Apply the licensing backend's `0008_builtbybit_entitlements` migration and configure its `.env`:

   ```dotenv
   CUSTOMER_LICENSE_SECRET=REPLACE_WITH_A_STABLE_RANDOM_SECRET
   BUILDBYBIT_RESOURCE_PRODUCTS={"7001":"auction","7002":"duels"}
   ```

   Replace the example resource IDs and product IDs with the actual BuiltByBit IDs and registered Lumen product IDs. Generate the secret with `openssl rand -hex 32`; keep it stable and private.
3. From the documentation repository root, store the OAuth credentials as Worker secrets:

   ```sh
   npx wrangler secret put BUILDBYBIT_CLIENT_ID
   npx wrangler secret put BUILDBYBIT_CLIENT_SECRET
   ```

   Set `BUILDBYBIT_RESOURCE_IDS` as a comma-separated Worker variable containing only the resource IDs configured on the backend, such as `7001,7002`. Optionally set `BUILDBYBIT_REDIRECT_URI` to the exact registered callback; by default the Worker uses `https://lumenstudio.fyi/account/licenses/`.
4. Configure `LICENSE_API_URL` and `LICENSE_ADMIN_API_TOKEN` as Worker secrets following the licensing-service section above. The API must be reachable over HTTPS, and the token must match the backend's administrator token.
5. Deploy the Worker with `npx wrangler deploy`, then publish the documentation changes through the GitHub Pages workflow. Sign in with Discord, visit **My licenses**, connect the matching BuiltByBit buyer account, claim the key, and add the public IP address of each server.

**Important migration behavior:** the first claim revokes that customer's existing active per-product licenses. Customers must replace old keys in every plugin config and add the public server IPs again under **My licenses**. A key with no allowed IP does not validate. Reconnecting BuiltByBit refreshes entitlements; ended purchases are removed on the next customer refresh, because the integration does not receive marketplace webhooks. Back up the database and communicate this behavior before enabling claims for existing customers.

## Deploying Worker updates

The GitHub Pages workflow does not deploy `worker/chat.js`. The separate **Deploy Cloudflare Worker** workflow deploys Worker changes when `worker/**` or `wrangler.toml` changes. To authorize it, add these values under the LumenDocs repository's **Settings → Secrets and variables → Actions**:

- Repository secret `CLOUDFLARE_API_TOKEN`: create a Cloudflare API token with **Workers Scripts: Edit** and **D1: Edit** permissions for the account that owns this Worker. Do not paste the token into chat or commit it.
- Repository variable `CLOUDFLARE_ACCOUNT_ID`: copy the account ID from the Cloudflare dashboard's account overview.

The workflow finds or creates the `lumen-community` D1 database, fills the generated database ID into the runner's Wrangler configuration, applies remote migrations, and only then deploys. Provisioning and migration failures stop deployment. The committed Wrangler config intentionally has a placeholder database ID; deploy through this workflow rather than running Wrangler directly from a clean checkout. After saving both settings, open **Actions → Deploy Cloudflare Worker → Run workflow** on `main`. Subsequent Worker code changes deploy automatically on pushes to `main`.

## Community support, issues, notifications, and status

The Worker community API is backed by the independent `COMMUNITY_DB` D1 database; it does not depend on the licensing service. If the binding is missing, community requests return `COMMUNITY_SERVICE_UNAVAILABLE` rather than using in-memory or mock storage. Discord sign-in sessions and the existing origin checks authorize customer and staff routes. Customer tickets and submitted issues remain private until staff publish an issue. Ticket replies, moderation, notification preferences/reads, and manual status overrides persist in D1.

- Public: `GET /community/issues?page=1&pageSize=20`, `GET /community/status`.
- Signed-in customer: `GET|POST /community/tickets`, `GET /community/tickets/{uuid}`, `POST /community/tickets/{uuid}/replies`, `POST /community/issues`, `GET|PUT /community/preferences`, `GET /community/notifications`, and `POST /community/notifications/{uuid}/read`.
- Staff: `GET /community/staff/tickets`, `PUT /community/staff/tickets/{uuid}`, `GET|POST /community/staff/issues`, `PUT /community/staff/issues/{uuid}`, `GET|POST /community/staff/notifications`, `PUT /community/staff/status/{website|discord|licensing|builtbybit}`, and `POST /community/staff/status/check`.

Page sizes are capped at 50. Mutations and signed-in reads are rate limited; public status/issues polling is not. Ticket closures block further replies. Staff status overrides are stored separately from health-check results and remain in effect until changed to `auto`. The five-minute cron checks the public website and Discord OAuth redirect; it checks licensing with an authenticated, bounded `GET /v1/admin/products?limit=1` only when both licensing settings are configured. Health results expose only service status and timestamps, never the licensing URL or credential. Notifications are in-app only; no bot or email delivery is configured.

Notification lists also include `unreadTotal`, counted across every matching page using the same audience and preference filters as the list. Read state is stored per verified user in D1. Opening the bell does not mark alerts read; selecting a notification or using the notification center's read control does. No notification content or counters are saved in browser storage, and the bell clears on sign-out/account changes.

The cron runs every five minutes. A staff member can request an immediate health check. Set the Worker `LICENSE_API_URL` and `LICENSE_ADMIN_API_TOKEN` only if the optional licensing check should run; those values are never returned by community endpoints.

Response details: ticket creation and `GET /community/tickets/{uuid}` use `{ "ticket": { "id", "type", "title", "body", "productId", "status", "createdAt", "updatedAt" } }`; compatibility metadata is accepted and retained internally, but does not add fields to this response shape. Staff ticket objects additionally include `customerDiscordId`. Issue submissions atomically create an unpublished issue and a matching bug ticket with the same ID; `{ "submissionId", "message" }` returns that ticket ID, so the submission also appears in the customer's tickets. Preference GET/PUT return `{ "preferences": { "updates", "announcements", "ticketReplies", "products" } }`. Customer notifications include `read`; staff notification lists and staff-created notification responses additionally include `audience`. Product-targeted announcements and updates honor product filters when configured; an empty product list receives all product-targeted topics, subject to the update/announcement preference. Ticket reply notifications link to `/account/tickets?ticket={id}` and published notifications link to `/account/notifications`. Status returns `{ "services": [...], "intervalMinutes": 5 }`; each service has `id`, `name`, `status`, `automaticStatus`, `overrideStatus`, `message`, and `checkedAt`. The fixed service IDs are `website`, `discord`, `licensing`, and `builtbybit`. BuiltByBit probes its API's unauthenticated `/v2/members/self` response without sending credentials: the expected JSON 401 indicates API availability, 429 is degraded, and connection/server errors indicate outage. This is not an end-to-end purchase/OAuth check or a claim that the entire marketplace is healthy. Staff overrides work independently of automatic checks. There is no community audit endpoint or audit-feed response; licensing admin audit remains separate.

## Optional anonymous dinosaur discoverer total

The secret `/extinction` page can show a site-wide total of unique browsers that completed the dinosaur egg hunt. Without this optional D1 database, the dinosaur event still works and the page reports that its global counter is not connected.

1. Create a D1 database with `npx wrangler d1 create lumen-dino-discoveries`.
2. Add the returned database binding to `wrangler.toml`:

   ```toml
   [[d1_databases]]
   binding = "DINO_DISCOVERIES"
   database_name = "lumen-dino-discoveries"
   database_id = "YOUR_DATABASE_ID"
   ```

3. Apply the schema with `npx wrangler d1 execute lumen-dino-discoveries --remote --file=worker/migrations/0001_dinosaur_discoverers.sql`.
4. Deploy the Worker with `npx wrangler deploy`.
5. In GitHub, add the Actions variable `DINO_DISCOVERIES_ENDPOINT` with the deployed Worker URL plus `/dinosaur-discoveries`, for example `https://lumen-docs-assistant.example.workers.dev/dinosaur-discoveries`.
6. Push a commit to `main` to rebuild the Pages site with the counter endpoint.

The browser creates one random ID and retains it in local storage. The Worker hashes that ID before storing it in D1, so only a unique-browser total and discovery timestamp are retained; raw IDs and IP addresses are not stored. This is an approximate browser count, not a count of verified individual people.
