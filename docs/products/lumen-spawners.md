# LumenSpawners

Build a spawner setup without filling your world with mobs. LumenSpawners produces configured drops and items virtually, and saves each spawner and its stored output in SQLite.

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

Building from source requires Java 21 and Maven 3.9 or newer. The jar includes SQLite JDBC, but not Paper or Vault.

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

Players have `lumenspawners.use` and `lumenspawners.sell` by default. Admin and split permissions default to operators. Spawners belong to their owners by default; breaking another player’s spawner may also need `lumenspawners.break.others`.

## Configuration

- `config.yml`: general settings, item-spawner definitions, rarities, feature toggles, and storage capacities.
- `mobs.yml`: mob entity types, virtual drop tables, XP, and per-item sale prices.

You can switch selling, evolution, upgrades, and leaderboards on or off; evolution, upgrades, and leaderboards start disabled. Selling also needs `selling.enabled`, Vault, an economy provider, configured prices, and `lumenspawners.sell`. Mob drops use their own configured chance rolls, rather than vanilla loot rules such as looting or world difficulty.

## Troubleshooting

- **The plugin won’t start:** check the server is Paper and look at the first error in the startup log.
- **A spawner isn’t producing:** check its type, interval, and storage. Production pauses when the next cycle won’t fit; it doesn’t throw items away.
- **There’s no sell button:** turn on selling, set prices, and make sure Vault and an economy provider are running.
- **A player can’t open or break a spawner:** check the owner setting and the relevant use or break permission.
- **Not sure your server version is supported?:** test the exact server build first; not every release has been live-tested.
