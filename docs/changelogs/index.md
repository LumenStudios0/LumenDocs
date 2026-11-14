# Changelogs

## Website updates

### November 14, 2026

- Replaced browser confirmation boxes with purple in-site dialogs, including typed confirmation for permanent deletions.
- Added BuiltByBit purchase checks through the Discord account linked on BuiltByBit. Actual purchase verification still requires configured studio API access; linking Discord by itself does not grant a license.
- Shortened the account menu; licenses, purchases and settings remain in My account.
- Added a notification bell with an unread count across all pages, recent alerts and links to notification preferences. Counts refresh while the site is open and after alerts are read.
- Added separate Login and Signup tabs using secure Discord verification. Verified accounts are saved to the staff user directory with registration and last-seen dates; repeat sign-ins do not create duplicates.
- Added hierarchical website roles, configurable permissions and an access/settings audit.
- Added plugin/product registration, display-name editing, activation and guarded deletion in Staff Dashboard.
- Added BuiltByBit API availability to service status.

## Plugin release notes

Release notes can change with each plugin update. Use the official BuiltByBit resource pages below to check the latest release, update notes, and version-specific installation guidance. This documentation does not reproduce release history that may be out of date.

[Browse recently collected updates](/changelogs/updates) · The update feed is refreshed every 10 minutes. BuiltByBit may block automated requests; a read-only `LUMEN_SOURCE_READ_TOKEN` Actions secret enables clearly labeled source-repository development updates as a fallback.

To enable that fallback, add a fine-grained token with **Contents: read-only** access to the plugin repositories as the `LUMEN_SOURCE_READ_TOKEN` secret under the LumenDocs repository’s **Settings → Secrets and variables → Actions**. Never put the token in the site or source code.

<div class="changelog-grid">
  <a href="https://builtbybit.com/resources/lumenauction.132967/" target="_blank" rel="noreferrer"><strong>LumenAuction</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/gladiator.132519/" target="_blank" rel="noreferrer"><strong>Gladiator</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenspoof.135950/" target="_blank" rel="noreferrer"><strong>LumenSpoofer</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenduels.119760/" target="_blank" rel="noreferrer"><strong>LumenDuels</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenduels-premium.132188/" target="_blank" rel="noreferrer"><strong>LumenDuels Premium</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenbounty.132973/" target="_blank" rel="noreferrer"><strong>LumenBounty</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumeneconomy.132341/" target="_blank" rel="noreferrer"><strong>LumenEconomy</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenessentials.132966/" target="_blank" rel="noreferrer"><strong>LumenEssentials</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenorders.132969/" target="_blank" rel="noreferrer"><strong>LumenOrder</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenshards.116897/" target="_blank" rel="noreferrer"><strong>LumenShards</strong><span>Open official resource and release notes ↗</span></a>
  <a href="https://builtbybit.com/resources/lumenspawners.132970/" target="_blank" rel="noreferrer"><strong>LumenSpawners</strong><span>Open official resource and release notes ↗</span></a>
</div>

For version compatibility and setup notes already covered here, see the [compatibility guide](/getting-started/compatibility) and each plugin’s documentation. Always compare those details with the notes for the exact jar you installed.
