# LumenEconomy

LumenEconomy provides a configurable server economy with balances, player payments, inventory selling, a searchable Worth browser, multiplier tiers, Power Tools, transaction history, leaderboards, and optional Vault and PlaceholderAPI integrations.

## Features

- Manage balances and transfer currency between players.
- Sell eligible items from a held stack or inventory; view prices in the Worth GUI.
- Configure permission/global/progression multipliers and temporary global multipliers.
- Use configurable sell tools, menus, messages, transaction history, and leaderboards.
- Expose a Vault economy and PlaceholderAPI integration when those plugins are installed.

All selling surfaces use the same price and multiplier calculation. Currency and payment amounts use whole integer units; negative and fractional payment amounts are rejected.

## Installation

1. Install the plugin jar into `plugins/` and start the server to generate its data folder.
2. Review `plugins/LumenEconomy/prices.yml` and adjust starter prices and categories for your economy.
3. Install Vault and a compatible economy consumer if needed; install PlaceholderAPI to use its placeholders.
4. Restart after initial setup, or run `/lumeneco reload` for supported configuration changes.

The documented build targets Paper API 1.21.4 and Java 21 bytecode. Compatibility with newer server releases and individual forks should be verified before production use.

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

Admin command permissions are controlled by the plugin's permission configuration. Check the generated config and command feedback when permission access differs from your setup.

## Configuration

| File | Used for |
| --- | --- |
| `config.yml` | Currency defaults, payment limits, selling restrictions, feature toggles, Vault and PlaceholderAPI |
| `prices.yml` | Base item prices and Worth categories |
| `multipliers.yml` | Base, permission, global, temporary, and progression tiers |
| `messages.yml` | Player-facing text and shared prefix |
| `menus.yml` | GUI titles, slots, icons, controls, and menu text |
| `tools.yml` | Power Tool enablement, appearance, permissions, abilities, and durability |

Tune `prices.yml` before opening the economy to players. Blacklisted items can remain visible in Worth but are not paid out. Multipliers and persistent sale progress can be adjusted in their own file. Supported changes can be applied with `/lumeneco reload`.

## Troubleshooting

- **Items do not sell:** check the material price, sell restrictions/blacklist, feature switches, and the player's sell permissions.
- **Vault integration missing:** install Vault and a compatible economy provider, then check server startup logs and reload.
- **Prices look wrong:** edit `prices.yml` and review multipliers; whole-unit amounts and rounding are intentional.
- **Feature changes are not visible:** confirm the relevant feature switch and run `/lumeneco reload`, or restart.
- **Unsupported server behavior:** verify your server version and fork; the documented compile target is Paper 1.21.4.
