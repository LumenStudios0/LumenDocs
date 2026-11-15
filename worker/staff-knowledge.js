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
  return send({ actor: { roleName: access.roleName, permissions: access.permissions }, guides })
}
