# LumenSpoofer

<span class="compat-badge">Paper · Minecraft 1.21.6–1.21.11 and 26.1+ · test exact server build</span>

Give your server a few extra hands. LumenSpoofer adds player-like NPCs that can explore, gather materials, follow task queues, fight in team roles, and bring supplies back to shared storage.

<a class="buy-now" href="https://builtbybit.com/resources/lumenspoof.135950/" target="_blank" rel="noreferrer">Buy LumenSpoofer on BuiltByBit ↗</a>

## What it does

- Spawn named NPCs and choose what they work on.
- Send them exploring, gathering, or into team-based combat roles.
- Let them remember work and return gathered materials to shared team storage.
- Manage them from an in-game dashboard.

## Installation

LumenSpoofer is built against Paper 1.21.6. Its startup version check allows Minecraft 1.21.6–1.21.11 and 26.1+, but its fake-player backend uses server internals that can change between releases. **Paper is the intended platform; Spigot and Bukkit support has not been verified.** Test the exact server version before using it on a live server.

Get the jar through the official product listing, put it in `plugins/`, and restart. If the NPC backend is incompatible, the plugin reports an error in the server console.

## Commands

| Command | Purpose |
| --- | --- |
| `/Ls` | Open the NPC dashboard |
| `/Ls help` | Show available commands |
| `/Ls spawn <name>` | Create an NPC |
| `/Ls mode <name> <mode>` | Choose an NPC's behavior |
| `/Ls goal <name> status` | Check an NPC's current task |
| `/Ls remove <name>` | Remove an NPC |
| `/Ls reload` | Reload configuration |
| `/Ls devtest run npc-navigation <bot>` | Run a live navigation test; requires `lumen.npc.dev` |

Use `/Ls` in game to see the commands available in your installed version.

## Configuration

Edit `plugins/LumenSpoofer/config.yml`. NPCs walk between tasks by default; sprint-jumping during routine gathering and exploration is off by default. To enable route sprint-jumps, set `npc.movement.horizontal.sprint-jumping.enabled: true`. Changes to logging can be made with `logging.level` (`WARNING`, `INFO`, or `FINE`); use `/Ls reload` to apply supported settings.

## Troubleshooting

- **The plugin disables itself on startup:** check the console for fake-player backend or server-version errors.
- **Your server fork is not Paper:** Paper is the intended platform; Spigot and Bukkit have not been verified.
- **The NPC doesn’t move as expected:** check its task with `/Ls goal <name> status` and review movement settings in `config.yml`.
- **Testing on a new Minecraft release:** start with a test server. A passing build alone does not confirm the runtime backend works on that release.
