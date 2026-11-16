CREATE TABLE coupon_rewards (
  reward_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('loyalty', 'review')),
  discount INTEGER NOT NULL CHECK(discount IN (5, 10, 15)),
  state TEXT NOT NULL CHECK(state IN ('issuing', 'issued', 'failed', 'uncertain')),
  label_suffix TEXT NOT NULL UNIQUE,
  code TEXT,
  coupon_id INTEGER,
  retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX coupon_rewards_user ON coupon_rewards(user_id, created_at DESC);
CREATE TABLE coupon_scan_state (
  name TEXT PRIMARY KEY,
  cursor TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ok', 'error')),
  checked_at TEXT
);
