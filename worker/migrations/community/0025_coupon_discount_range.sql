CREATE TABLE coupon_rewards_next (
  reward_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('loyalty', 'review', 'manual')),
  discount INTEGER NOT NULL CHECK(discount BETWEEN 1 AND 50),
  state TEXT NOT NULL CHECK(state IN ('issuing', 'issued', 'failed', 'uncertain')),
  label_suffix TEXT NOT NULL UNIQUE,
  code TEXT,
  coupon_id INTEGER,
  retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  granted_by TEXT,
  grant_reason TEXT,
  uses INTEGER NOT NULL DEFAULT 0 CHECK(uses >= 0),
  scope_ids TEXT NOT NULL DEFAULT '[]'
);
INSERT INTO coupon_rewards_next SELECT * FROM coupon_rewards;
CREATE TABLE coupon_usage_events_next (
  reward_key TEXT NOT NULL REFERENCES coupon_rewards_next(reward_key),
  uses INTEGER NOT NULL,
  observed_at TEXT NOT NULL,
  PRIMARY KEY(reward_key, uses)
);
INSERT INTO coupon_usage_events_next SELECT * FROM coupon_usage_events;
DROP TABLE coupon_usage_events;
DROP TABLE coupon_rewards;
ALTER TABLE coupon_rewards_next RENAME TO coupon_rewards;
ALTER TABLE coupon_usage_events_next RENAME TO coupon_usage_events;
CREATE INDEX coupon_rewards_user ON coupon_rewards(user_id, created_at DESC);
CREATE UNIQUE INDEX coupon_manual_pending ON coupon_rewards(granted_by, user_id)
WHERE kind='manual' AND state IN ('issuing','uncertain');
