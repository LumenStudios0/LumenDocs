# Lumen Studios Docs

The Lumen Studios plugin guides, built with VitePress. Read them at [lumenstudios0.github.io/LumenDocs](https://lumenstudios0.github.io/LumenDocs/).

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

The VitePress `base` is `/LumenDocs/`, matching this repository's GitHub Pages project-site URL. Update `docs/.vitepress/config.mts` if the repository name or hosting path changes.

## Assistant and bug reports

The assistant, Discord sign-in, and admin dashboard use the Cloudflare Worker in `worker/chat.js`. The Pages workflows build against the deployed Worker URL `https://lumen-docs-assistant.lumennetwork0.workers.dev/chat`. Configure the Discord webhook only as a Cloudflare Worker secret, then deploy the worker:

```sh
npx wrangler secret put DISCORD_BUG_REPORT_WEBHOOK
npx wrangler deploy
```

Never put the webhook URL in site code, GitHub Pages variables, or committed files. If a webhook URL has been shared publicly, delete it and create a replacement before configuring the secret. Run worker tests with `npm run test:worker`.

## Keeping guides accurate

Commands and supported versions can vary by release, so check the notes that came with your jar. Need a license? Follow the [Discord license guide](https://lumenstudios0.github.io/LumenDocs/getting-started/licensing). Never add license keys, plugin tokens, database passwords, Discord webhooks, or other private credentials here.
