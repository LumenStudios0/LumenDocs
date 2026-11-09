# Optional AI assistant backend

The documentation site is hosted on GitHub Pages, which cannot keep an AI API key private or run server code. This Cloudflare Worker keeps the DeepSeek key server-side and limits requests to the documentation origin.

1. Install Wrangler and authenticate to the Cloudflare account that will host the Worker.
2. Revoke the key shared in chat and create a fresh one. From the repository root, store the new DeepSeek key as a Worker secret with `npx wrangler secret put DEEPSEEK_API_KEY`. Paste the key only into Wrangler's secure prompt; do not put it in a file, build variable, or commit.
3. Deploy the Worker with `npx wrangler deploy`.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**, add `DOCS_ASSISTANT_ENDPOINT` with the deployed Worker URL followed by `/chat`.
5. Push a commit to `main` to rebuild the GitHub Pages site with the endpoint configured.

The Worker only accepts requests from the configured site origin, limits each IP to 10 questions per minute, bounds question and documentation-context sizes, and does not log prompts or provider responses. `ALLOWED_ORIGIN` is set to `https://lumenstudio.fyi`. The assistant sends the question and matching documentation excerpts to DeepSeek when enabled; the page's local guide search remains the fallback if no endpoint is configured.

## Bug, compatibility, and feature reports

The `/reports` endpoint sends bug reports, compatibility results, and feature requests to the same Discord reports inbox. Configure its private webhook with `npx wrangler secret put DISCORD_BUG_REPORT_WEBHOOK`, then deploy the Worker with `npx wrangler deploy`. The GitHub Pages build only deploys the documentation site; changes to `worker/chat.js` require a separate Worker deployment.

Compatibility reports require a plugin, server software, Minecraft version, one of `untested`, `broken`, `partial`, or `working`, and test details. Feature requests require a title and description. The legacy `/bug-report` endpoint remains available for the assistant's existing bug form.

## Discord sign-in

Discord sign-in is optional and does not restrict access to the documentation. It uses the Worker configured by `DOCS_ASSISTANT_ENDPOINT`; the Discord access token stays on the Worker, and the browser session token expires after one hour and is kept in the current tab's `sessionStorage`.

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
5. Confirm the GitHub Actions variable `DOCS_ASSISTANT_ENDPOINT` is set to the deployed Worker URL followed by `/chat`, then rebuild and deploy the GitHub Pages site.

The Worker uses Discord's `identify` scope, validates OAuth state with a short-lived HttpOnly cookie, and signs a one-hour identity token. Users can sign out from the navigation; signing out clears the current tab's session token. The Pages workflow does not deploy Worker changes.

## Customer portal license API scaffold

The authenticated customer API surface is reserved for the future licensing integration:

- `GET /account/servers` — connected servers for the signed-in Discord account.
- `GET /account/license-ips` — IP addresses assigned to a license.
- `PUT /account/license-ips` — validates a list of at most three unique IPv4/IPv6 addresses.

All three routes require a valid `Authorization: Bearer <session-token>` header and are rate limited by account. They currently return `503` with `LICENSE_SERVICE_UNAVAILABLE`; the Worker does not store or change license data until a licensing service is connected. The portal's IP-address preview remains browser-local and is not authoritative.

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
