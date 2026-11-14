CREATE TABLE IF NOT EXISTS community_tickets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  product_id TEXT,
  server_software TEXT,
  minecraft_version TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_tickets_owner_updated
  ON community_tickets(owner_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS community_tickets_status_updated
  ON community_tickets(status, updated_at DESC);

CREATE TABLE IF NOT EXISTS community_replies (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  staff INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_replies_ticket_created
  ON community_replies(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS community_issues (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  published INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_issues_published_updated
  ON community_issues(published, updated_at DESC);

CREATE TABLE IF NOT EXISTS community_preferences (
  user_id TEXT PRIMARY KEY,
  updates INTEGER NOT NULL DEFAULT 1,
  announcements INTEGER NOT NULL DEFAULT 1,
  ticket_replies INTEGER NOT NULL DEFAULT 1,
  products TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS community_notifications (
  id TEXT PRIMARY KEY,
  recipient_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL,
  product_id TEXT,
  audience TEXT NOT NULL DEFAULT 'all',
  link TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS community_notifications_created
  ON community_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS community_notifications_recipient
  ON community_notifications(recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS community_notification_reads (
  notification_id TEXT NOT NULL REFERENCES community_notifications(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY(notification_id, user_id)
);

CREATE TABLE IF NOT EXISTS community_service_status (
  service_id TEXT PRIMARY KEY,
  automatic_status TEXT NOT NULL DEFAULT 'unknown',
  override_status TEXT,
  override_message TEXT NOT NULL DEFAULT '',
  checked_at TEXT
);
