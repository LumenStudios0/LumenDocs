# LumenOrder

With LumenOrder, players post what they want to buy and the price they’re offering. Other players deliver the items and get paid through Vault.

<a class="buy-now" href="https://builtbybit.com/resources/lumenorders.132969/" target="_blank" rel="noreferrer">Buy LumenOrder on BuiltByBit ↗</a>

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

To give players more slots or longer-running orders, add permission tiers under `permissions:` in the config—for example, `lumenorder.slots.10: 10`. `lumenorder.limit.bypass` skips order limits, and `lumenorder.bypass.fees` skips fees. You can change the permission node names in the config.

## Configuration

The main options—limits, expiry, fees, price formatting, categories, menus, sounds, and fake orders—are in `config.yml`. Text players see is in `lang/en_us.yml`. You can apply the included `survival`, `skyblock`, or `pvp` preset with an admin command; the plugin backs up the config first.

Escrow is on by default. Delivery moves items into the buyer's claim inventory; use `/order claim` to collect them. Interrupted or ambiguous transactions can be reviewed from the Admin GUI or resolved with the admin command. Storage is SQLite-only.

## Troubleshooting

- **Orders can’t be created or delivered:** check that Vault and an economy plugin are both running.
- **A custom item order is rejected:** make sure the required ItemsAdder, Nexo, or EcoEnchants plugin is installed and that the item or enchantment is supported.
- **The buyer can’t find delivered items:** they’re held as claims; use `/order claim` or the Claim button, even if the buyer was offline.
- **A transaction needs attention:** open Admin GUI → Needs review. Check the items and balances before resolving it.
- **A config change didn’t apply:** run `/order admin reload` and check the console for warnings.
- **Using Folia:** LumenOrder doesn’t support Folia. The documented platforms are Bukkit, Spigot, Paper, and Purpur.
