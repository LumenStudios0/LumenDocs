import { hasPermission, resolveAccess } from './access-control.js'

// Served only after authorization; never imported into the Pages application.
const guides = [
  {
    id: 'start-here', category: 'Staff handbook', title: 'Start your shift', summary: 'A practical checklist for every support team member.',
    body: `### Start with the right account
Sign in with your staff Discord account. Staff mode needs Support team rank or higher and the staff.docs permission. Your tools are limited by your current permissions; the role name alone is not authorization.

### Shift checklist
- Review open and waiting tickets in Staff Dashboard.
- Check escalated tickets and requests assigned to you.
- Read service status and recent incidents before diagnosing an outage.
- Review pending trial requests only if you can grant licenses.
- Leave clear handover notes on unresolved work. Do not repeat an uncertain license grant.

### Protect customer information
Never request license keys, plugin tokens, passwords, webhook URLs, or complete server configs in a ticket. Ask for sanitized error messages, plugin/version details, and reproduction steps. Staff guides are private: do not paste internal procedures into public announcements.`,
  },
  {
    id: 'ticket-playbook', category: 'Staff handbook', title: 'Tickets and replies', summary: 'Triage, assignment, replies, escalation, and follow-up.',
    body: `### Triage first
Read the full conversation. Confirm the request type, affected plugin, version, server software, and expected behavior. Commission requests need a clear scope; license support needs a sanitized validation error.

### Own the next step
Assign the ticket to the appropriate staff member and apply useful labels. Reply with one actionable next step, explain what you need, and avoid promises you cannot verify. Staff replies appear privately on the website.

### Escalate deliberately
Record why the ticket needs another staff member and select an authorized support target when appropriate. Escalation can notify that person privately. Include what was tested and what remains uncertain.

### Follow-up and closure
Unanswered-ticket reminders use the existing Discord webhook and can be configured from 1 to 168 hours. They are not guaranteed personal DMs. Close a ticket after confirming the outcome or explaining the resolution; customers can rate closed tickets.`,
  },
  {
    id: 'license-support', category: 'Staff handbook', title: 'License support workflow', summary: 'Verify ownership and diagnose access without collecting secrets.',
    body: `### Confirm the customer
Use the customer's signed-in Discord identity and the staff customer directory. Client role does not prove a purchase. Check current licenses and account restrictions before issuing access.

### Check the common blockers
- Confirm the product and linked plugin are active.
- Check expiry, suspension, revocation, bans, holds, and requested verification.
- Ask the customer to add the server's public IP in My licenses. A key with no allowed IP cannot validate.
- Confirm the customer uses the key for the eligible product, not an old key.
- If licensing is unavailable, say so. Never replace a failed lookup with an assumed entitlement.

### Grant carefully
Staff-granted access does not require BuiltByBit login. Select an active linked product, choose expiry, review the customer ID, and save the one-time key securely if one is returned. Do not expose keys in tickets. Uncertain grants require checking the customer profile before retrying.

### Purchase linking
The customer must link the same Discord identity on BuiltByBit and check purchases in My licenses. Marketplace verification and website roles are separate. The first shared-key claim can replace legacy keys and requires updating configs and re-adding IPs.`,
  },
  {
    id: 'trials-commissions', category: 'Staff handbook', title: 'Trials and commissions', summary: 'Review trial lengths and qualify custom plugin requests.',
    body: `### Trial requests
Customers choose a plugin, a reason, and 1, 3, 7, or 30 days. Submission works without the licensing registry. Approval does not: it verifies the active linked product and the customer's existing access.

The selected duration is the default for approval; staff can adjust it. Preserve existing active access. Processing or unconfirmed grants must be investigated manually, not repeated. Declining should include a clear, respectful review note.

### Commission requests
Clarify the requested Minecraft plugin or feature, server platform/version, required integrations, acceptance criteria, deadline, and budget range if provided. Do not promise pricing or delivery dates without approval from the studio lead.

Keep scope discussions in the private ticket. Escalate technical feasibility to a developer and commercial commitments to studio leadership.`,
  },
  {
    id: 'publishing', category: 'Staff handbook', title: 'Updates and announcements', summary: 'Publish useful customer-facing news safely.',
    body: `### Write for customers
Release notes contain only published changes that customers need to know. Never include credential setup instructions, internal endpoints, private source commits, tokens, or private troubleshooting.

### Publishing controls
Authorized staff can publish announcements, updates, scheduled posts, and product release notes. Review the audience, product, version, compatibility details, and scheduled time before saving.

Use headings, bold, lists, code, and supported colors in the editor. Announcement images currently use HTTPS image links. Check that the image itself contains no customer data or secrets.

### Release drafts
Keep unfinished releases as drafts. Published product/version identifiers stay fixed. A release note does not build a plugin or grant a license.`,
  },
  {
    id: 'incidents', category: 'Staff handbook', title: 'Incidents and handovers', summary: 'Reachability is not an end-to-end service guarantee.',
    body: `### Read status correctly
Website, Discord, licensing, and BuiltByBit checks report reachability. Operational does not prove that every purchase, sign-in, or Minecraft installation works. Automatic checks run every five minutes.

### During an incident
Record the affected feature, safe reproduction steps, start time, scope, and current workaround. Authorized staff can apply maintenance/status overrides and run checks. Avoid sharing credentials or raw customer payloads.

### Recovery
Verify the actual affected workflow before announcing recovery. Restore automatic status after a manual override when appropriate. Incident history records transitions. Handover notes should state who owns the next check and what is still unverified.`,
  },
  {
    id: 'registry', category: 'Developer desk', title: 'Registry and product setup', summary: 'IDs, tokens, product links, and deletion dependencies.',
    body: `### Register in order
Register the plugin and save its one-time plugin token. Create the licensing product with a stable canonical Product ID. Link the active plugin to the active product. Registration alone neither grants ownership nor changes a JAR.

### IDs matter
Plugin ID and Product ID are distinct. Website trial/download catalogs use explicit canonical product IDs; coordinate catalog changes when recreating products. Do not assume a matching display name maps to the same ID.

### Tokens
Plugin tokens are not admin credentials. Rotating a token requires updating affected plugin builds/configuration. Never publish real tokens or embed administrator/BuiltByBit credentials in a JAR.

### Deletion is not deactivation
Deactivate products before unlinking. License rows block product deletion. Revoked account entitlements and connected-server records can also restrict deletion; the backend may report a generic conflict. Escalate such cases to the owner for a backed-up, scoped cleanup. Never delete customer accounts just to remove a product.`,
  },
  {
    id: 'integration', category: 'Developer desk', title: 'Integrate licensing into a plugin', summary: 'The validation contract, runtime handling, and safe configuration.',
    body: `### Required inputs
Use the Plugin ID, its plugin token, the linked Product ID, the licensing API HTTPS base URL, and the customer's license key. serverId is optional; use a stable installation identifier when reporting server connections.

### Validation request
POST https://license.lumenstudio.fyi/v1/validate
Send Content-Type: application/json and the plugin token as X-Plugin-Token.

\`\`\`json
{
  "licenseKey": "CUSTOMER_PROVIDED_KEY",
  "pluginId": "YOUR_PLUGIN_ID",
  "productId": "YOUR_PRODUCT_ID",
  "serverId": "stable-id-for-this-server"
}
\`\`\`

### Runtime rules
Read the JSON response: only valid: true authorizes licensed features. HTTP 200 alone is not authorization. Treat timeouts, malformed responses, and service failures explicitly; do not silently grant access. Keep HTTP work off the Minecraft main thread and use timeouts. Apply Bukkit/Paper lifecycle changes on the appropriate server thread.

### Secret boundaries
The customer enters their key in the plugin-specific config. Do not hard-code it or log it. A token bundled in a JAR can be extracted; it must not authorize privileged admin operations. Never ship the licensing administrator token, source-read credentials, or BuiltByBit credentials.`,
  },
  {
    id: 'builds-downloads', category: 'Developer desk', title: 'Builds and private downloads', summary: 'Maven, trusted uploads, compatibility, and release checks.',
    body: `### Build from the right source
Use the project's Maven configuration and declared Java version. Successful compilation is not runtime compatibility proof. Test the target server platform and version; review required dependencies and migration instructions.

### Manual JAR upload
Authorized product-management staff can choose a plugin and upload a trusted JAR up to 32 MiB from Plugins & products. The server verifies the stored SHA-256 and plugin JAR structure before private publication. It is not a malware scan. Transfers are paced; do not spam retries.

### Drafts and uncertain outcomes
Uploads have actor-owned drafts that expire after 24 hours. Refresh builds after an uncertain result and discard failed drafts before retrying. Existing binaries are not replaced by failed uploads.

### Access stays separate
Uploads do not create products, link plugins, or grant licenses. Customer downloads require a verified active entitlement to the canonical product. Never publish paid JARs in public releases or website assets.`,
  },
  {
    id: 'permissions', category: 'Staff handbook', title: 'Roles and permission controls', summary: 'What you can delegate and how member toggles work.',
    body: `### Hierarchy
Guest < Client < Support team < Developer < Studio Lead < Owner. Ranks are fixed; permission sets are independent. Staff mode always requires Support team rank or higher plus staff.docs, even if someone tries to grant the permission to a customer.

### Edit safely
Open Staff Dashboard > Website settings > Preset role permissions. Select Guest or Client to control new support requests, trial requests, and community posting. These switches affect signed-in users and do not grant product ownership. Existing tickets can still be read and replied to.

### Delegation
Only authorized staff can edit lower roles, and non-owners cannot delegate a permission they do not hold. Owner permissions remain fixed. Changes apply to existing sessions on the next request.

### Access problems
Ask the user to refresh permissions or sign in with the correct Discord identity. Verify the current role and permissions rather than trusting a hidden/visible button. Never use local test mode as proof of live authorization.`,
  },
  ...[
    {
      id: 'lumenshards', name: 'LumenShards', summary: 'AFK rewards, balances, shops, storage, and license validation.',
      body: `### Identify the environment
The published guide targets Paper 1.21.6-1.21.11 and Java 21. Confirm the installed version and sanitized startup error. Check active product access and the server public egress IP without asking for keys or tokens.

### Diagnose by feature
- AFK rewards: verify the configured area, timing, movement conditions, and intentional permission bonuses. Do not grant shard.alwaysearn as a blanket fix.
- Shop refusals: confirm balance, price, and room for all item rewards before investigating charging.
- Placeholders: check PlaceholderAPI and the Shards expansion; verify %shard_balance% or the documented AFK placeholders.
- Leaderboards: leaderboard.db is separate from balances and repopulates as balances change.

### Files and safe checks
Review only sanitized sections of config.yml, shop.yml, afk.yml, and messages.yml. Identify YAML or SQLite storage before recommending backup/recovery. /shard version and /shard balance are diagnostic starting points; /shard give, take, and set change balances and need deliberate authorization.

### Escalation evidence
Record exact plugin/server versions, affected feature, storage selection, relevant permission, and a minimal reproduction. License-service failures disable features while validation retries; do not advise bypassing validation.`,
    },
    {
      id: 'lumenduels', name: 'LumenDuels', summary: 'Arena readiness, queues, kits, ranking, and cleanup.',
      body: `### Identify the edition
Confirm standard LumenDuels, not Premium, and the exact JAR release. API 1.21 is not a guarantee of every runtime version. PlaceholderAPI, Vault, and WorldGuard are optional and depend on enabled features.

### Arena and queue triage
Check arenas.yml for the world name, two spawn points, enabled state, and supported duel types. Compare queues and WorldGuard settings in config.yml. Check kits.yml and the selected kit before opening live queues.

### Storage and permissions
Identify SQLite or MySQL and inspect the first startup error. Never collect database passwords. /duel stats is a useful read check; the descriptor declares lumen.duels.admin, but commands may check additional permissions.

### Restoration and escalation
Reproduce inventory handling and block restoration on a copy of the arena world. Do not test cleanup on a live match or reset player rankings as a troubleshooting shortcut. Include match lifecycle, kit, arena settings, and whether an optional integration changes the outcome.`,
    },
    {
      id: 'lumenduels-premium', name: 'LumenDuels Premium', summary: 'Premium edition checks and safe practice-match testing.',
      body: `### Confirm the correct release
Premium and standard LumenDuels are separate editions. Do not recommend installing both unless that release explicitly supports it. Confirm the Premium download and its included version notes; API 1.21 alone is not exact runtime certification.

### Reproduce the player flow
Test duel requests, ranked and unranked queues, selected kit, arena entry, match completion, Elo/rank updates, and rewards on a staging server. Record which step first differs from the expected result.

### Inspect the generated settings
Compare the release-generated storage, arena, kit, rank, shop, GUI, and message files. Check optional PlaceholderAPI, Vault, and WorldGuard only for features that use them. Verify inventory cleanup and arena restoration before queues go live.

### Escalate without assumptions
Use /duel help and the release instructions for exact commands/permissions rather than assuming parity with standard. Include edition, JAR version, server build, minimal configuration, and whether the issue reproduces without optional integrations.`,
    },
    {
      id: 'lumeneconomy', name: 'LumenEconomy', summary: 'Whole-unit currency, prices, multipliers, selling, and hooks.',
      body: `### Establish the baseline
The documented build target is Paper API 1.21.4 with Java 21. Other versions/forks require actual testing. Identify the selected Vault provider and installed PlaceholderAPI before diagnosing integrations.

### Prices and selling
Check prices.yml, blacklists, feature switches, and sell permissions. Worth may show a blacklisted item that cannot pay out. Currency uses whole units; negative or fractional payments are intentionally rejected.

### Multiplier diagnosis
Compare multipliers.yml base, permission, global, temporary, and progression tiers. Commands, tools, and menus share the same price/multiplier calculation. Record item material, quantity, expected base price, and applied tiers before reporting a rounding issue.

### Safe verification
Use /worth, /balance, and /sellhistory to inspect behavior. Use /lumeneco reload only for supported setting changes. Balance edits and global multipliers change the economy; reproduce with test accounts and small controlled transactions, not live financial adjustments.`,
    },
    {
      id: 'lumenspawners', name: 'LumenSpawners', summary: 'Virtual production, capacity, ownership, rarities, and sales.',
      body: `### Understand virtual production
Paper is intended; the compile target is API 1.21.6, not a promise that every server build works. Spawners produce configured items/drops virtually and persist data in SQLite.

### No-production checklist
Inspect the type, configured interval, storage capacity, and next-cycle output. Full storage pauses production rather than discarding overflow. Drop chances come from mobs.yml, not vanilla looting or difficulty rules.

### Access and selling
Check owner settings, lumenspawners.use, lumenspawners.sell, and relevant break permissions. Selling needs selling.enabled, configured prices, Vault, and an economy provider. Evolution, upgrades, and leaderboards start disabled.

### Safe diagnostics
Use /vspawner info and /vspawner stats. Record rarity, stack size, interval, storage, and relevant mobs.yml entry. Do not grant spawners or modify rarity weights just to investigate a report; those are state-changing admin operations.`,
    },
    {
      id: 'lumenauction', name: 'LumenAuction', summary: 'Vault, listing limits, expired items, and database recovery.',
      body: `### Identify the environment
The public guide targets Minecraft 1.21.6-1.21.11, Java 21, and Bukkit-family servers. The interface can load without Vault, but listing and buying need Vault plus an active economy provider.

### Listing and permission triage
Compare duration and max-listing permission tiers with config.yml. The longest granted duration and largest granted limit apply. Check allowed materials, price limits, fees, and taxes before reporting a refused listing.

### Expired or missing items
Have the seller check /ah listings, /ah history, and /ah expired. Expired items are private storage, not automatically lost. Capture a sanitized listing identifier and timeline without publishing customer data.

### Recovery boundary
auction.db holds persistent marketplace data. Stop the server before copying/restoring it; deleting it resets the market. Escalate inconsistent balances/items with the transaction history and a stopped-server backup, never advise a database reset as the first fix.`,
    },
    {
      id: 'lumenorder', name: 'LumenOrder', summary: 'Escrow, claims, Vault integrations, and transaction review.',
      body: `### Establish dependencies
Java 21+ and Bukkit/Spigot/Paper/Purpur are documented; Folia is unsupported. Creating orders and delivering items need Vault and an economy provider, even when browsing works.

### Claims are not lost deliveries
Escrow holds the full order value by default. Delivered items go to buyer claims, including offline buyers and full inventories. Ask the buyer to use /order claim before investigating missing items.

### Configuration and matching
Check limits, expiry, fees, material/enchantment matching, and optional ItemsAdder/Nexo/EcoEnchants integrations. Review sanitized config.yml and lang/en_us.yml. Permission node names can be changed in config, so do not assume defaults.

### Ambiguous transaction response
Use Admin GUI > Needs review and inspect items, escrow, and balances before resolving. /order admin resolve can complete or roll back real transactions; never repeatedly run it after an uncertain result. Preserve the SQLite data and timeline for developer review.`,
    },
    {
      id: 'lumenessentials', name: 'LumenEssentials', summary: 'Moderation, permission-gated tools, snapshots, and wipe safety.',
      body: `### Verify the platform and role
The build target is Paper API 1.21.11 with Java 21; other Bukkit-family runtimes need verification. Missing dashboard actions usually reflect individual permissions, not a broken menu.

### Moderation and restoration
Use /staffdashboard, /staffrequests, and /history for the relevant workflow. Inventory restoration requires an online player, lumenessentials.inventory-snapshot.restore, and a matching confirmation. Test restores only with explicit authorization.

### Wipe operations require escalation
Review wipe.yml, preview/backup requirements, and /playerwipe integrations before considering any destructive operation. Do not bypass confirmation or wipe a customer account as a diagnostic step. The stashes feature is disabled and not executable.

### Privacy and incident evidence
Chat logs have configurable retention and can be disabled. Alt-link alerts are signals, not proof of shared identity. Request only sanitized setting excerpts and error messages; preserve audit evidence for moderation or restore disputes.`,
    },
    {
      id: 'lumenspoofer', name: 'LumenSpoofer', summary: 'Fake-player backend compatibility, navigation, and task queues.',
      body: `### Runtime compatibility first
Paper is intended. The startup gate allows 1.21.6-1.21.11 and 26.1+, but server internals can break the fake-player backend between releases. A passing version check or build does not prove NPC compatibility.

### Diagnose task behavior
Use /Ls goal <name> status and compare the current task, route, team role, and storage destination. Check movement settings in config.yml; routine sprint-jumping is off by default.

### Reproduction safety
Capture the first backend/startup error, exact Paper build, NPC mode, terrain, and task steps. /Ls devtest run npc-navigation <bot> is a live test requiring lumen.npc.dev; use a controlled world and test NPC, not a production combat target.

### Escalation boundary
Do not promise Spigot/Bukkit support or fix an incompatible backend by suppressing startup errors. Reproduce on the exact server build and provide sanitized backend diagnostics to a developer.`,
    },
    {
      id: 'gladiator', name: 'Gladiator', summary: 'Detection signals, PacketEvents, masking, and safe diagnostics.',
      body: `### Confirm the integration matrix
The public target is Minecraft 1.21.6-1.21.11 with Java 21+ on Bukkit/Spigot/Paper/Purpur. Packet masking needs a PacketEvents release compatible with the exact server/protocol; it is not bundled.

### Signals are not proof
Heuristics can flag normal play. Start with alerts, compare thresholds and detection groups, and use a safe test account before enabling enforcement. Client brands and address-based links are not reliable identity proof.

### Choose safe diagnostics
/gladiator test reads module/integration status. Packet counters may be zero when no relevant traffic has occurred. Discord tests send real messages; punishment tests can actually kick or ban and require deliberate authorization.

### Collect the right context
Record module, server/protocol, PacketEvents version, reproduction, thresholds, and Geyser/Floodgate forwarding if relevant. Keep webhook URLs and shared keys private. Native Paper/Purpur Anti-Xray settings are separate and need a restart.`,
    },
    {
      id: 'lumenbounty', name: 'LumenBounty', summary: 'Coming-soon enquiries without inventing release details.',
      body: `### Current public status
LumenBounty is coming soon. Supported versions, commands, configuration, and delivery dates are not published. Do not offer a download or promise runtime compatibility.

### Handle enquiries
Clarify whether the customer asks about availability, a feature suggestion, or a commission. Point them to website update-notification preferences and record the requested use case in the private ticket.

### Escalation
Send commercial or launch-date questions to studio leadership. Send concrete bounty-workflow ideas to a developer with acceptance criteria. Do not invent permission nodes, registry identifiers, prices, or trial availability.`,
    },
    ...['LumenTeam', 'LumenIntellegance', 'Sentinel'].map(name => ({
      id: name.toLowerCase(), name, summary: 'Coming-soon status, feature enquiries, and escalation boundaries.',
      body: `### Published status
${name} appears in the public coming-soon catalog. Commands, dependencies, supported versions, configuration, and delivery dates are not established by that listing.

### Customer enquiry checklist
Clarify the intended server use case and whether this is an availability question, suggestion, or commission. Record acceptance criteria without promising that the unreleased product already implements them.

### Route the next step
Refer launch-date and commercial questions to studio leadership; refer technical feature questions to a developer. Customers can follow website updates. Do not issue trials, create registry mappings, or distribute an unrelated JAR as a substitute.

### Reply accurately
Explain what is published and what still needs confirmation. Never invent commands, permissions, prices, or a release date; keep development-only details in private staff conversations.`,
    })),
  ].map(plugin => ({
    id: `plugin-${plugin.id}`, category: 'Plugin playbooks', title: plugin.name,
    summary: plugin.summary, body: plugin.body,
  })),
]

export async function staffKnowledge(request, env, origin, deps) {
  const send = (payload, status = 200) => deps.respond(payload, status, origin)
  if (request.method !== 'GET') return send({ error: 'Staff guides are read-only.' }, 405)
  const header = request.headers.get('Authorization') || ''
  const user = await deps.verifyLoginToken(header.startsWith('Bearer ') ? header.slice(7) : '', env)
  if (!user) return send({ error: 'Sign in with your staff Discord account.' }, 401)
  if (!env.COMMUNITY_DB) return send({ error: 'Staff access could not be verified.' }, 503)
  const access = await resolveAccess(user.id, env)
  if (access.rank < 2 || !hasPermission(access, 'staff.docs')) return send({ error: 'Staff mode requires Support team rank or higher and staff.docs permission.' }, 403)
  if (!env.ADMIN_READ_LIMITER) return send({ error: 'Staff request limiting is unavailable.' }, 503)
  if (!(await env.ADMIN_READ_LIMITER.limit({ key: `staff-guides:${user.id}` })).success) return send({ error: 'Too many staff guide requests. Please wait a minute.' }, 429)
  return send({ actor: { id: user.id, roleName: access.roleName, permissions: access.permissions }, guides })
}
