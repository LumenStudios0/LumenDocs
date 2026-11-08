# LumenEconomy

Balances, payments, selling, and the Worth browser all use the same economy, so players can check an item’s value before selling it. You can also add multiplier tiers, Power Tools, history, leaderboards, and optional Vault or PlaceholderAPI integrations.

## Features

- Manage balances and transfer currency between players.
- Sell eligible items from a held stack or inventory; view prices in the Worth GUI.
- Configure permission/global/progression multipliers and temporary global multipliers.
- Use configurable sell tools, menus, messages, transaction history, and leaderboards.
- Expose a Vault economy and PlaceholderAPI integration when those plugins are installed.

The same price and multiplier calculation is used whether a player sells from a command, tool, or menu. Currency uses whole units; negative and fractional payment amounts are rejected.

## Installation

1. Install the plugin jar into `plugins/` and start the server to generate its data folder.
2. Review `plugins/LumenEconomy/prices.yml` and adjust starter prices and categories for your economy.
3. Install Vault and a compatible economy consumer if needed; install PlaceholderAPI to use its placeholders.
4. Restart after initial setup, or run `/lumeneco reload` for supported configuration changes.

The documented build target is Paper API 1.21.4 with Java 21 bytecode. If you’re running something newer or a different fork, test it before moving to production.

## Commands and permissions

| Command | Purpose |
| --- | --- |
| `/balance [player]` | View balance; another player's balance requires `lumeneconomy.balance.others` |
| `/pay &lt;player&gt; &lt;amount&gt;` | Transfer whole-number currency to an online or cached player |
| `/sell [hand\|all]`, `/sellhand`, `/sellall` | Sell eligible held items or inventory contents |
| `/worth` | Open the searchable Worth GUI |
| `/multipliers` | View multiplier-tier progress |
| `/lumenmenu` | Open the economy menu |
| `/sellhistory [player]` | View recent transactions |
| `/baltop` | Display the balance leaderboard |
| `/lumeneco reload` | Reload settings and integrations |
| `/lumeneco balance &lt;set\|add\|take&gt; &lt;player&gt; &lt;amount&gt;` | Admin balance management |
| `/lumeneco multiplier global &lt;value&gt;` | Set the global multiplier |
| `/lumeneco multiplier temporary &lt;value&gt; &lt;seconds&gt;` | Set a temporary global multiplier |
| `/lumeneco tool &lt;sell-axe\|miner-pickaxe\|tree-chopper&gt; [player]` | Give a configured Power Tool |

Admin command access is controlled by the plugin’s permission settings. If a command is denied, check the generated config and the message shown in game.

## Configuration

| File | Used for |
| --- | --- |
| `config.yml` | Currency defaults, payment limits, selling restrictions, feature toggles, Vault and PlaceholderAPI |
| `prices.yml` | Base item prices and Worth categories |
| `multipliers.yml` | Base, permission, global, temporary, and progression tiers |
| `messages.yml` | Player-facing text and shared prefix |
| `menus.yml` | GUI titles, slots, icons, controls, and menu text |
| `tools.yml` | Power Tool enablement, appearance, permissions, abilities, and durability |

Set prices in `prices.yml` before players start selling. Blacklisted items can still appear in Worth, but won’t pay out. Multipliers and sale progress have their own file; use `/lumeneco reload` for supported changes.

## Troubleshooting

- **Items do not sell:** check the material price, sell restrictions/blacklist, feature switches, and the player's sell permissions.
- **Vault integration missing:** install Vault and a compatible economy provider, then check server startup logs and reload.
- **Prices look wrong:** edit `prices.yml` and review multipliers; whole-unit amounts and rounding are intentional.
- **Feature changes are not visible:** confirm the relevant feature switch and run `/lumeneco reload`, or restart.
- **Unsupported server behavior:** verify your server version and fork; the documented compile target is Paper 1.21.4.
