# Troubleshooting

Use the server console and the plugin's own log messages as the source of truth. When asking for help, include the full error (as text), plugin version, server software/version, Java version, and relevant sanitized configuration. Remove player data and all secrets before sharing.

## Plugin does not load

- Check the console for the first error, not only the final `Could not load` line.
- Confirm the jar is in `plugins/`, is not corrupted, and matches the installed Java/server version.
- Resolve missing hard dependencies and update optional dependencies only to versions compatible with your server.
- Check YAML indentation and quoting. Restore a backup before regenerating a configuration file.

## Commands or menus are unavailable

- Confirm the command spelling and permission node in the product guide.
- Check the user's effective permissions with your permissions manager. Operator defaults vary by permission.
- Verify optional integrations are enabled and available when the feature needs them. For example, market sales require an economy provider through Vault.
- Restart after changing settings that are not documented as reloadable.

## Economy or payments are not working

- Check that Vault and a compatible economy provider are installed and enabled.
- Verify the plugin that owns the command or GUI is configured to use the intended provider.
- Review logs for transaction, provider, or storage errors. Do not manually edit a live database.

## Database or data problems

- Stop the server before making a copy of SQLite or YAML player data.
- Restore only from a known-good backup and preserve the original files for diagnosis.
- Do not delete database files as a first troubleshooting step; this can permanently remove balances, listings, history, or player progress.

## Product-specific checks

- [Gladiator](/products/gladiator#troubleshooting): packet checks require a compatible PacketEvents release; protection heuristics and packet features have documented limitations.
- [LumenAuction](/products/lumen-auction#troubleshooting): check Vault provider availability and make backups with the server stopped.
- [LumenOrder](/products/lumen-order#troubleshooting): delivery and order creation need Vault plus an economy provider.
- [LumenShards](/products/lumen-shards#troubleshooting): check private license configuration and the server IP allowlist without sharing credentials.
- [LumenSpawners](/products/lumen-spawners#troubleshooting): confirm Paper is in use; selling requires Vault and an economy provider.

For unresolved issues, use the support channel included with your product delivery. Never publish license keys, plugin tokens, passwords, private player data, or webhook URLs.
