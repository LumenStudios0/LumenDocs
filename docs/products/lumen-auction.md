# LumenAuction

Give players one place to list items, browse the market, and pick up expired listings. LumenAuction keeps the marketplace and transaction history in SQLite, so listings are still there after a restart.

<a class="buy-now" href="https://builtbybit.com/resources/lumenauction.132967/" target="_blank" rel="noreferrer">Buy LumenAuction on BuiltByBit ↗</a>

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

The auction house can load without Vault, but players won’t be able to list or buy until Vault and an economy provider are running.

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

Most server-side choices live in `plugins/LumenAuction/config.yml`: listing limits and duration, prices, fees, taxes, allowed items, menu text, and permission tiers. Fees and taxes start at zero. To allow only certain items, add them to `allowed-materials`. Run `/ah reload` to apply supported changes.

SQLite stores marketplace data in `auction.db`. Do not edit or copy it while the server is running. Use regular stopped-server backups.

## Troubleshooting

- **Players can browse but not trade:** make sure both Vault and an economy provider are enabled, then check the server log for provider detection.
- **A permission tier isn’t taking effect:** compare the granted node with `permissions.duration-tiers` or `permissions.listing-limit-tiers` and refresh the player’s permissions.
- **A listing expired:** the seller can retrieve it with `/ah expired`.
- **You need to restore the database:** stop the server first and restore a backup of `auction.db`. Deleting it resets marketplace data.
- **Checking compatibility:** the documented target is Minecraft 1.21.6–1.21.11 on Bukkit-compatible servers with Java 21.
