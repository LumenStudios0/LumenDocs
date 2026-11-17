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

The eight fixed ranks are **Guest < Client < Jr Support < Support < Sr Support < Developer < Studio Lead < Owner**. One website role applies to each signed-in Discord user. These are not Discord server roles, licenses, or proof of a purchase; unassigned visitors default to Guest, and Client is assigned explicitly.

| Preset | Default staff capabilities |
| --- | --- |
| Guest, Client | No Staff Dashboard access; normal signed-in customer features remain available |
| Jr Support | Staff guides, ticket reads/replies and escalations; no license keys, license changes or account restrictions |
| Support | Jr Support capabilities, ticket routing, customer/license reads, key inspection and placing accounts on hold; also retains existing staff operations, audit/registry reads and moderation tools |
| Sr Support | Support capabilities plus license grants, permanent revocation and deletion of eligible revoked records, and customer verification requests and approvals |
| Developer | Licensing operations, plugin registration/activation, product creation/activation/linking/unlinking, known issues, notifications, announcements and service status; cannot assign roles or edit role permissions |
| Studio Lead | All preset permissions, but may manage only lower roles and users |
| Owner | All permissions; may assign any role. The original owner cannot be changed and Owner permissions are immutable |

Use **Users & roles** (`roles.assign`) to search verified website identities or enter a Discord ID. Users appear after their next verified `/auth/me` request. Non-owners cannot change themselves, peers, or higher-ranked users, assign their own/higher role, or delegate a role containing permissions they do not hold. Owner may create additional owners without risking the protected original account.

Use **Website settings** (`settings.view`) to inspect role permissions. `settings.roles` additionally permits editing strictly lower roles, but never granting permissions the editor does not possess. The complete permission catalog and preset definitions are in `shared/permissions.mjs`. Each role has an independent saved set; changing a lower role does not rewrite higher roles. `dashboard.view` is required for staff API areas, and useful license-grant access also needs `customers.view` and `plugins.view`. `audit.view` is optional when inspecting customers. Permission changes are read on every request, not trusted from a JWT or browser storage; existing sessions immediately lose revoked capabilities. **Refresh my permissions** updates visible controls.

Migration `0019_support_roles.sql` retains existing member assignments and custom policies. Existing Support members remain Support, but safety caps immediately exclude license grants, revocation/status changes, IP changes, account bans/releases, verification and role administration even if an old saved policy contained those permissions. Only Studio Lead and Owner can assign roles or manage role permissions. Saved policies still control which allowed capabilities are enabled; legacy policies gain compatible hold, escalation and revocation permissions in memory where relevant until an administrator explicitly saves the policy. New accounts in `ADMIN_DISCORD_IDS` continue to bootstrap as Support.

Successful holds notify higher-ranked staff privately through website notifications. If alert storage cannot be checked, the hold is not sent; if alerts fail after the licensing service confirms the hold, the dashboard warns staff to notify their superiors without repeating it. License grants, revocations and deletions record key-free website audit attempts and outcomes; bulk grants retain their existing audit trail.

Deleting a license record requires `licenses.delete` and the separate VPS API update below. Revoke the license first; the deletion removes that revoked record and its legacy per-license IP records but does not erase the customer, the account key, other licenses or account-level IPs. Shared license records with linked products and legacy key records are refused to avoid breaking other access. Both the licensing service and website retain audit records. If the VPS update is absent, deletion fails with an explicit upgrade message.

Existing Sr Support policies with revocation gain deletion until an administrator explicitly saves the policy; afterward the deletion toggle can be controlled independently.

```bash
cd /opt/lumen-license
curl --fail --show-error --location https://raw.githubusercontent.com/LumenStudios0/LumenDocs/main/scripts/upgrade-license-deletion.py -o /tmp/lumen-license-deletion.py
python3 /tmp/lumen-license-deletion.py backend
docker compose up -d --build --no-deps api
```

The updater validates the archive-based API layout, creates `api.py.before-license-deletion.bak`, and is safe to rerun. It does not modify database schema or existing licenses.

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
5. Apply the licensing backend changes and run its tests before using account controls. To remove an entitlement, revoke its license; eligible revoked records can optionally be deleted after the VPS update above. Apply the loyalty IP updater below for a default account-wide limit of 3 and tier allowances of 4/5/7/10.

If the dashboard says `LICENSE_SERVICE_UNAVAILABLE`, one or both Worker settings are missing. If both are present but calls time out, check that `/healthz` is reachable from the public internet over HTTPS and that ports 80 and 443 are open on the VPS. GitHub Pages deployment alone does not configure the Worker secrets or deploy the licensing backend.

## BuiltByBit purchase claims and customer license controls

The customer portal can verify BuiltByBit purchases, issue one shared key across mapped Lumen products, and manage its server IP allowlist. It requires the updated licensing backend and a separately deployed Worker; GitHub Pages deployment alone does not enable these controls.

### Staff-granted licenses

The archive-based VPS needs the following one-time API update before staff-granted account keys and IP controls are available without BuiltByBit. It preserves keys and entitlements; it does not change the database schema.

```bash
cd /opt/lumen-license
curl --fail --show-error --location https://raw.githubusercontent.com/LumenStudios0/LumenDocs/main/scripts/upgrade-staff-license-access.py -o /tmp/lumen-staff-license-access.py
python3 /tmp/lumen-staff-license-access.py backend
docker compose up -d --build --no-deps api
```

