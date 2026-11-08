# Installing a plugin

Most installs are straightforward. The exact requirements vary by plugin, so keep its [product guide](/plugins/) open as you go.

## Install a plugin

1. Stop the server and make a backup of your world, server settings, and existing plugin data.
2. Check the plugin’s guide for supported server and Java versions.
3. Install any dependencies the guide calls out. For example, economy features may need Vault and an economy plugin.
4. Put the plugin `.jar` in the server’s `plugins/` folder. Leave it as a jar—don’t unzip it.
5. Start the server and watch the console for errors or missing dependencies.
6. If the plugin needs a license, [request one through Discord](/getting-started/licensing).
7. Stop the server to edit the config files the plugin generated, then start it again. Only use a reload command if the plugin guide says it’s supported.
8. Try the main commands and features before opening things up to players.

## Updating

1. Back up the current jar, config, and plugin data (including database files).
2. Check the release notes for compatibility changes or migration steps.
3. With the server stopped, replace the jar. Keep the existing data folder unless the update instructions say otherwise.
4. Start the server and check the console before letting players back in.

Don’t edit or copy a SQLite database while the server is running. Keep license keys, plugin tokens, passwords, and webhook URLs private. If setup gets stuck, ask for help in the [Lumen Studios Discord](https://discord.gg/lumenstudios)—just remove credentials before sharing logs.
