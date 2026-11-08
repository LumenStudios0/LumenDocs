# Installation

These steps apply to most Bukkit-family Minecraft plugins. Follow the individual [product guide](/plugins/) as well, because dependencies, licensing, data folders, and reload behavior differ.

## Install a plugin

1. Stop the server cleanly and create a backup of the world, server configuration, and existing plugin data.
2. Verify the plugin jar is intended for your server software, Minecraft version, and Java runtime.
3. Install required server-side dependencies first. Common examples include Vault plus an economy provider, or PacketEvents for packet-based features. Check the product guide for the exact requirements.
4. Copy the plugin `.jar` into the server's `plugins/` directory. Do not unzip it or rename it unless the product instructions say to.
5. Start the server and review the console for the plugin's enable message, dependency warnings, and configuration errors.
6. Stop the server, edit the generated files in that plugin's data folder, then restart. Use a documented reload command only when the plugin supports it and the setting can be safely reloaded.
7. Test the main player and administrator workflows on a staging server before deploying to production.

## Updating

1. Back up the current jar, configuration, and plugin data (including database files).
2. Read the release notes for migration steps and compatibility changes.
3. Replace the jar while the server is stopped. Keep the existing data folder unless the update guide explicitly requires a migration.
4. Start the server and inspect logs before allowing normal player activity.

Never edit a plugin's SQLite database while the server is running. Keep license keys, plugin tokens, database passwords, and webhook URLs private; do not paste them into public issues or documentation.