The updater checks the installed route and refuses unknown layouts, preserves `api.py.before-staff-license-access.bak`, and is safe to rerun. Staff grants from the website dashboard produce a private license notification for the recipient even when ticket-reply alerts are disabled. Grants made outside the website dashboard do not currently generate website notifications. If notification storage fails after a grant, the dashboard warns staff to tell the customer directly and not repeat the grant.

### Recommended: linked Discord purchase checks

Customers sign in here with Discord, open their [BuiltByBit account settings](https://builtbybit.com/account/), choose **Link Discord account**, and connect that same Discord identity. They then select **Check Discord & claim key** on My licenses. Discord linking alone does not grant anything: the Worker verifies the creator's actual purchase-license records, including the buyer's linked Discord ID.

Configure these server-side prerequisites before this flow can work:

- Store `BUILDBYBIT_API_AUTHORIZATION` as a **Worker secret** in the format `Token YOUR_TOKEN`, using the token from the studio's BuiltByBit API credentials. The [V2 API](https://builtbybit.com/help/developers/v2-api/authentication/) uses `Token`, not the V1 `Private` scheme. Never put the actual token in a `VITE_` variable, source file, browser, or chat. BuiltByBit API access may require Ultimate or explicitly granted permissions.
- Set `BUILDBYBIT_RESOURCE_IDS` in `wrangler.toml` to the studio's comma-separated resource IDs (up to 50), so deployments preserve it. Keep these consistent with the licensing backend's `BUILDBYBIT_RESOURCE_PRODUCTS` resource-to-product mapping below.
- Keep `LICENSE_API_URL` and `LICENSE_ADMIN_API_TOKEN` configured, with the backend migration and stable customer-license secret described below.

`POST /account/builtbybit/discord` derives the Discord ID from the signed session, never the request body. It reads `/v2/resources/creator/licenses?with=Buyer`, checks every page (maximum 25 pages / 30 seconds), and matches the exact string `Buyer.discord_id`. Buyer IDs may be strings or safe integers, but must match the license's buyer ID. Only configured resources and a single verified buyer reach the existing backend claim endpoint. Incomplete pages, ambiguous buyers, API errors, and missing buyer details never submit a partial entitlement refresh. No creator credentials or other buyers' data are returned to the customer.

This uses the [official V2 schema](https://github.com/BuiltByBit/api-openapi-spec/blob/main/spec.yaml), including the License `Buyer` hint and Member `discord_id`. It does not depend on the older V1 Discord lookup. A buyer without any matching Lumen license record cannot be verified through this flow and must use the optional buyer OAuth flow or contact support. There is no background marketplace revocation sync; inactive license records are applied on the next successful complete check.

### Optional: buyer OAuth

- `GET /account/servers` — connected servers for the signed-in Discord account.
- `GET /account/license-key` — retrieve the customer's shared key.
- `GET /account/license-ips` — retrieve the shared key's allowed IP addresses.
- `PUT /account/license-ips` — replace its account-wide allowlist with unique numeric IPv4/IPv6 addresses. The licensing service enforces the effective allowance; the Worker does not trust browser-supplied tiers. Requests are bounded to 1,000,000 bytes independently of slot entitlement.

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
5. Deploy the Worker with `npx wrangler deploy`, then publish the documentation changes through the GitHub Pages workflow. Sign in with Discord, visit **My licenses**, choose **Use BuiltByBit sign-in instead**, connect the matching BuiltByBit buyer account, claim the key, and add the public IP address of each server.

**Important migration behavior:** the first claim revokes that customer's existing active per-product licenses. Customers must replace old keys in every plugin config and add the public server IPs again under **My licenses**. A key with no allowed IP does not validate. Reconnecting BuiltByBit refreshes entitlements; ended purchases are removed on the next customer refresh, because the integration does not receive marketplace webhooks. Back up the database and communicate this behavior before enabling claims for existing customers.

## Deploying Worker updates

**Lumen Points**

Migration `0027_lumen_points.sql` creates member wallets, globally unique referral codes, verified purchase records, one-time referrals, per-source rewards, and trigger-maintained adjustment history. Existing website members receive codes on migration; future Discord sign-ins create them automatically. Authenticated `GET /studio/points` reads only the caller's wallet. `POST /studio/points/sync` verifies earnings; `POST /studio/points/referral` accepts only a referral `code`, not client-provided amounts, timestamps, buyers or recipients.

Purchase verification uses the existing `BUILDBYBIT_API_AUTHORIZATION` secret with creator **purchases access**, plus `BUILDBYBIT_RESOURCE_IDS`. The complete paginated purchase feed must include verified `Buyer` details matching the signed-in Discord account. Only validated purchases qualify; a paid license naturally expiring does not remove earned purchase points. `FinalPrice.value` in USD, after discounts, earns 10 points per dollar; values are parsed as integer cents and stored as hundredths of a point. Unsupported currencies or malformed/incomplete feeds explicitly fail that check without mutating purchase rewards. Historical eligible purchases count. Grants/trials/free purchases alone do not generate paid-purchase points. The BuiltByBit buyer ID is uniquely pinned to one wallet; changing that buyer ID requires support rather than transferring balances automatically.

One referral redemption per buyer includes eligible paid purchases created in the preceding 24 hours at redemption; the referrer gets half their combined purchase points, without deducting any buyer points. Future purchases, tier bonuses and other referral earnings are excluded. The referral reservation, selected purchases and bonus are atomic and unique. Re-verification adjusts purchase rewards and linked referral rewards when final prices change, purchase validation is removed, or purchases disappear from a complete feed. Refund detection depends on the state exposed by the purchase feed, not a payment webhook. Reward changes append positive/negative history rather than hiding adjustments. Earnings refresh on the points page; successful checks are cached for one minute and concurrent syncs use a 90-second reservation.

Migration `0028_lumen_points_backfill.sql` adds background-attempt/error tracking. The existing five-minute cron checks up to ten registered wallets whose initial purchase or tier check has not completed, using one shared complete purchase feed per batch. This credits historical purchases and earned milestones without visiting the points page, with the same identity checks and idempotent rewards as manual sync. Failed accounts retain their balances and explicit errors and retry after 15 minutes; they do not block later members. Completed initial checks are not a recurring payment subscription. Deployment waits for the initial purchase checks and reports aggregate historical credits, without logging member identities.

**Staff-license points and member-wallet administration**

Migration `0030_staff_member_points.sql` adds staff-license grant preferences, once-per-member/product-and-resource awards, signed staff adjustments and a combined transaction view. Staff license awards use the studio-confirmed USD prices in `shared/product-marketplace.mjs`, supplied November 17, 2026; they do not depend on discover/listing-price API access. Purchase verification still uses the real validated final amounts, not catalog prices. Purchase checks include mapped catalog resources plus `BUILDBYBIT_RESOURCE_IDS`. Keep the catalog's prices and canonical resource IDs current when publishing products.

Migration `0032_points_catalog_prices.sql` adds pinned resource identity mappings and visible deferred-product lists, and queues existing wallets for the expanded catalog. If a priced product has no hardcoded resource ID but is registered in licensing, its ID is discovered once through a complete, validated `/v2/resources/creator/resources` feed. A unique exact-name/title-prefix match is required; that identity is pinned before checking purchases, preventing a newly discovered product from receiving both purchase and gift credit. Creator resource-read access is needed only for such unresolved identities. Products without a published price remain visibly deferred without blocking priced licenses or inventing a zero/default reward.

The licensing API does not expose dependable grant provenance, so historical eligibility uses current active canonical ownership without a known purchase, approved website trial, points-shop free-product order, or opt-out. New single and bulk grants default `giveLumenPoints` to true; only booleans are accepted. This website-only flag is never forwarded to the VPS. Preferences are saved before attempting a grant to prevent unchecked gifts being credited during an uncertain response; confirmed grants also queue another check. Bulk retry identity includes the saved flag. The checkbox controls license-value awards; loyalty milestone bonuses remain independent.

Gift points are awarded once at the published catalog price and persist after expiry, catalog-price changes or later opt-out. Revoke/regrant and aliases for the same marketplace resource cannot farm awards. Known purchases, including zero-value and unvalidated records, are not topped up as gifts. If a genuine purchase is recorded after an already-awarded gift, triggers reconcile the gift contribution to the difference between its original value and total purchase credit, preventing double credit. Gift awards never qualify for referral bonuses. Initial staff-license checks join the existing bounded five-minute historical backfill.

`GET /studio/staff/points/{discordId}?page=1` returns the balance and every earned, spent, refunded and staff-adjusted transaction in 25-item pages. `POST` to the same route accepts a stable UUID `requestId`, `action` (`give`/`take`), a decimal-string `points` value (0.01 to 1,000,000), and a member-visible `reason` (5-500 characters). Current Support-or-higher rank, dashboard/customer access, `points.manage`, and staff level 2 are checked server-side; Leads/Owner bypass the level requirement. This permission does not require or grant `licenses.grant`. Only Owner may self-adjust. Atomic deductions cannot exceed available points; adjustments, audit entries and notifications commit together. The UI saves pending requests per actor/member in tab storage and reuses their IDs after failed responses.

Migration `0031_points_notifications.sql` sends private notifications for positive earnings, staff-license/manual adjustments and returned shop points. Previous positive earnings/refunds receive one deterministic-ID retrospective notice without changing balances. Notification read routes accept these bounded prefixed IDs as well as UUIDs, retaining recipient authorization. Financial notices remain visible when generic update/ticket alerts are disabled. The deployment publishes `worker/public-updates/2026-11-17.sql` only after credit verification, with a stable announcement ID so redeployment does not repeat the public roundup. Its all-member update audience follows saved update preferences; no private financial notices enter the public feed.

**Points shop**

`/account/points/shop` offers single-use 5%/10% BuiltByBit coupons (100/160 LP), a free missing plugin (1,500 LP), +1 account IP slot (750 LP), three permanent badges (250/350/500 LP), two permanent profile effects (300/600 LP), and a small custom plugin request (4,500 LP). The catalog and prices are server-controlled in `shared/points-shop.mjs`.

- `GET /studio/points/shop` returns the signed-in member's spendable balance, catalog, owned cosmetics and latest 50 orders. Staff with dashboard and license-grant permissions also receive up to 100 open fulfillment requests.
- `POST /studio/points/shop/redeem` accepts a stable UUID `requestId` and `productId`, plus `pluginId` for a free product or a 20–2,000-character `description` for a commission. The browser saves each in-flight purchase in actor-scoped tab storage before submitting and reuses it on retry.
- `POST /studio/points/shop/fulfill` requires dashboard and license-grant permissions, an `orderId`, `state` (`fulfilled` or `refunded`) and a delivery reference/refund reason. Only pending staff-fulfilled orders can change. Fulfillment/refunds are audited and notify the buyer.

Migration `0029_lumen_points_shop.sql` adds orders, permanent cosmetic entitlements, spending/refund journal triggers and a spendable-balance view. Order reservation and balance checks are atomic; completed rewards are not silently reissued. Spending appears in the main points history. Later marketplace corrections may produce a negative available balance, which blocks further spending rather than hiding debt.

Shop coupons reuse the existing verified BuiltByBit creation/reconciliation flow and appear in Coupons. Confirmed creation rejection returns reserved points; ambiguous upstream delivery retains the charge for reconciliation and never automatically reissues the coupon. Stale pre-creation reservations without any coupon record refund safely after 15 minutes; stale issuing coupon records become uncertain for normal scope-verified reconciliation.

Free products, IP slots and small commissions notify **every saved staff rank above Client**, including protected/bootstrap staff. They are staff-fulfilled requests, not automatic licensing mutations: staff must grant the selected license, apply one extra account IP allowance in the licensing system, or complete the agreed small commission before recording delivery. Undelivered requests can be refunded once. Free shop products earn no purchase points and are excluded from future point-milestone eligibility; they still follow the normal licensing/loyalty access policy. Purchased badges/effects remain available without a loyalty tier and can be equipped in Edit profile; they never grant staff permissions.

Tier bonuses use canonical Lumen Loyalty eligibility: Spark (3 products) 50 LP, Radiance (6) 100 LP, Nova (9) 150 LP, and Elite (all eligible products) 250 LP, each once per account. Numeric milestones require their thresholds even if Elite is reached with fewer products. Active trials/staff grants count toward loyalty, while staff-license value points follow the separate rules above and never count as purchase spending. Daily, Monday-based weekly and calendar-month UTC views summarize the same purchase/referral rewards; they do not pay additional repeated bonuses. Points have no cash value; task-period filters do not introduce recurring/login bonuses.

Member profiles require migrations `0015_member_profiles.sql` and `0016_public_member_profiles.sql`. The latter publishes previously private profiles and advances their revisions. `/studio/profiles` searches public profiles; `/studio/profiles/{discordId}` retrieves one profile; authenticated `GET|PUT /studio/profiles/me` creates an automatically public profile, refreshes the verified loyalty badge, and edits only the current actor's profile. Edits accept bounded plain text, hex colors, HTTPS links and revision; the compatibility `public` field must remain `true`, and unknown fields (including tier/owner overrides) are rejected. Public message decoration uses one bounded-ID query for profile identities, not biography or private account data. Verification snapshots expire after 24 hours; licensing failures return a badge refresh warning without blocking profile editing. Public readers cannot edit profiles.

Migration `0017_profile_badges.sql` stores optional badge selections. Profile responses include displayed `badges`; owner responses additionally return `availableBadges`. `PUT /studio/profiles/me` accepts optional `badgeIds` (unique, maximum 24, including achievements and owned shop badges); omitting it preserves the selection, and `[]` hides all badges. Higher loyalty tiers unlock lower tiers, higher staff roles unlock lower staff badges, and Owner unlocks all ten tier and role badges. Current roles use the same protected-owner/bootstrap/assigned-role resolution as website authorization, joined into profile/message queries rather than trusted from login claims or snapshots. Unavailable saved badges are filtered on every read; badge ownership never grants permissions or licensing perks. Loyalty eligibility retains its documented 24-hour verified snapshot window.

The profile badge picker shows unlocked badges and the website role needed for locked staff badges. Badge appearance supports `badgeSize` (`small`, `medium`, `large`) and boolean `badgeIconOnly` in `appearance`, available to all users. Size applies to the profile; icon-only display also applies to compact directory and message badges. Older profile edits that omit these options preserve them.

Migration `0018_profile_customization.sql` adds `appearance`, `servers`, a separate banner table and public-activity indexes. Profile PUT supports optional `{background,frame,decoration}` appearance, up to three bounded server cards and `bannerImage` (raw base64 static WebP, maximum 256 KiB and 1200 x 400; `null` removes it). Requests are stream-bounded to 400,000 bytes; banner updates and profile revisions share one D1 transaction. Public `GET /studio/profiles/media/{discordId}` serves saved raster banners with no-store/nosniff and restrictive CSP, never SVG/HTML. Profile responses provide `bannerVersion`, not inline image data; message identities do not include appearance, images or server cards.

Preset IDs come from `shared/profile-cosmetics.mjs`. Spark unlocks backgrounds/frames, Radiance decorations, and Owner all presets; expired eligibility suppresses appearance on public reads while retaining it for later restoration. Owner responses include `cosmeticAccess`, purchased `shopEffects` and achievement progress. Badge selections may include currently unlocked rank/tier badges, data-derived achievements and purchased shop badges; qualifying public activity is checked without exposing post contents. Achievement badges are earned independently of tier and must be selected after qualifying edits are saved. Showcase addresses/text/HTTPS links/gallery limits are validated; server status, ownership and plugin labels are self-reported, not independently verified.

Spark and higher can save optional `appearance.colors` with `surface`, `text`, and `links` as six-digit hex colors. Expired eligibility suppresses the custom colors on public reads while preserving them in `savedAppearance` for the owner; `null` resets them. Older clients that omit colors preserve the existing selection.

Loyalty uses the community migration `0014_loyalty_subclients.sql` and authenticated `/studio/loyalty` and `/studio/loyalty/subclients` routes. Tier calculation checks the customer's canonical active, unexpired entitlements against every page of the active, linked product registry; Elite is relative to that registry, which must be complete. Trial and staff-granted entitlements count while active. Owners can add registered Discord accounts per eligible product; a single conditional insert enforces each tier's per-product limit. Shared downloads recheck the owner's current status, entitlement, tier and ordered slot on every request. Revocation or downgrade suspends access without deleting assignments; owners can remove assignments even if their own access has expired. Sub-clients do not receive the owner's key or server-validation privileges.

Member welcome points use `0033_member_welcome_points.sql`: every existing points wallet and registered member receives **100 LP once**, and new wallets receive the same gift automatically. The welcome record, spendable balance, combined transaction history and private notification are linked atomically. Repeated sign-ins and earnings checks cannot repeat the gift. Welcome points are not purchases and never qualify for referral bonuses.

Coupon rewards use `0020_coupon_rewards.sql` and `0023_coupon_operations.sql`, the existing `BUILDBYBIT_API_AUTHORIZATION` Worker secret with review, license/buyer and coupon access, and `BUILDBYBIT_RESOURCE_IDS`. Coupons have their own account section, independent of the Loyalty page. The scheduled check issues one permanent 5%, 10%, or 15% coupon per eligible Radiance, Nova, or Elite tier and a single-use 10% coupon per review, regardless of rating. Review authors must have a website account and a BuiltByBit account linked to the same Discord ID. Missing optional reviewer ban flags do not invalidate identity verification; if reviewer details are absent, matching verified buyer identities from the creator licenses API are used instead. Historical reviews are included. Checks are bounded and may take multiple runs; the authenticated `/studio/coupons` endpoint returns only the caller's codes and per-check health/error codes. A notification signals a confirmed reward.

BuiltByBit codes are not account-bound. The API does not expose a documented coupon revocation operation, so staff must handle sharing, downgrades and older tier codes manually in BuiltByBit. Issued codes remain subject to BuiltByBit's checkout restrictions. Usage polling records increasing `uses` counters and privately notifies the owner, deduplicated atomically; it cannot report redeemer usernames because the documented API provides counts, not identities. Every creation is reserved before the external call. A timeout, malformed response or unverified scope is recorded as uncertain and never recreated automatically. Read-only reconciliation can release an existing code only after its unique reserved suffix, discount, limits and exact resource scope are confirmed. Explicit authentication, authorization and rate-limit rejections for automatic rewards retry after an hour; other rejected requests require investigation. Do not copy coupon codes or creator credentials into public logs.

Migration `0024_coupon_scope.sql` stores each coupon's verified eligible BuiltByBit resource IDs, which are linked on the customer's coupon card. BuiltByBit may restrict a coupon to a nonempty subset of the configured products; this is valid, not an issuance failure. Every actual entry must be an allowed resource, the complete paginated entry list must be read, and broad content-type overrides remain forbidden. Empty, unrelated or ambiguous scopes remain withheld. Reconciliation checks each pending reward independently so one broken reward cannot block other recipients.

`POST /studio/staff/coupons` requires Support rank or above, `dashboard.view`, `coupons.grant`, and staff level 2 (100 XP); Studio Lead and Owner do not need to earn XP before using their management permission. Staff may grant a registered member a one-use whole-number percentage from 1–50% with a reason; self-grants are blocked. BuiltByBit's documented creation endpoint supports only percentages up to 50%, not 95% or fixed-dollar discounts. The type selector shows dollar discounts as unavailable, and the server rejects unsupported types and amounts. Automatic loyalty/review percentages are unchanged. Migration `0025_coupon_discount_range.sql` expands the constraint while preserving existing rewards and usage-event foreign keys. A UUID request ID makes retries idempotent and all attempts/outcomes are recorded in the website audit. Manual grants do not automatically retry provider rejections. **Grant coupons** opens the dedicated `/admin/coupons` staff page, never the customer reward list. Its member dropdown uses `GET /studio/staff/coupons?page=1&query=...`, with the same grant authorization and read rate limiting. All registered members except the caller are searchable by name, username or Discord ID through 50-member pages; this means members who have signed in, not only currently online users. Only identity labels are returned, never session tokens or account details. Ineligible staff see the actual requirement and a disabled form instead of a missing anchor. The privacy-safe **Coupon reward diagnostics** workflow reports aggregate health and scheduled error messages, never coupon codes or customer identities.

Ticket progression uses migration `0021_staff_progression.sql`. Closing an assigned customer's ticket after at least six public replies sent by that assignee while assigned earns 100 XP once. Reopening, reassignment, self-tickets and internal notes cannot multiply awards. The ticket owner may submit one 1-5-star rating after closure; an eligible closure additionally earns 20 XP per star, once. All closed tickets can be rated, even when no XP is due. Level is `floor(total XP / 100) + 1`, with no level-99 cap. The private staff leaderboard supports Daily (midnight UTC), Weekly (Monday UTC), Monthly (first day UTC), and All time toggles. Rankings and team XP use the selected period; personal levels and next-level progress always use lifetime XP. The animated top-three podium and ambient effects support a Pause effects control and system reduced-motion preferences. The latest 50 team awards identify the receiving staff member and remain an all-period activity feed. Ratings and awards are stored atomically with the relevant ticket operation.

Migration `0026_staff_starter_xp.sql` gives the current staff roster a one-time 10 XP starter bonus, preserving existing XP and adding a website audit entry per recipient. It includes saved staff roles plus the protected owner and non-demoted bootstrap lead; the deployment's `ADMIN_DISCORD_IDS` is empty. The unique `starter_bonus` source per staff ID prevents duplicate awards. This is a deployment-time award, not an automatic bonus for future promotions.

Tier IP allowances require upgrading the VPS API as well as deploying the Worker. The effective allowance is the greater of the configured platform allowance (3 when unset) and Spark 4 / Radiance 5 / Nova 7 / Elite 10 addresses. Spark requires 3 active linked products, Radiance 6, Nova 9, and Elite all products in a nonempty active linked registry. The API calculates tiers from canonical active, unexpired entitlements, never browser input. Active staff grants and trials count too. Inactive or unverified accounts receive no tier bonus. This policy supersedes the archive's unlimited default: after applying it, `/admin ip-limit-remove` removes the manual override but restores the 3-slot base plus tier bonus, not unlimited IPs. The updater also corrects the native admin portal and bot policy messages when present. On the VPS:

```bash
cd /opt/lumen-license
curl -fsSL https://raw.githubusercontent.com/LumenStudios0/LumenDocs/main/scripts/upgrade-loyalty-ip-allowance.py -o /tmp/lumen-loyalty-ips.py
python3 /tmp/lumen-loyalty-ips.py backend
docker compose up -d --build --no-deps api bot
```

The updater validates both source layouts before writing, preserves backups, and is idempotent. It changes no database schema or saved platform setting. Existing addresses survive a downgrade, but additions enforce the current allowance. Customer, admin, per-license and native web IP operations use the same policy; serialized licenses also expose `maxAllowedIps` for staff. Until upgraded, the website continues displaying the backend's actual allowance rather than pretending extra slots are active.

Staff license inspection uses `GET /admin/licenses/{uuid}/key`, gated by current `licenses.keys` permission and staff rank. Support and above receive this permission by default; Jr Support and customer roles cannot receive it. Migration `0013_staff_license_keys.sql` adds it to older saved staff policies only when dashboard and customer viewing are already enabled. The Worker verifies the selected license and customer/product association, then retrieves the shared account key through the existing administrator `GET /users/{discordId}/license-key` endpoint. It never rotates plugin tokens or creates replacement keys. Key-free `license.key_viewed` audit persistence must succeed before returning the uncached key. Restricted accounts and missing/hash-only keys return explicit errors. Staff-issued account recovery requires the existing `upgrade-staff-license-access.py` VPS updater; old per-license hashes cannot be decrypted.

The GitHub Pages workflow does not deploy `worker/chat.js`. The separate **Deploy Cloudflare Worker** workflow deploys Worker changes when `worker/**` or `wrangler.toml` changes. To authorize it, add these values under the LumenDocs repository's **Settings → Secrets and variables → Actions**:

- Repository secret `CLOUDFLARE_API_TOKEN`: create a Cloudflare API token with **Workers Scripts: Edit** and **D1: Edit** permissions for the account that owns this Worker. Do not paste the token into chat or commit it.
- Repository variable `CLOUDFLARE_ACCOUNT_ID`: copy the account ID from the Cloudflare dashboard's account overview.

The workflow finds or creates the `lumen-community` D1 database, fills the generated database ID into the runner's Wrangler configuration, applies remote migrations, and only then deploys. Provisioning and migration failures stop deployment. The committed Wrangler config intentionally has a placeholder database ID; deploy through this workflow rather than running Wrangler directly from a clean checkout. After saving both settings, open **Actions → Deploy Cloudflare Worker → Run workflow** on `main`. Subsequent Worker code changes deploy automatically on pushes to `main`.

## Community support, issues, notifications, and status

The Worker community API is backed by the independent `COMMUNITY_DB` D1 database; it does not depend on the licensing service. If the binding is missing, community requests return `COMMUNITY_SERVICE_UNAVAILABLE` rather than using in-memory or mock storage. Discord sign-in sessions and the existing origin checks authorize customer and staff routes. Customer tickets and submitted issues remain private until staff publish an issue. Ticket replies, moderation, notification preferences/reads, and manual status overrides persist in D1.

Trial requests use the shared `shared/trial-products.mjs` product list, so customers can submit a request without a live registry lookup. Customers choose 1, 3, 7, or 30 days; staff see the requested duration and may adjust it before approval. Requests and their generic staff notifications are saved together. Staff approvals still check the live registry and customer entitlements before granting a time-limited license; an unavailable or unlinked product stays pending, and ambiguous grants require manual investigation.

- Public: `GET /community/issues?page=1&pageSize=20`, `GET /community/status`.
- Signed-in customer: `GET|POST /community/tickets`, `GET /community/tickets/{uuid}`, `POST /community/tickets/{uuid}/replies`, `POST /community/issues`, `GET|PUT /community/preferences`, `GET /community/notifications`, `POST /community/notifications/{uuid}/read`, and `POST /community/notifications/read-all`. Mark-all applies to all currently visible notifications across pages, respecting audience and preferences.
- Staff: `GET /community/staff/tickets`, `PUT /community/staff/tickets/{uuid}`, `GET|POST /community/staff/issues`, `PUT /community/staff/issues/{uuid}`, `GET|POST /community/staff/notifications`, `PUT /community/staff/status/{website|discord|licensing|builtbybit}`, and `POST /community/staff/status/check`.

Page sizes are capped at 50. Mutations and signed-in reads are rate limited; public status/issues polling is not. Admin requests use separate per-user limits of 120 reads and 30 changes per minute, so dashboard refreshes do not consume the changes quota. Ticket closures block further replies. Staff status overrides are stored separately from health-check results and remain in effect until changed to `auto`. The five-minute cron checks the public website and Discord OAuth redirect; it checks licensing with an authenticated, bounded `GET /v1/admin/products?limit=1` only when both licensing settings are configured. Health results expose only service status and timestamps, never the licensing URL or credential. Notifications are in-app only; no bot or email delivery is configured.

Notification lists also include `unreadTotal`, counted across every matching page using the same audience and preference filters as the list. Read state is stored per verified user in D1. Opening the bell does not mark alerts read; selecting a notification or using the notification center's read control does. No notification content or counters are saved in browser storage, and the bell clears on sign-out/account changes.

The cron runs every five minutes. A staff member can request an immediate health check. Set the Worker `LICENSE_API_URL` and `LICENSE_ADMIN_API_TOKEN` only if the optional licensing check should run; those values are never returned by community endpoints.

Response details: ticket creation and `GET /community/tickets/{uuid}` use `{ "ticket": { "id", "type", "title", "body", "productId", "status", "createdAt", "updatedAt" } }`; compatibility metadata is accepted and retained internally, but does not add fields to this response shape. Staff ticket objects additionally include `customerDiscordId`. Issue submissions atomically create an unpublished issue and a matching bug ticket with the same ID; `{ "submissionId", "message" }` returns that ticket ID, so the submission also appears in the customer's tickets. Preference GET/PUT return `{ "preferences": { "updates", "announcements", "ticketReplies", "products" } }`. Customer notifications include `read`; staff notification lists and staff-created notification responses additionally include `audience`. Product-targeted announcements and updates honor product filters when configured; an empty product list receives all product-targeted topics, subject to the update/announcement preference. Ticket reply notifications link to `/account/tickets?ticket={id}` and published notifications link to `/account/notifications`. Status returns `{ "services": [...], "intervalMinutes": 5 }`; each service has `id`, `name`, `status`, `automaticStatus`, `overrideStatus`, `message`, and `checkedAt`. The fixed service IDs are `website`, `discord`, `licensing`, and `builtbybit`. BuiltByBit probes its API's unauthenticated `/v2/members/self` response without sending credentials: a JSON 400 `HeaderMissingError` or an expected JSON 401 indicates API availability, 429 is degraded, and connection/server errors indicate outage. This is not an end-to-end purchase/OAuth check or a claim that the entire marketplace is healthy. Staff overrides work independently of automatic checks. There is no community audit endpoint or audit-feed response; licensing admin audit remains separate.

## Product tools and expiry reminders

`GET /studio/staff/docs` serves private staff/developer guides only after verifying the current signed-in role is Jr Support or higher and has `staff.docs`. The endpoint uses staff read limits and `no-store` responses. `worker/staff-knowledge.js` is intentionally not imported into Pages. Migration `0011_staff_docs_permissions.sql` enables staff guides for existing staff policies and preserves prior member behavior with `support.create`, `trials.request`, and `forum.post`; Guest/Client policies can only grant these member actions. Permission changes affect the next request, including existing sessions. Anonymous posting remains disabled.

The response includes the verified actor ID for browser-scoped saved/read guide preferences, plus staff, developer, and public-catalog plugin playbooks. Only guide IDs are persisted by that feature; private guide content stays in memory. Plugin guidance distinguishes documented runtime targets from actual compatibility testing and treats upcoming products as unpublished, without inventing commands or release dates.

### Private staff operations

The admin proxy allows POST `/admin/licenses/{licenseId}/renew` with `licenses.status` and a future `expiresAt` only. The existing licensing backend updates expiry without issuing a new key and reactivates a suspended license; the UI discloses this before confirmation. Revoked licenses cannot be renewed. Customer bulk give uses the existing reserved `/studio/bulk-grants` workflow, once per selected product, without a plugin-selection cap. Its options come from all pages of the live product registry, not the documentation catalog. The per-request limit of 10 customer IDs is unchanged: customer-profile grants send one customer per product request. Bulk take uses existing audited revoke routes and remains limited to 10 selected licenses. Both stop on uncertain/failed operations, retaining per-item results rather than claiming transactional success or automatically replaying mutations.

Migration `0012_staff_operations.sql` creates persistent presence, tasks, warnings, commission records, guide feedback, and temporary ticket-editor leases. Saved staff policies gain the corresponding defaults; Guest/Client cannot receive these permissions. `GET /studio/staff/operations` requires staff rank and at least one operations permission, returning only authorized feature data. `staff.presence`, `staff.tasks`, `staff.warnings`, `staff.commissions`, and `staff.feedback` are independent of `staff.docs`; the website's staff center itself retains its guide-access requirement.

Staff update availability with `POST /studio/staff/presence`; an empty object refreshes the heartbeat without changing availability or creating an audit entry. Presence becomes offline after 90 seconds. Ticket replies, updates/closures, commission updates, and dashboard license grants record customer-named activity such as `Replied to Alex's ticket` and `Gave Alex a license`. Labels are staff-private, use bounded display names, and never include ticket bodies, license keys, or credentials. Failed writes do not record success; a committed upstream grant with an activity-storage failure returns an explicit warning without retrying the grant. Tasks use POST/PUT `/studio/staff/tasks[/id]`; edits require the current revision. Commission tickets atomically create a pipeline record; PUT `/studio/staff/commissions/{ticketId}` updates stage, scope, acceptance criteria, and milestones with a revision guard. Stages track work only and do not execute payments.

POST `/studio/staff/warnings` requires warning permission and a strictly lower-ranked staff target. Targets can read and acknowledge their own warnings through POST `/studio/staff/warnings/{id}/acknowledge`; authorized issuers can see permitted lower-ranked records, never peers or higher ranks. POST `/studio/staff/guide-feedback` accepts only known server-owned guide IDs. Feedback is private and listed only with `staff.feedback`.

GET/POST `/studio/staff/tickets/{id}/presence` reports or refreshes reply-editor leases. Leases last 120 seconds; reply writes atomically reject another currently authorized editor's live lease. Demoted or permission-revoked editors do not block authorized staff. Ticket responses include `estimatedWait`: each type's 30-day mean of actual first staff reply times, requiring at least three samples. Insufficient data and closed tickets are explicit; estimates are not guarantees or commission completion forecasts.

POST `/studio/staff/assistant` verifies current staff rank and `staff.docs`, uses staff read limits, and retrieves Worker-owned guidance and permission-aware aggregate counts. Verified staff calling `/chat` are routed here automatically. Staff questions, private guides, and staff records are never forwarded to DeepSeek; browser-supplied private context is ignored. Responses identify `server-local-knowledge` and include private guide citations and authorized read-only tool links. No assistant response executes a mutation. Onboarding paths, practice scenarios, and licensing examples also remain server-only; Pages preferences contain actor-scoped IDs/widget settings, not private guide content.

Greetings return a short conversational reply without guides or operational queries. Retrieval matches whole words, not substrings such as `hey` inside `they`. Ordinary answers are capped at 100 words with at most one guide citation and two relevant shortcuts. Detailed explanations and full licensing code require explicit requests; code examples are never truncated into broken fragments. Staff retrieval uses no external AI model tokens.

The Worker serves `/studio/releases` as a public, paginated feed of published release notes. Authenticated staff with `products.manage` can list, create, and edit drafts at `/studio/staff/releases` and `/studio/staff/releases/{id}`. The first publication creates an in-app product update; drafts stay private. This manager stores release metadata, not plugin binaries.

`POST /studio/bulk-grants` requires `licenses.grant` and accepts `{requestId, productId, customerIds, expiresAt}`. Use a fresh UUID per intentional batch, at most ten distinct Discord IDs, and `null` for lifetime access. The batch is reserved in D1 before contacting the licensing API. Reusing the same UUID returns recorded results without granting again. Active access and restricted accounts are skipped rather than shortened or replaced. Results marked `processing` or `uncertain` require staff inspection, not an automatic retry. Keys are never included in the response. Successful grants create private license notifications.

The existing five-minute job scans up to two 25-customer licensing pages per run and persists its cursor. It checks canonical account product entitlements, ignores expired/revoked access, and creates private reminders inside seven days and one day before expiry. Notifications use deterministic IDs to prevent repeated cron runs from duplicating a reminder. Missing licensing configuration disables only this optional scan; errors are logged without replacing service-health results.

### Private plugin downloads

`GET /studio/downloads?page=1` returns up to 20 published artifacts visible to the signed-in Discord account. `GET|HEAD /studio/downloads/{uuid}` rechecks canonical licensing access on each request. Accounts must be active, not awaiting verification, and hold an active, unexpired entitlement to the exact active product. Licensing failures fail closed. Staff with both `dashboard.view` and `products.manage` can inspect all published builds and see safe build-result summaries. Draft artifacts are never returned.

The manually dispatched **Build private plugin downloads** workflow builds the Java 21 Maven projects in `.github/plugin-downloads.json`, validates real plugin descriptors/classes, and uploads verified JARs into private `studio_downloads` and `studio_download_chunks` tables. JARs are limited to 32 MiB and stored as 64 KiB base64 chunks; the Worker streams bounded groups without loading entire JARs into memory. Responses use attachment headers and `private, no-store`; the browser checks file length and SHA-256 before saving. A failed build never replaces a previously published build. Repository access uses the existing Actions source-read secret; Cloudflare credentials are scoped to uploading, not Maven execution. Never publish paid JARs, private source URLs, or GitHub credentials in Pages assets, public releases, or public Actions artifacts.

Staff with `dashboard.view` and `products.manage` can also select a plugin and upload a trusted JAR directly in the product release manager. Uploads use private, actor-owned temporary drafts; the server verifies the stored SHA-256 and plugin JAR structure before publication. Verification is not malware scanning. Drafts expire after 24 hours, and failed or cancelled uploads do not replace published files. Uploading does not depend on source repository access or grant any customer access.

Artifact product IDs must match the licensing registry exactly. In particular, LumenShards retains product ID `1`; LumenOrders uses `lumenorder`. Uploading a build does not create registry entries, link plugins, or grant ownership. Staff must configure any missing products and actual licenses before those downloads become available to customers.

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
