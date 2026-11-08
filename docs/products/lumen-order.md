# LumenOrder

LumenOrder is a GUI-driven buy-order marketplace. A buyer posts an order for an item and unit price; another player delivers items and receives payment through Vault.

## Features

- Create, edit, cancel, search, deliver, and track player buy orders.
- Hold the full order value in escrow by default; refund unused value when an order is cancelled or expires.
- Send delivered items to the buyer's claims so offline players or full inventories do not lose deliveries.
- Journal transactions and recover interrupted deliveries/refunds for administrator review.
- Support custom items/enchantments through optional ItemsAdder, Nexo, and EcoEnchants integrations.
- Configure fake server-created orders, disabled by default.

## Installation

1. Use Java 21+ on a Bukkit-family server. Folia is unsupported.
2. Install Vault and an economy provider. Browsing may work without them, but creating orders and delivering items are disabled.
3. Place `LumenOrder-1.0.0.jar` in `plugins/` and restart the server.
4. Edit `plugins/LumenOrder/config.yml` and `lang/en_us.yml`; run `/order admin reload`.

## Commands and permissions

| Command | Purpose | Permission |
| --- | --- | --- |
| `/order` or `/orders` | Open the market | `lumenorder.use` |
| `/order create &lt;item&gt; &lt;quantity&gt; &lt;price&gt; [enchantments]` | Create a buy order | `lumenorder.create` |
| `/order edit &lt;id&gt;` / `/order cancel &lt;id&gt;` | Edit or cancel an order | `lumenorder.edit` |
| `/order deliver &lt;id&gt; [amount]` | Deliver matching items | `lumenorder.deliver` |
| `/order mine`, `history`, `claim`, `search &lt;text&gt;`, `help` | Manage and browse orders | `lumenorder.use` |
| `/order admin` | Open administrator GUI | `lumenorder.admin` |
| `/order admin cancel|remove &lt;id&gt;` | Cancel or remove an order | `lumenorder.admin.manage` / admin |
| `/order admin resolve &lt;tx&gt; &lt;complete\|rollback&gt;` | Resolve a transaction for review | `lumenorder.admin.manage` / admin |
| `/order admin logs` | View logs | `lumenorder.admin.logs` |
| `/order admin reload` | Reload settings | `lumenorder.admin.reload` |
| `/order admin preset &lt;list\|apply &lt;name&gt; [confirm]&gt;` | List or apply a preset | `lumenorder.admin.reload` |

Grant longer order duration or more slots by setting permission tiers under `permissions:` in the config, for example `lumenorder.slots.10: 10`. `lumenorder.limit.bypass` ignores order limits; `lumenorder.bypass.fees` bypasses fees. Permission node names are configurable.

## Configuration

`config.yml` controls order limits, expiry, fees, price formatting, categories, GUI titles/buttons, sounds, permission tiers, and optional fake orders. Player-facing text is in `lang/en_us.yml`. Presets (`survival`, `skyblock`, and `pvp`) can be applied by an admin command; a backup is written first.

Escrow is on by default. Delivery moves items into the buyer's claim inventory; use `/order claim` to collect them. Interrupted or ambiguous transactions can be reviewed from the Admin GUI or resolved with the admin command. Storage is SQLite-only.

## Troubleshooting

- **Cannot create or deliver:** ensure Vault and a working economy provider are enabled.
- **Custom item order is refused:** install the relevant optional item/enchantment plugin and confirm the identifier is supported.
- **Player cannot collect a delivery:** use `/order claim` or the GUI Claim button; claims remain available while offline.
- **Transaction needs review:** open Admin GUI → Needs review, inspect the transaction, then resolve only after checking items and balances.
- **Configuration does not apply:** use `/order admin reload` and review console warnings for invalid settings.
- **Unsupported platform:** Folia is not supported; documented server families are Bukkit, Spigot, Paper, and Purpur.
