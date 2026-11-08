# LumenEssentials

LumenEssentials is a staff and moderation plugin with a staff dashboard, persistent moderation status and history, moderation commands, chat controls, player notes and requests, inventory snapshots, and a scoped player-data wipe workflow.

## Features

- Permission-gated dashboard for player actions, punishments, staff tools, statistics, and security logs.
- Persistent punishment history, staff notes, assistance requests, and moderation statuses.
- Chat-log search, item search, entity counts, inventory snapshots, and confirmed restore workflows.
- Configurable chat moderation, announcements, and scheduled restarts.
- Explicit player-wipe previews and backups, controlled by separate configuration and permissions.

## Installation

1. Use a Java 21 runtime and a server with the Bukkit API. The project compiles against Paper API 1.21.11; other Bukkit-family runtimes still need validation.
2. Place `LumenEssentials.jar` in `plugins/` and start the server to generate config files, the SQLite database, and backup directory.
3. Review `config.yml`, `wipe.yml`, and permission assignments before enabling staff workflows.
4. Restart after installing any integration plugin.

SQLite JDBC is included in the jar; the Paper API is not bundled.

## Commands and permissions

| Command | Purpose |
| --- | --- |
| `/staffdashboard` (`/staffmenu`) | Open the category-based staff dashboard |
| `/stafftools` | Open staff tools |
| `/staffnote &lt;player&gt; &lt;text&gt;` / `/staffnotes &lt;player&gt; [search]` | Create or search private notes |
| `/staffrequest &lt;message&gt;` / `/staffrequests` | Create or manage staff assistance requests |
| `/chatlogs [player] [keyword] [minutes]` | Search saved public chat |
| `/itemsearch &lt;material&gt;` | Search online-player inventories |
| `/entitycount [radius]` | Count nearby non-player entities |
| `/invrollback &lt;online-player&gt;` | Review snapshots and perform a confirmed restore |
| `/ban`, `/tempban`, `/unban`, `/warn`, `/kick` | Manage bans, warnings, and kicks |
| `/mute`, `/tempmute`, `/unmute`, `/punish`, `/history` | Manage or inspect punishments |
| `/staffstatus &lt;player&gt; &lt;CLEAR\|MODERATE\|WATCH LIST&gt;` | Set an investigation label |
| `/fly`, `/god`, `/freeze`, `/unfreeze` | Use permission-gated staff tools |
| `/lockchat`, `/unlockchat`, `/slowchat &lt;seconds&gt;`, `/clearchat` | Moderate public chat |
| `/playerwipe &lt;player&gt;` | Open wipe-category selection |
| `/playerwipe preview &lt;player&gt;` | Preview configured wipe selections |
| `/playerwipe integrations`, `/playerwipe history <player>`, `/playerwipe reload` | Inspect, review, or reload wipe settings |

Every command has permission checks; destructive and staff-management permissions default to operator or false. Important specific nodes include `lumenessentials.playerwipe`, `.preview`, `.admin`, `.history`, `lumenessentials.dashboard.stats`, `lumenessentials.audit.view`, and `lumenessentials.inventory-snapshot.restore`. See the plugin's permission definitions and grant only the actions each role needs.

## Configuration

- `config.yml`: dashboard, staff permissions, punishments, chat controls, privacy/retention, integrations, restart announcements, and wipe defaults.
- `messages.yml`: command and menu text.
- `punishments.yml`: reason suggestions, duration presets, templates, announcements, and expiry polling.
- `stashes.yml`: spawn-stash settings; this feature is disabled and not yet executable.
- `wipe.yml`: preview/backup requirements, confirmations, integration detection, and database-adapter policy.

Use `/playerwipe reload` to validate/reload settings; invalid values are logged, and active wipe sessions are invalidated. Review `wipe.yml` and backups before granting wipe access.

## Troubleshooting

- **A dashboard action is absent:** dashboard entries are hidden unless the viewer has the relevant permission.
- **Wipe does not start:** check `wipe.yml`, adapter status via `/playerwipe integrations`, preview/backup requirements, and the wipe permissions.
- **Restore fails:** the target must be online, the staff member needs `lumenessentials.inventory-snapshot.restore`, and the typed confirmation must match.
- **Chat logs or alt links raise privacy concerns:** chat logging can be disabled and is retained for a configured period. Alt-link tracking stores keyed address hashes, not raw addresses; its alerts are not proof of shared ownership.
- **Reload is rejected:** inspect the console for invalid configuration values, then restore valid settings before retrying.
