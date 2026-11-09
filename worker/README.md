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
