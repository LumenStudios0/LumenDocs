# LumenCosmetics

LumenCosmetics is a configurable cosmetics plugin for Bukkit, Spigot, Paper, and Purpur servers. It supports Minecraft 1.21+ and Java 21.

## Features

- Chat tags, kill effects, death effects, halos, and trails.
- GUI menus with cosmetic definitions loaded from YAML.
- Permission-based unlocks, including wildcard permission patterns.
- Reload configuration and cosmetic definitions without editing plugin code.

## Installation

1. Confirm the server is Bukkit-based, runs Minecraft 1.21+, and uses Java 21.
2. Place the plugin jar in `plugins/` and start or restart the server.
3. Configure the generated YAML files in `plugins/LumenCosmetics/`.
4. Grant player access with the permissions manager and test each cosmetic on a staging server.

## Commands and permissions

| Command | Purpose |
| --- | --- |
| `/cosmetics` | Open the main menu |
| `/cosmetics tags` | Open the chat-tag menu |
| `/cosmetics effects` | Open the effects menu |
| `/cosmetics halos` | Open the halo menu |
| `/cosmetics trails` | Open the trail menu |
| `/cosmetics equip &lt;id&gt;` | Equip a cosmetic |
| `/cosmetics unequip` | Clear equipped cosmetics |
| `/cosmetics reload` | Reload configuration and cosmetics |
| `/cosmetics give &lt;player&gt; &lt;id&gt;` | Give a cosmetic (admin) |

`lumencosmetics.use` grants player use; `lumencosmetics.admin` grants administration. Cosmetic unlock nodes follow patterns such as `cosmetics.chattag.void.allow`, `cosmetics.killeffect.lightning.allow`, `cosmetics.deatheffect.smoke_burst.allow`, `cosmetics.halo.angel.allow`, and `cosmetics.trail.flame.allow`. Wildcards such as `cosmetics.*` are supported.

## Configuration

The plugin reads `config.yml`, `messages.yml`, `menus.yml`, `chattags.yml`, `kill-effects.yml`, `death-effects.yml`, `halos.yml`, and `trails.yml` from `plugins/LumenCosmetics/`. Customize cosmetic IDs and definitions in the type-specific files, then use `/cosmetics reload` to apply changes.

## Troubleshooting

- **Command is unknown:** confirm the plugin enabled successfully and check for command conflicts with another plugin.
- **Cosmetic is locked:** verify the cosmetic ID and grant the matching permission node or wildcard.
- **Cosmetic/menu changes are missing:** confirm valid YAML, correct data-folder filename, and run `/cosmetics reload`.
- **Effect does not display:** verify the cosmetic is enabled and equipped, then test on the documented Minecraft 1.21+ platform.
