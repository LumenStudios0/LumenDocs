CREATE TABLE staff_presence (
  member_id TEXT PRIMARY KEY,
  availability TEXT NOT NULL DEFAULT 'off_shift' CHECK (availability IN ('available','busy','away','off_shift')),
  last_online TEXT,
  last_did TEXT,
  last_activity_at TEXT
);
CREATE TABLE staff_tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
  assignee_id TEXT, status TEXT NOT NULL CHECK (status IN ('todo','in_progress','done')),
  priority TEXT NOT NULL CHECK (priority IN ('low','normal','high')),
  due_at TEXT, revision INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX staff_tasks_updated ON staff_tasks(updated_at DESC);
CREATE TABLE staff_warnings (
  id TEXT PRIMARY KEY, target_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  reason TEXT NOT NULL, created_at TEXT NOT NULL, acknowledged_at TEXT
);
CREATE INDEX staff_warnings_target ON staff_warnings(target_id, created_at DESC);
CREATE TABLE staff_commissions (
  ticket_id TEXT PRIMARY KEY REFERENCES community_tickets(id) ON DELETE CASCADE,
  stage TEXT NOT NULL DEFAULT 'enquiry' CHECK (stage IN ('enquiry','scoping','quoted','development','review','delivered','cancelled')),
  scope TEXT NOT NULL DEFAULT '', acceptance_criteria TEXT NOT NULL DEFAULT '',
  milestones TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(milestones)),
  revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL
);
INSERT INTO staff_commissions(ticket_id, updated_at)
SELECT id, updated_at FROM community_tickets WHERE type = 'commission';
CREATE TRIGGER staff_commission_created AFTER INSERT ON community_tickets
WHEN NEW.type = 'commission'
BEGIN
  INSERT INTO staff_commissions(ticket_id, updated_at) VALUES (NEW.id, NEW.created_at);
END;
CREATE TABLE staff_guide_feedback (
  id TEXT PRIMARY KEY, guide_id TEXT NOT NULL, actor_id TEXT NOT NULL,
  message TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE staff_ticket_editors (
  ticket_id TEXT NOT NULL REFERENCES community_tickets(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL, expires_at TEXT NOT NULL,
  PRIMARY KEY(ticket_id, member_id)
);
CREATE INDEX staff_ticket_editors_expiry ON staff_ticket_editors(expires_at);
CREATE INDEX community_tickets_created ON community_tickets(created_at DESC);
-- Append only missing defaults, preserving edited policies and excluding member roles.
UPDATE website_role_permissions
SET permissions = (
  SELECT json_group_array(value) FROM (
    SELECT value FROM json_each(website_role_permissions.permissions)
    UNION
    SELECT value FROM json_each('["staff.presence","staff.tasks","staff.commissions","staff.feedback"]')
  )
), revision = revision + 1
WHERE role_id IN ('support_team','developer','studio_lead','owner');
UPDATE website_role_permissions
SET permissions = json_insert(permissions, '$[#]', 'staff.warnings')
WHERE role_id IN ('studio_lead','owner')
AND NOT EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'staff.warnings');
