# Optional AI assistant backend

The documentation site is hosted on GitHub Pages, which cannot keep an AI API key private or run server code. This Cloudflare Worker keeps the DeepSeek key server-side and limits requests to the documentation origin.

1. Install Wrangler and authenticate to the Cloudflare account that will host the Worker.
2. Revoke the key shared in chat and create a fresh one. From the repository root, store the new DeepSeek key as a Worker secret with `npx wrangler secret put DEEPSEEK_API_KEY`. Paste the key only into Wrangler's secure prompt; do not put it in a file, build variable, or commit.
3. Deploy the Worker with `npx wrangler deploy`.
4. The GitHub Pages workflows build the site with the same-origin `https://lumenstudio.fyi/api/chat` endpoint configured in `.github/workflows/deploy.yml` and `.github/workflows/refresh-changelogs.yml`.
5. Push a commit to `main` to rebuild the GitHub Pages site with the endpoint configured.

Browser API requests use the same-origin `https://lumenstudio.fyi/api/` route so the docs site and Worker API work under restrictive browser policies. Discord login starts on the Worker domain so its secure OAuth state cookie is available at the callback. The Worker accepts requests only from the explicitly configured Lumen origins (`https://lumenstudio.fyi`, `https://www.lumenstudio.fyi`, and `https://lumenstudios0.github.io`), limits each IP to 10 questions per minute, bounds question and documentation-context sizes, and does not log prompts or provider responses. The assistant sends the question and matching documentation excerpts to DeepSeek when enabled; the page's local guide search remains the fallback if no endpoint is configured.

## Bug, compatibility, and feature reports

The `/reports` endpoint sends bug reports, compatibility results, and feature requests to the same Discord reports inbox. Configure its private webhook with `npx wrangler secret put DISCORD_BUG_REPORT_WEBHOOK`, then deploy the Worker with `npx wrangler deploy`. The GitHub Pages build only deploys the documentation site; changes to `worker/chat.js` require a separate Worker deployment.

Compatibility reports require a plugin, server software, Minecraft version, one of `untested`, `broken`, `partial`, or `working`, and test details. Feature requests require a title and description. The legacy `/bug-report` endpoint remains available for the assistant's existing bug form.

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

## Staff admin dashboard and license service

The customer menu shows **Admin dashboard** only when the Worker confirms the signed-in Discord account is authorized. The owner ID `1400375985211441242` and studio lead ID `1012053634911064114` are granted the owner and studio-lead roles in the Worker. Optional additional staff IDs can be provided as a comma-separated `ADMIN_DISCORD_IDS` Worker variable. Access is checked again on every admin API request; a hidden menu link is not an authorization control.

The Worker proxies a narrow allowlist of customer, license, product, and audit routes to the licensing API. The licensing administrator token is held only as a Worker secret and is never sent to or embedded in the Pages site. Admin mutations are audited by Discord ID and role. Account bans and holds block future license validation; they do not revoke license records or end an already-issued one-hour website session. Verification requests are recorded in the licensing service; a customer notification is not sent by this integration.

The staff directory lists non-deleted customers with licenses or a customer profile. Discord usernames are synced from the verified Discord session when a customer visits **Account Settings**; accounts that have not done so yet appear by Discord ID until they sync. Customers can delete their own account from **Account Settings**, and staff can delete it from the admin profile. Deletion revokes active licenses, removes their allowed IPs and server/Minecraft bindings, erases the stored Discord username, and retains minimal license/audit history.

To connect the dashboard after the licensing API is available over HTTPS:

1. Deploy the updated licensing service and apply its database migration (`alembic upgrade head`, or restart the provided Docker Compose stack, which applies migrations during API startup). Keep the API private behind HTTPS and ensure its `ADMIN_API_TOKEN` is configured.
2. Authenticate Wrangler for the account that owns the Worker. From the repository root, configure the upstream URL and administrator credential as Worker secrets:

   ```sh
   npx wrangler secret put LICENSE_API_URL
   npx wrangler secret put LICENSE_ADMIN_API_TOKEN
   ```

   Enter the HTTPS API base URL (for example `https://licenses.example.com`) and the same strong administrator token configured on the licensing API. Do not put either value in Pages variables, source files, or this repository.
3. If adding other staff, set `ADMIN_DISCORD_IDS` in `wrangler.toml` to comma-separated Discord account IDs. The two built-in owner accounts are always authorized.
4. Deploy the Worker with `npx wrangler deploy`, then push the site changes so GitHub Pages builds the `/admin/` dashboard. The Pages workflow embeds the deployed Worker `/chat` endpoint at build time.
5. Apply the licensing backend changes and run its tests before using account controls. To remove an entitlement, revoke its license; records are retained for audit history. Each license supports at most three numeric IPv4/IPv6 addresses.

Until the Worker secrets and licensing service are configured, admin actions return an explicit `LICENSE_SERVICE_UNAVAILABLE` response. GitHub Pages deployment alone does not deploy the Worker or licensing backend.

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

- Repository secret `CLOUDFLARE_API_TOKEN`: create a Cloudflare API token with the **Edit Cloudflare Workers** permission for the account that owns this Worker. Do not paste the token into chat or commit it.
- Repository variable `CLOUDFLARE_ACCOUNT_ID`: copy the account ID from the Cloudflare dashboard's account overview.

After saving both, open **Actions → Deploy Cloudflare Worker → Run workflow** and run it on `main`. Confirm the run succeeds before testing admin requests again. Subsequent Worker code changes deploy automatically on pushes to `main`.

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
