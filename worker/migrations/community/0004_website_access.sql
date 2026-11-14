CREATE TABLE website_members (
  discord_id TEXT PRIMARY KEY,
  username TEXT NOT NULL DEFAULT '',
  display_name TEXT NOT NULL DEFAULT '',
  role_id TEXT CHECK (role_id IS NULL OR role_id IN ('guest','client','support_team','developer','studio_lead','owner')),
  revision INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT
);
CREATE INDEX website_members_role ON website_members(role_id);

CREATE TABLE website_role_permissions (
  role_id TEXT PRIMARY KEY CHECK (role_id IN ('guest','client','support_team','developer','studio_lead')),
  permissions TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE website_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  value TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE website_access_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX website_access_audit_created ON website_access_audit(created_at DESC);
