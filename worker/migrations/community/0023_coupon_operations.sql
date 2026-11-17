CREATE TABLE coupon_rewards_next (
  reward_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('loyalty', 'review', 'manual')),
  discount INTEGER NOT NULL CHECK(discount IN (5, 10, 15)),
  state TEXT NOT NULL CHECK(state IN ('issuing', 'issued', 'failed', 'uncertain')),
  label_suffix TEXT NOT NULL UNIQUE,
  code TEXT,
  coupon_id INTEGER,
  retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  granted_by TEXT,
  grant_reason TEXT,
  uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0)
);
INSERT INTO coupon_rewards_next
  (reward_key,user_id,kind,discount,state,label_suffix,code,coupon_id,retry_at,created_at,updated_at)
SELECT reward_key,user_id,kind,discount,state,label_suffix,code,coupon_id,retry_at,created_at,updated_at FROM coupon_rewards;
DROP TABLE coupon_rewards;
ALTER TABLE coupon_rewards_next RENAME TO coupon_rewards;
CREATE INDEX coupon_rewards_user ON coupon_rewards(user_id, created_at DESC);
CREATE UNIQUE INDEX coupon_manual_pending ON coupon_rewards(granted_by, user_id)
WHERE kind='manual' AND state IN ('issuing','uncertain');
ALTER TABLE coupon_scan_state ADD COLUMN error_code TEXT;
CREATE TABLE coupon_usage_events (
  reward_key TEXT NOT NULL REFERENCES coupon_rewards(reward_key),
  uses INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY(reward_key, uses)
);
UPDATE website_role_permissions
SET permissions = json_insert(permissions, '$[#]', 'coupons.grant'), revision = revision + 1
WHERE role_id IN ('support_team','sr_support','developer','studio_lead')
  AND EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'dashboard.view')
  AND NOT EXISTS (SELECT 1 FROM json_each(permissions) WHERE value = 'coupons.grant');
