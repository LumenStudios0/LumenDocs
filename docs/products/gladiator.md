# Gladiator

<span class="compat-badge">Minecraft 1.21.6–1.21.11 · Java 21+ · Bukkit, Spigot, Paper, Purpur</span>

Gladiator brings server-side security checks and staff tools together. Many checks use normal Bukkit events; packet masking and a few other features need a compatible PacketEvents install.

<a class="buy-now" href="https://builtbybit.com/resources/gladiator.132519/" target="_blank" rel="noreferrer">Buy Gladiator on BuiltByBit ↗</a>

## Features

- Modular movement, combat, interaction, anti-ESP, anti-xray, anti-structure, and rate-limit checks.
- Configurable alerting, violation scoring, check thresholds, and enforcement modes.
- A dashboard for module status, player profiles, security logs, and diagnostics.
- Optional integrations for PacketEvents, Geyser/Floodgate, and Discord webhooks.
- Read-only diagnostics and explicitly labelled test alerts.

**A detection is a signal, not proof.** Some checks are heuristics and can flag normal play. Packet masking also depends on the exact server and protocol version, so test it before relying on it.

## Installation

1. Use Minecraft 1.21.6–1.21.11 on Spigot, Bukkit, Paper, or Purpur, with Java 21+.
2. Install Gladiator in `plugins/` and start the server.
3. Install a PacketEvents release that explicitly supports the exact server software and protocol if using packet masking. It is not bundled.
4. Configure `config.yml`, `anticheat.yml`, and `ores.yml`; run `/gladiator test` to inspect module and integration status.
5. Test your exact server build and tune alert thresholds before enabling punishments.

Paper and Purpur have their own native Anti-Xray settings. Configure those per world and restart the server; they’re separate from Gladiator.

## Commands and permissions

| Command | Purpose | Permission |
| --- | --- | --- |
| `/gladiator` / `/gladiator dashboard` | Open the staff dashboard | Dashboard access is permission-gated |
| `/gladiator reload` | Reload settings | `gladiator.admin` |
| `/gladiator test` | Read-only module/integration diagnostics | `gladiator.test` (granted by `gladiator.admin`) |
| `/gladiator test alerts [module\|all]` | Send labelled test alerts | `gladiator.test` |
| `/gladiator test discord` | Send a test webhook message | `gladiator.test` |
| `/gladiator test punishment &lt;module&gt; &lt;player&gt; [confirm]` | Apply that module's configured action to a test player | `gladiator.test` |
| `/gladiator alerts` | Manage personal alert preferences | `gladiator.alerts` |

The punishment test can apply a real kick, ban, or temporary ban; permanent/destructive actions require the literal `confirm`. Use a safe test account. Discord testing sends a real message.

## Configuration

- `config.yml`: general, notifications, modules, enforcement, ore alerts, and optional Discord integration.
- `anticheat.yml`: behavioral checks, thresholds, violation points, punishment settings, and client-brand behavior.
- `ores.yml`: weighted mining-alert thresholds and ore definitions.

By default, `enforcement.mode: scored` alerts on signals and requires detections from distinct groups before a kick. `per-check` applies each check’s configured response on its own. Start with alerts and tune on a test server—client brands can be spoofed, shared networks can confuse address-based checks, and event heuristics can’t identify every cheat. Keep Discord webhook URLs private and use HTTPS.

## Troubleshooting

- **Masking isn’t available:** check that PacketEvents supports your exact server version, then run `/gladiator test` and review the startup log.
- **A packet counter is still at zero:** it only counts relevant traffic since startup; nothing may have triggered it yet.
- **Bedrock players aren’t recognized:** check Geyser/Floodgate and, if you use a proxy, its forwarding settings and shared key.
- **A player was flagged unexpectedly:** begin with staff alerts and tune the threshold. A flag by itself isn’t proof of cheating.
- **Discord alerts aren’t arriving:** run `/gladiator test discord` and check that the webhook is enabled. Keep its URL private.
- **Paper Anti-Xray changes haven’t appeared:** Gladiator doesn’t control that setting; Paper/Purpur require a restart for their native configuration.
