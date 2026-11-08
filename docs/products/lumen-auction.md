# LumenAuction

LumenAuction is a persistent, GUI-based auction house for Minecraft servers. Listings, transaction history, expired-item storage, and audit entries are stored in SQLite.

## Features

- Create, browse, search, sort, and manage item listings through the auction GUI.
- Keep expired items in private storage and retrieve them later.
- Track player transaction history and administrator actions.
- Configure listing durations, limits, fees, taxes, item restrictions, menus, and permission tiers.
- Connect to an economy provider through Vault for listing and purchasing.

## Installation

1. Use a compatible Bukkit-family server running Minecraft 1.21.6–1.21.11 and Java 21.
2. Install Vault and a Vault-compatible economy provider before enabling sales.
3. Place `LumenAuction.jar` in `plugins/` and start the server.
4. Review `plugins/LumenAuction/config.yml`; restart or run `/ah reload` after changes.
5. Back up `plugins/LumenAuction/auction.db` only while the server is stopped.

Without Vault and an economy provider, the plugin may load but listing and purchasing are unavailable.

## Commands and permissions

| Command | Purpose |
| --- | --- |
| `/ah` | Browse active listings |
| `/ah sell &lt;price&gt;` | List the held item; supports `k`, `m`, `b`, and `t` price suffixes |
| `/ah listings` | View your active listings |
| `/ah history` | View transaction history |
| `/ah expired` | Open private expired-item storage |
| `/ah cancel &lt;listing-id&gt;` | Cancel your listing |
| `/ah admin` | Open administration menu |
| `/ah reload` | Reload validated configuration |
| `/ah help` | Show help |

| Permission | Default | Access |
| --- | --- | --- |
| `lumenauction.use` | Everyone | Browse and use the auction house |
| `lumenauction.sell` | Everyone | Create listings |
| `lumenauction.limit.bypass` | Operators | Bypass listing limits |
| `lumenauction.fee.bypass` | Operators | Bypass listing fees |
| `lumenauction.admin` | Operators | Administration tools |
| `lumenauction.admin.remove` | Operators | Remove marketplace listings |
| `lumenauction.admin.reload` | Operators | Reload configuration |
| `lumenauction.duration.&lt;tier&gt;` | Nobody | Configured listing-duration tier |
| `lumenauction.max-listings.&lt;limit&gt;` | Nobody | Configured listing-limit tier |

Duration and listing-limit permission tiers are configured under `permissions` in `config.yml`; the longest duration and largest limit granted apply.

## Configuration

Edit `plugins/LumenAuction/config.yml`. It controls listing lifetime and limits, price bounds, fees and taxes, categories, blacklists/allowlists, menu layout and text, permission tiers, save intervals, and debug logging. Fees and taxes default to zero. Set `allowed-materials` to a non-empty list to restrict listings to that allowlist. Run `/ah reload` to apply supported edits.

SQLite stores marketplace data in `auction.db`. Do not edit or copy it while the server is running. Use regular stopped-server backups.

## Troubleshooting

- **Cannot list or buy:** verify that Vault and an active Vault economy provider are installed; check startup logs for provider discovery.
- **Permission tier has no effect:** check the exact node configured in `permissions.duration-tiers` or `permissions.listing-limit-tiers`, then refresh the player's permissions.
- **Item expired:** retrieve it from `/ah expired`; expired listings are associated with their original seller.
- **Database issue:** stop the server before restoring a database backup. Do not delete `auction.db` unless you intend to reset marketplace state.
- **Compatibility:** documented support is 1.21.6–1.21.11 on Bukkit-compatible servers with Java 21; verify your exact server build.
