# LumenShards

LumenShards is a configurable shard currency plugin for Paper servers. AFK rewards, player payments, and shop purchases all use the same balance. It supports YAML or SQLite player storage and optional PlaceholderAPI integration.

## Features

- Configure shard balances, caps, formatting, and storage.
- Reward players in configured AFK areas, including permission bonuses and teleport support.
- Offer a GUI shop with configurable prices, item bundles, and purchase commands.
- Show a paginated balance leaderboard stored separately from player balances.
- Provide PlaceholderAPI values for balances and upcoming AFK rewards.

## Installation

1. Use Paper 1.21.6–1.21.11 with Java 21.
2. Obtain the plugin jar and the private license credentials through the official product delivery channel.
3. Install the jar in `plugins/` and start the server.
4. Configure the license key and scoped plugin token locally in `plugins/LumenShards/config.yml`. Add the server's public egress IP to the license allowlist.
5. Configure AFK, shop, and storage settings, then restart.

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

The plugin also defines granular `lumenshards.admin.*` permissions and a `shard.alwaysearn` bypass. See the plugin permission definitions and your installed version's config before granting administrative access.

## Configuration

The data folder contains `config.yml`, `messages.yml`, `shop.yml`, `afk.yml`, and player storage. `config.yml` includes currency naming, starting balance, balance limits, storage type (`YAML` or `SQLITE`), permission settings, and licensing fields. Keep license fields private.

`shop.yml` controls categories, prices, item rewards, and console/player purchase commands. Multi-item rewards are delivered only if the inventory has room before the shard cost is charged. `afk.yml` controls reward areas and timing. PlaceholderAPI identifiers include `%shard_balance%`, `%shard_afk_reward_time%`, `%shard_afk_reward_seconds%`, `%shard_afk_reward_amount%`, and `%shard_afk_reward_bonus%`.

## Troubleshooting

- **License check fails:** check the license key, scoped plugin token, expiry/status, and server egress IP allowlist locally. Never post credentials in a support request.
- **AFK rewards do not arrive:** verify the AFK area and reward settings, player movement/region conditions, and `shard.alwaysearn` only if a bypass is intentionally needed.
- **Shop purchase is refused:** check the price and balance, and ensure the player's inventory can fit all configured rewards.
- **Placeholder values are missing:** install and enable PlaceholderAPI, then confirm the Shards expansion is available.
- **Leaderboard is empty after reset:** `leaderboard.db` is separate from balances and is repopulated when balances next change.
