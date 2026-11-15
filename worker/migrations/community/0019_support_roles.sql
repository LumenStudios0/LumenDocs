CREATE TABLE website_members_new (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  role_id TEXT CHECK (role_id IS NULL OR role_id IN ('guest','client','jr_support','support_team','sr_support','developer','studio_lead','owner')),
  revision INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  registered_at TEXT
);
INSERT INTO website_members_new SELECT discord_id, username, display_name, role_id, revision, last_seen_at, registered_at FROM website_members;
DROP TABLE website_members;
ALTER TABLE website_members_new RENAME TO website_members;
CREATE INDEX website_members_role ON website_members(role_id);

CREATE TABLE website_role_permissions_new (
  role_id TEXT PRIMARY KEY CHECK (role_id IN ('guest','client','jr_support','support_team','sr_support','developer','studio_lead')),
  permissions TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  policy_version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO website_role_permissions_new(role_id, permissions, revision) SELECT role_id, permissions, revision FROM website_role_permissions;
DROP TABLE website_role_permissions;
ALTER TABLE website_role_permissions_new RENAME TO website_role_permissions;
