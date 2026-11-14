ALTER TABLE community_tickets ADD COLUMN assignee_id TEXT;
ALTER TABLE community_tickets ADD COLUMN assignee_name TEXT;
ALTER TABLE community_tickets ADD COLUMN labels TEXT NOT NULL DEFAULT '[]';
CREATE INDEX community_tickets_assignee_updated
  ON community_tickets(assignee_id, updated_at DESC);

CREATE TABLE community_ticket_alerts (
  ticket_id TEXT PRIMARY KEY REFERENCES community_tickets(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  last_error TEXT
);
