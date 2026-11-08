# Optional AI assistant backend

The documentation site is hosted on GitHub Pages, which cannot keep an AI API key private or run server code. This Cloudflare Worker keeps the DeepSeek key server-side and limits requests to the documentation origin.

1. Install Wrangler and authenticate to the Cloudflare account that will host the Worker.
2. Revoke the key shared in chat and create a fresh one. From the repository root, store the new DeepSeek key as a Worker secret with `npx wrangler secret put DEEPSEEK_API_KEY`. Paste the key only into Wrangler's secure prompt; do not put it in a file, build variable, or commit.
3. Deploy the Worker with `npx wrangler deploy`.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions → Variables**, add `DOCS_ASSISTANT_ENDPOINT` with the deployed Worker URL followed by `/chat`.
5. Push a commit to `main` to rebuild the GitHub Pages site with the endpoint configured.

The Worker only accepts requests from the configured site origin, limits each IP to 10 questions per minute, bounds question and documentation-context sizes, and does not log prompts or provider responses. `ALLOWED_ORIGIN` is set to `https://lumenstudio.fyi`. The assistant sends the question and matching documentation excerpts to DeepSeek when enabled; the page's local guide search remains the fallback if no endpoint is configured.
