# Something not working?

Start with the server console; the first error is usually more useful than the last one. If you ask for help, include the plugin version, server software and version, Java version, and the full error as text. Remove player data and private credentials before sharing logs.

## The plugin won’t start

- Look above the final `Could not load` line for the first error.
- Make sure the jar is in `plugins/`, matches your server and Java versions, and finished downloading.
- Install any required dependencies, and check that optional integrations support your server version.
- Check YAML indentation and quotes. If you need to replace a config, save a copy first.

## A command or menu is missing

- Double-check the command and permission in that plugin’s guide.
- Check the player’s effective permissions. Some permissions default to operators; others are open to everyone.
- If the feature uses another plugin, confirm that integration is installed and running. For example, marketplace sales need an economy provider through Vault.
- Restart after changing settings unless the guide lists a reload command for them.

## Payments aren’t going through

- Make sure both Vault and an economy plugin are installed and enabled.
- Check the server log for provider or transaction errors.
- Don’t edit a database while the server is running.

## You’re having a data or database issue

- Stop the server before copying SQLite or YAML data.
- Restore from a known-good backup, and keep a copy of the current files in case they help diagnose the problem.
- Don’t delete a database to see if it helps—it may contain balances, listings, history, or player progress.

## Product-specific checks

- [Gladiator](/products/gladiator#troubleshooting): packet features need a compatible PacketEvents version.
- [LumenAuction](/products/lumen-auction#troubleshooting): listings and purchases need Vault and an economy provider.
- [LumenOrder](/products/lumen-order#troubleshooting): order creation and delivery also need an economy provider.
- [LumenShards](/products/lumen-shards#troubleshooting): license setup includes a private key, plugin token, and server IP allowlist. [See the Discord license steps](/getting-started/licensing).
- [LumenSpawners](/products/lumen-spawners#troubleshooting): the plugin targets Paper; selling needs Vault and an economy provider.

Still stuck? [Join the Lumen Studios Discord](https://discord.gg/lumenstudios) for help. Never post license keys, plugin tokens, passwords, private player data, or webhook URLs.
