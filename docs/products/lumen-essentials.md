# LumenEssentials

LumenEssentials puts day-to-day staff work in one place: a dashboard, moderation commands, notes, assistance requests, chat tools, and inventory snapshots. The player-data wipe workflow is separate and deliberately permission-gated.

<a class="buy-now" href="https://builtbybit.com/resources/lumenessentials.132966/" target="_blank" rel="noreferrer">Buy LumenEssentials on BuiltByBit ↗</a>

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

The SQLite driver is included in the jar. The Paper API is not, so your server needs to provide it.

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

Commands check permissions individually. Destructive and staff-management access defaults to operators or disabled. Nodes to review include `lumenessentials.playerwipe`, `.preview`, `.admin`, `.history`, `lumenessentials.dashboard.stats`, `lumenessentials.audit.view`, and `lumenessentials.inventory-snapshot.restore`; give staff only the access they need.

## Configuration

- `config.yml`: dashboard, staff permissions, punishments, chat controls, privacy/retention, integrations, restart announcements, and wipe defaults.
- `messages.yml`: command and menu text.
- `punishments.yml`: reason suggestions, duration presets, templates, announcements, and expiry polling.
- `stashes.yml`: spawn-stash settings; this feature is disabled and not yet executable.
- `wipe.yml`: preview/backup requirements, confirmations, integration detection, and database-adapter policy.

Use `/playerwipe reload` to check and reload settings. Invalid values are reported in the console, and active wipe sessions are cleared. Read `wipe.yml` and confirm your backup process before granting anyone wipe access.

## Troubleshooting

- **A dashboard option is missing:** options only appear when your account has the permission for them.
- **A wipe won’t begin:** check `wipe.yml`, the adapter report from `/playerwipe integrations`, and the preview, backup, and permission requirements.
- **An inventory restore is denied:** the player must be online, you need `lumenessentials.inventory-snapshot.restore`, and the confirmation must match.
- **Questions about chat logs or linked accounts:** chat logging can be turned off and has configurable retention. Alt-link alerts are only a signal; they don’t prove that accounts belong to the same person.
- **Reload reports an error:** check the console for the setting it couldn’t validate, fix it, and try again.
