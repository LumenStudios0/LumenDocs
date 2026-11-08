# LumenDuels

LumenDuels provides player duels, matchmaking queues, arenas, kits, statistics, ranked play, Elo progression, leaderboards, and reward shop features. Optional integrations declared by the plugin include PlaceholderAPI, Vault, and WorldGuard.

## Features

- Challenge players and manage duel requests.
- Use configured arenas, duel types, kits, and queues.
- Enable ranked and unranked categories with Elo and rank progression.
- Configure editable kits and cosmetic effects.
- Configure SQLite or MySQL storage in `config.yml`.

The plugin descriptor declares API version 1.21. Confirm the supported server and Java versions for the exact plugin jar with its release notes.

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

Review cleanup behavior (inventory wiping and arena block restoration), ranked settings, and WorldGuard region requirements before opening queues to players.

## Troubleshooting

- **A feature is missing:** check whether it is enabled in `config.yml` and whether its optional integration (PlaceholderAPI, Vault, or WorldGuard) is installed.
- **Arena cannot be used:** validate world names, both spawn positions, arena enablement, supported duel types, and any configured WorldGuard region.
- **Storage connection fails:** verify SQLite/MySQL selection and local database settings; keep credentials private and check startup logs.
- **Player cannot use an admin action:** verify `lumen.duels.admin` and the specific command's permission check.
- **Restore or cleanup behaves unexpectedly:** test on a copied world and verify duel cleanup options before using production arenas.
