# LumenSpawners

LumenSpawners produces configured mob drops and item outputs virtually. It does not spawn mobs for production. Spawner data and stored output are persisted in SQLite.

## Features

- Virtual mob-drop and item-spawner production with configurable intervals and storage capacities.
- Stack matching spawners, collect drops/experience, and browse stored output through management menus.
- Configure Basic, Shiny, Golden, and Rainbow rarity multipliers, weighted grants, particles, and colors.
- Optionally convert natural spawners with Silk Touch, enable upgrades/evolution, leaderboards, and Vault-backed sales.
- Preserve items when storage is full; production pauses rather than discarding overflow.

## Installation

1. Use Paper. The documented compile target is Paper API 1.21.6; other platforms and live server versions are not yet verified.
2. Copy the plugin jar to `plugins/` and start the server.
3. Configure `plugins/LumenSpawners/config.yml` and `mobs.yml`, then restart or use `/vspawner reload`.
4. Install Vault and a compatible economy provider only if you want to sell stored drops.

Java 21 and Maven 3.9+ are required to build from source. SQLite JDBC is included in the plugin jar; Paper and Vault are not bundled.

## Commands and permissions

| Command | Permission | Purpose |
| --- | --- | --- |
| `/vspawner` or `/lspawner` | `lumenspawners.use` | Open or inspect the targeted spawner, or show help |
| `/vspawner info` | `lumenspawners.use` | Show targeted spawner details |
| `/vspawner stats` | `lumenspawners.use` | Show production and storage statistics |
| `/spawner give &lt;player&gt; &lt;type&gt; &lt;amount&gt; [rarity\|random]` | `lumenspawners.admin` | Give spawners |
| `/spawner rarity chance &lt;type&gt; [&lt;rarity&gt; &lt;percent&gt;]` | `lumenspawners.admin` | View or adjust per-type chance percentages |
| `/vspawner raritychance &lt;type&gt; &lt;rarity&gt; &lt;weight&gt;` | `lumenspawners.admin` | Set a relative rarity weight |
| `/vspawner leaderboard &lt;money\|drops\|xp&gt;` | None | View a leaderboard when enabled |
| `/vspawner reload` | `lumenspawners.admin` | Reload configuration and spawner definitions |

`lumenspawners.use` and `lumenspawners.sell` default to true. Admin and split permissions default to operators. Spawner ownership is enforced by default; breaking another player's spawner may also require `lumenspawners.break.others`.

## Configuration

- `config.yml`: general settings, item-spawner definitions, rarities, feature toggles, and storage capacities.
- `mobs.yml`: mob entity types, virtual drop tables, XP, and per-item sale prices.

Selling, evolution, upgrades, and leaderboards are individually configurable; evolution, upgrades, and leaderboards are off by default. Selling requires `selling.enabled`, Vault, an economy provider, configured prices, and `lumenspawners.sell`. Mob drop tables are virtual independent chance rolls and do not reproduce vanilla loot context such as looting or world difficulty.

## Troubleshooting

- **Plugin is unsupported or fails to enable:** confirm the server is Paper and inspect the startup stack trace. Other server distributions are not claimed as supported.
- **Spawner produces nothing:** check its type definition, production interval, enabled state, and storage capacity. Production pauses if the next cycle would exceed capacity.
- **Sell button is missing:** enable selling, configure the spawner's prices, and verify Vault plus an economy provider are active.
- **Player cannot manage a spawner:** check ownership settings and `lumenspawners.use`; breaking someone else's spawner has a separate permission.
- **Compatibility question:** the project has not been live-tested across all Minecraft releases. Validate your exact server on a test instance before production.
