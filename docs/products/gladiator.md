# Gladiator

Gladiator provides configurable server-side security signals and a staff dashboard. It uses Bukkit events for many checks and optionally uses PacketEvents for packet masking and entity-attached sound suppression.

## Features

- Modular movement, combat, interaction, anti-ESP, anti-xray, anti-structure, and rate-limit checks.
- Configurable alerting, violation scoring, check thresholds, and enforcement modes.
- A dashboard for module status, player profiles, security logs, and diagnostics.
- Optional integrations for PacketEvents, Geyser/Floodgate, and Discord webhooks.
- Read-only diagnostics and explicitly labelled test alerts.

**Treat detections as signals, not proof.** Many checks are heuristics and can produce false positives. Packet masking is version-sensitive and does not guarantee protection from every modified client.

## Installation

1. Use Java 21+ and a server compatible with the Spigot API 1.21.1 build target. Validate your exact fork/version on a test server.
2. Install Gladiator in `plugins/` and start the server.
3. Install a PacketEvents release that explicitly supports the exact server software and protocol if using packet masking. It is not bundled.
4. Configure `config.yml`, `anticheat.yml`, and `ores.yml`; run `/gladiator test` to inspect module and integration status.
5. Tune alert thresholds and enforcement in staging before enabling punishments.

Paper/Purpur also provide their own native Anti-Xray settings; those are configured per world and require a restart. They are separate from Gladiator.

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

Default `enforcement.mode: scored` alerts on signals and requires detections from distinct groups before a kick; `per-check` applies configured single-check responses. Tune carefully: client brand reports are spoofable, shared networks can affect address-based checks, and event heuristics are not universal cheat detection. Keep Discord webhook URLs private and use HTTPS.

## Troubleshooting

- **Anti-xray or structure masking is unavailable:** install a compatible PacketEvents version and check startup/module diagnostics. The exact Minecraft protocol must be supported.
- **Packet checks show no activity:** some counters need relevant traffic since startup; a zero count does not prove a feature is broken.
- **Bedrock integration cannot identify players:** verify Geyser/Floodgate is installed and, behind a proxy, that Floodgate forwarding and keys are configured correctly.
- **False positives:** use staff alerts first, tune thresholds, and avoid treating signals as conclusive evidence.
- **Discord alerts fail:** verify the webhook is valid and enabled; `/gladiator test discord` sends an actual message. Never share the URL.
- **Native Anti-Xray does not change immediately:** Paper/Purpur native per-world Anti-Xray is separate from Gladiator and requires a server restart.
