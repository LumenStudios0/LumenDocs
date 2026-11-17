CREATE TABLE staff_xp_ledger_next (
  id TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL,
  points INTEGER NOT NULL CHECK (points > 0),
  source_type TEXT NOT NULL CHECK (source_type IN ('ticket_close', 'rating_bonus', 'starter_bonus')),
  source_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_type, source_id)
);
INSERT INTO staff_xp_ledger_next SELECT * FROM staff_xp_ledger;
DROP TABLE staff_xp_ledger;
ALTER TABLE staff_xp_ledger_next RENAME TO staff_xp_ledger;
CREATE INDEX staff_xp_ledger_staff_created ON staff_xp_ledger(staff_id, created_at DESC);

WITH current_staff AS (
  SELECT discord_id AS id FROM website_members
  WHERE role_id IN ('jr_support', 'support_team', 'sr_support', 'developer', 'studio_lead', 'owner')
  UNION SELECT '1400375985211441242'
  UNION SELECT '1012053634911064114'
  WHERE NOT EXISTS (
    SELECT 1 FROM website_members WHERE discord_id = '1012053634911064114'
      AND role_id IS NOT NULL
      AND role_id NOT IN ('jr_support', 'support_team', 'sr_support', 'developer', 'studio_lead', 'owner')
  )
)
INSERT OR IGNORE INTO staff_xp_ledger (id, staff_id, points, source_type, source_id, created_at)
SELECT 'starter-xp-v1:' || id, id, 10, 'starter_bonus', id,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM current_staff;

INSERT OR IGNORE INTO website_access_audit (id, actor_id, actor_role, action, target, details, created_at)
SELECT 'starter-xp-v1:' || staff_id, 'system:migration', 'system', 'staff.xp.starter_award', staff_id,
  '{"points":10,"source":"starter_bonus","campaign":"starter-xp-v1"}', created_at
FROM staff_xp_ledger WHERE source_type = 'starter_bonus';
