# LumenShards

LumenShards gives your server one currency for AFK rewards, player payments, and shop purchases. Choose YAML or SQLite for player data, and add PlaceholderAPI if you want to show shard information elsewhere.

## Features

- Configure shard balances, caps, formatting, and storage.
- Reward players in configured AFK areas, including permission bonuses and teleport support.
- Offer a GUI shop with configurable prices, item bundles, and purchase commands.
- Show a paginated balance leaderboard stored separately from player balances.
- Provide PlaceholderAPI values for balances and upcoming AFK rewards.

## Installation

1. Use Paper 1.21.6–1.21.11 with Java 21.
2. [Request a license in the Lumen Studios Discord](/getting-started/licensing) and get the plugin jar through its official delivery channel.
3. Put the jar in `plugins/` and start the server once to create the config files.
4. Add the license key and scoped plugin token from staff to `plugins/LumenShards/config.yml`. Ask staff to add your server’s public egress IP to the license allowlist.
5. Set up AFK rewards, the shop, and storage, then restart the server.

**Never publish or share the license key or plugin token.** The license service validates the credentials over HTTPS. If it is temporarily unavailable, shard features remain disabled while validation retries. Invalid/revoked credentials are reported in the server log.

## Commands and permissions

`/shard` and `/shards` are aliases.

| Command | Permission |
| --- | --- |
| `/shard` or `/shard balance [player]` | `lumenshards.balance`; other-player balances also require `lumenshards.balance.others` |
| `/shard help` | `lumenshards.help` |
| `/shard top [page]` | `lumenshards.top` |
| `/shard pay &lt;player&gt; &lt;amount&gt;` | `lumenshards.pay` |
| `/shard shop` | `lumenshards.shop` |
| `/shard give &lt;player&gt; &lt;amount&gt;` | `shard.admin` / admin grant |
| `/shard take &lt;player&gt; &lt;amount&gt;` | `shard.admin` / admin grant |
| `/shard set &lt;player&gt; &lt;amount&gt;` | `shard.admin` / admin grant |
| `/shard setafk` | `shard.admin` / admin grant |
| `/shard reload` | `shard.admin` / admin grant |
| `/shard version` | `shard.admin` / admin grant |
| `/afk` | `lumenshards.afk` |

The plugin also defines granular `lumenshards.admin.*` permissions and a `shard.alwaysearn` bypass. Check your installed version’s permission definitions before granting admin access.

## Configuration

The data folder contains `config.yml`, `messages.yml`, `shop.yml`, `afk.yml`, and player storage. `config.yml` includes currency naming, starting balance, balance limits, storage type (`YAML` or `SQLITE`), permission settings, and licensing fields. Keep license fields private.

Set up the shop’s categories, prices, and rewards in `shop.yml`; rewards are only handed out when they fit in the player’s inventory, before shards are charged. `afk.yml` controls reward areas and timing. PlaceholderAPI values include `%shard_balance%`, `%shard_afk_reward_time%`, `%shard_afk_reward_seconds%`, `%shard_afk_reward_amount%`, and `%shard_afk_reward_bonus%`.

## Troubleshooting

- **License check fails:** check the license key, scoped plugin token, expiry/status, and server egress IP allowlist locally. Never post credentials in a support request.
- **AFK rewards do not arrive:** verify the AFK area and reward settings, player movement/region conditions, and `shard.alwaysearn` only if a bypass is intentionally needed.
- **Shop purchase is refused:** check the price and balance, and ensure the player's inventory can fit all configured rewards.
- **Placeholder values are missing:** install and enable PlaceholderAPI, then confirm the Shards expansion is available.
- **Leaderboard is empty after reset:** `leaderboard.db` is separate from balances and is repopulated when balances next change.
