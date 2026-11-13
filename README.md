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

The homepage layout and animations live in `docs/.vitepress/theme/HomeExperience.vue`; `docs/index.md` mounts that component. Shared docs styling lives in `docs/.vitepress/theme/custom.css`, and the documentation hub is styled in `docs/docs/index.md`. Check both desktop and mobile layouts with the production preview before publishing.

## Assistant and bug reports

The assistant, Discord sign-in, and admin dashboard use the Cloudflare Worker in `worker/chat.js` through the same-origin `https://lumenstudio.fyi/api/` route. Configure the Discord webhook only as a Cloudflare Worker secret, then deploy the worker:

```sh
npx wrangler secret put DISCORD_BUG_REPORT_WEBHOOK
npx wrangler deploy
```

Never put the webhook URL in site code, GitHub Pages variables, or committed files. If a webhook URL has been shared publicly, delete it and create a replacement before configuring the secret. Run worker tests with `npm run test:worker`.

## Keeping guides accurate

Commands and supported versions can vary by release, so check the notes that came with your jar. Need a license? Follow the [Discord license guide](https://lumenstudios0.github.io/LumenDocs/getting-started/licensing). Never add license keys, plugin tokens, database passwords, Discord webhooks, or other private credentials here.
