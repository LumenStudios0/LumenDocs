ALTER TABLE community_replies ADD COLUMN assignee_id TEXT;

CREATE TABLE staff_ticket_closures (
  ticket_id TEXT PRIMARY KEY REFERENCES community_tickets(id) ON DELETE CASCADE,
  closed_by TEXT NOT NULL,
  assigned_staff_id TEXT,
  staff_reply_count INTEGER NOT NULL,
  eligible INTEGER NOT NULL CHECK (eligible IN (0, 1)),
  closed_at TEXT NOT NULL
);

CREATE TABLE staff_xp_ledger (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('ticket_close', 'rating_bonus')),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_type, source_id)
);
CREATE INDEX staff_xp_ledger_staff_created ON staff_xp_ledger(staff_id, created_at DESC);
