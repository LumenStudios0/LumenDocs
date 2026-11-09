# LumenDuels

<span class="compat-badge">Minecraft API 1.21 · check release notes for exact server and Java requirements</span>

Build out your server’s PvP scene with duels, queues, arenas, kits, and ranked progression. LumenDuels also tracks Elo, ranks, leaderboards, and shop rewards. PlaceholderAPI, Vault, and WorldGuard are optional integrations.

<a class="buy-now" href="https://builtbybit.com/resources/lumenduels.119760/" target="_blank" rel="noreferrer">Buy LumenDuels on BuiltByBit ↗</a>

## Features

- Challenge players and manage duel requests.
- Use configured arenas, duel types, kits, and queues.
- Enable ranked and unranked categories with Elo and rank progression.
- Configure editable kits and cosmetic effects.
- Configure SQLite or MySQL storage in `config.yml`.

The plugin declares API version 1.21. Check the release notes that came with your jar for its exact server and Java requirements.

## Installation

1. Back up your server and choose a storage backend in `plugins/LumenDuels/config.yml`.
2. If using MySQL, configure the database host, port, database name, user, and password in the local server config. Never publish credentials.
3. Place the plugin jar in `plugins/` and restart.
4. Configure arenas, kits, ranks, shop, GUI text, and messages in the generated files.
5. Add any optional integration plugins required by enabled features, then verify duel lifecycle and arena restoration on a test server.

## Commands and permissions

The main command is `/duel`; `/duels` is its alias. The plugin descriptor advertises these command flows:

| Command | Purpose |
| --- | --- |
| `/duel` | Open the duel interface |
| `/duel accept` / `/duel deny` / `/duel leave` | Respond to or leave a duel |
| `/duel stats` | View duel statistics |
| `/duel setspawn` | Configure the duel spawn |
| `/duel addarena` / `/duel setspawnpoint` | Configure arenas and spawn points |
| `/duel shop` / `/duel ranks` / `/duel leaderboards` / `/duel kits` | Open related menus |
| `/duel reload` | Reload plugin configuration |

`lumen.duels.admin` defaults to operators. The plugin descriptor explicitly declares this administrative node; check the command's permission checks and your installed version before granting additional access.

## Configuration

| File | Purpose |
| --- | --- |
| `config.yml` | Storage, duel settings, spawnpoint, chat, kit editor, WorldGuard regions, and ranked queues |
| `arenas.yml` | Arena worlds, spawn points, supported duel types, and enablement |
| `kits.yml` | Duel kit definitions |
| `ranks.yml` | Rank progression and presentation |
| `shop.yml` | Elo shop categories, rewards, and messages |
| `gui.yml` / `messages.yml` | Menu layout and player-facing text |

Before opening queues to players, check the cleanup options—especially inventory handling and arena block restoration—and make sure any required WorldGuard regions are set up.

## Troubleshooting

- **Something isn’t showing up:** check its setting in `config.yml` and install the optional integration it needs, if any.
- **Players can’t enter an arena:** check the world name, both spawn points, enabled state, supported duel types, and WorldGuard region.
- **The database won’t connect:** confirm the selected SQLite/MySQL settings and read the startup log. Keep database passwords out of shared configs.
- **An admin command is denied:** check `lumen.duels.admin` and the command’s own permission requirement.
- **Arena cleanup looks wrong:** test on a copy of the world and check the cleanup settings before using live arenas.
