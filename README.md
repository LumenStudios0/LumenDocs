# Lumen Studios Documentation

The official Lumen Studios documentation website, built with VitePress and deployed to GitHub Pages.

## Local development

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm ci
npm run docs:dev
```

The local site is served at `http://localhost:5173/LumenDocs/`. Create a production build with:

```sh
npm run docs:build
npm run docs:preview
```

## Publishing

Push changes to `main` or run the **Deploy documentation** workflow manually. GitHub Actions builds the site and publishes the generated artifact to GitHub Pages. In **Settings → Pages**, set the source to **GitHub Actions** if it is not already selected.

The VitePress `base` is `/LumenDocs/`, matching this repository's GitHub Pages project-site URL. Update `docs/.vitepress/config.mts` if the repository name or hosting path changes.

## Documentation contributions

Product details are based on the corresponding Lumen Studios plugin repositories. Verify version-specific commands and compatibility against the plugin version installed on your server. Never add license keys, plugin tokens, database passwords, Discord webhooks, or other private credentials to this public repository.
