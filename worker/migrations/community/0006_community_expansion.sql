ALTER TABLE community_tickets ADD COLUMN rating_score INTEGER CHECK (rating_score BETWEEN 1 AND 5);
ALTER TABLE community_tickets ADD COLUMN rating_comment TEXT;
ALTER TABLE community_tickets ADD COLUMN escalation_reason TEXT;
ALTER TABLE community_tickets ADD COLUMN escalation_by TEXT;
ALTER TABLE community_tickets ADD COLUMN escalation_at TEXT;
ALTER TABLE community_tickets ADD COLUMN escalation_target_id TEXT;
ALTER TABLE community_tickets ADD COLUMN follow_up_hours INTEGER NOT NULL DEFAULT 24 CHECK (follow_up_hours BETWEEN 1 AND 168);
ALTER TABLE community_tickets ADD COLUMN unanswered_since TEXT;
ALTER TABLE community_tickets ADD COLUMN unanswered_cycle INTEGER NOT NULL DEFAULT 1;
ALTER TABLE community_tickets ADD COLUMN last_sender_staff INTEGER NOT NULL DEFAULT 0;

UPDATE community_tickets SET
  last_sender_staff = COALESCE((SELECT staff FROM community_replies WHERE ticket_id = community_tickets.id ORDER BY created_at DESC, rowid DESC LIMIT 1), 0);
UPDATE community_tickets SET unanswered_since = COALESCE(
  (SELECT created_at FROM community_replies WHERE ticket_id = community_tickets.id ORDER BY created_at DESC, rowid DESC LIMIT 1), created_at)
  WHERE status = 'open' AND last_sender_staff = 0;
CREATE INDEX community_ticket_followups_due ON community_tickets(status, unanswered_since);

CREATE TRIGGER community_ticket_wait_created AFTER INSERT ON community_tickets
BEGIN
  UPDATE community_tickets SET unanswered_since = NEW.created_at WHERE id = NEW.id AND status = 'open';
END;
CREATE TRIGGER community_ticket_wait_status AFTER UPDATE OF status ON community_tickets
WHEN NEW.status != OLD.status
BEGIN
  UPDATE community_tickets SET
    unanswered_since = CASE WHEN NEW.status = 'open' AND last_sender_staff = 0 THEN NEW.updated_at ELSE NULL END,
    unanswered_cycle = unanswered_cycle + CASE WHEN NEW.status = 'open' THEN 1 ELSE 0 END
    WHERE id = NEW.id;
END;
CREATE TRIGGER community_ticket_wait_reply AFTER INSERT ON community_replies
BEGIN
  UPDATE community_tickets SET
    unanswered_since = CASE WHEN NEW.staff = 1 THEN NULL ELSE COALESCE(unanswered_since, NEW.created_at) END,
    unanswered_cycle = unanswered_cycle + CASE WHEN NEW.staff = 0 AND last_sender_staff = 1 THEN 1 ELSE 0 END,
    last_sender_staff = NEW.staff
    WHERE id = NEW.ticket_id;
END;

CREATE TABLE community_ticket_followups (
  ticket_id TEXT NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  cycle INTEGER NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  next_attempt_at TEXT NOT NULL,
  PRIMARY KEY (ticket_id, cycle)
);

ALTER TABLE community_notifications ADD COLUMN image_url TEXT;
CREATE TABLE community_scheduled_notifications (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('announcement','update')),
  product_id TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('all','product','staff')),
  image_url TEXT,
  scheduled_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','published','cancelled'))
);
CREATE INDEX community_scheduled_due ON community_scheduled_notifications(state, scheduled_at);

CREATE TABLE community_issue_subscriptions (
  issue_id TEXT NOT NULL REFERENCES community_issues(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (issue_id, user_id)
);

CREATE TABLE community_trials (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','approved','declined','grant_failed')),
  review_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewed_by TEXT,
  expires_at TEXT
);
CREATE UNIQUE INDEX community_trial_pending ON community_trials(user_id, product_id) WHERE status IN ('pending','processing','grant_failed');
CREATE INDEX community_trial_user_created ON community_trials(user_id, created_at DESC);

CREATE TABLE community_incidents (
  id TEXT PRIMARY KEY,
  service_id TEXT NOT NULL,
  status TEXT NOT NULL,
  previous_status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  resolved_at TEXT,
  message TEXT NOT NULL DEFAULT ''
);
CREATE INDEX community_incidents_started ON community_incidents(started_at DESC);
CREATE TRIGGER community_incident_initial AFTER INSERT ON community_service_status
WHEN COALESCE(NEW.override_status, NEW.automatic_status) != 'unknown'
BEGIN
  INSERT INTO community_incidents (id, service_id, status, previous_status, started_at, resolved_at, message)
  VALUES (lower(hex(randomblob(16))), NEW.service_id, COALESCE(NEW.override_status, NEW.automatic_status), 'unknown',
    strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    CASE WHEN COALESCE(NEW.override_status, NEW.automatic_status) = 'operational' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END,
    CASE WHEN NEW.override_status IS NOT NULL THEN NEW.override_message ELSE '' END);
END;
CREATE TRIGGER community_incident_transition AFTER UPDATE ON community_service_status
WHEN COALESCE(NEW.override_status, NEW.automatic_status) != COALESCE(OLD.override_status, OLD.automatic_status)
BEGIN
  UPDATE community_incidents SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
    WHERE service_id = NEW.service_id AND resolved_at IS NULL;
  INSERT INTO community_incidents (id, service_id, status, previous_status, started_at, resolved_at, message)
  VALUES (lower(hex(randomblob(16))), NEW.service_id, COALESCE(NEW.override_status, NEW.automatic_status),
    COALESCE(OLD.override_status, OLD.automatic_status), strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    CASE WHEN COALESCE(NEW.override_status, NEW.automatic_status) = 'operational' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') END,
    CASE WHEN NEW.override_status IS NOT NULL THEN NEW.override_message ELSE '' END);
END;
