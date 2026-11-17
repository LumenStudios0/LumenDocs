CREATE TABLE lumen_points_accounts (
  user_id TEXT PRIMARY KEY,
  referral_code TEXT NOT NULL UNIQUE,
  buyer_id TEXT UNIQUE,
  created_at TEXT NOT NULL,
  purchase_checked_at TEXT,
  tier_checked_at TEXT,
  sync_token TEXT,
  sync_until TEXT
);
INSERT INTO lumen_points_accounts(user_id, referral_code, created_at)
SELECT discord_id, 'LP-' || upper(hex(randomblob(6))), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM website_members;

CREATE TABLE lumen_points_purchases (
  purchase_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES lumen_points_accounts(user_id),
  buyer_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  paid_cents INTEGER NOT NULL CHECK(paid_cents >= 0),
  points_units INTEGER NOT NULL CHECK(points_units >= 0),
  purchased_at TEXT NOT NULL,
  scan_id TEXT NOT NULL
);
CREATE INDEX lumen_points_purchases_user ON lumen_points_purchases(user_id, purchased_at DESC);

CREATE TABLE lumen_points_referrals (
  buyer_user_id TEXT PRIMARY KEY REFERENCES lumen_points_accounts(user_id),
  referrer_user_id TEXT NOT NULL REFERENCES lumen_points_accounts(user_id),
  redeemed_at TEXT NOT NULL,
  CHECK(buyer_user_id != referrer_user_id)
);
CREATE INDEX lumen_points_referrals_owner ON lumen_points_referrals(referrer_user_id);
CREATE TABLE lumen_points_referral_purchases (
  purchase_id TEXT PRIMARY KEY REFERENCES lumen_points_purchases(purchase_id),
  buyer_user_id TEXT NOT NULL REFERENCES lumen_points_referrals(buyer_user_id)
);

CREATE TABLE lumen_points_rewards (
  reward_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES lumen_points_accounts(user_id),
  kind TEXT NOT NULL CHECK(kind IN ('purchase', 'referral', 'tier')),
  points_units INTEGER NOT NULL CHECK(points_units >= 0),
  label TEXT NOT NULL,
  earned_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX lumen_points_rewards_user ON lumen_points_rewards(user_id, earned_at DESC);
CREATE TABLE lumen_points_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reward_key TEXT NOT NULL REFERENCES lumen_points_rewards(reward_key),
  user_id TEXT NOT NULL,
  delta_units INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX lumen_points_history_user ON lumen_points_history(user_id, id DESC);
CREATE TRIGGER lumen_points_awarded AFTER INSERT ON lumen_points_rewards
WHEN NEW.points_units > 0
BEGIN
  INSERT INTO lumen_points_history(reward_key,user_id,delta_units,label,created_at)
  VALUES (NEW.reward_key,NEW.user_id,NEW.points_units,NEW.label,NEW.updated_at);
END;
CREATE TRIGGER lumen_points_adjusted AFTER UPDATE OF points_units ON lumen_points_rewards
WHEN NEW.points_units != OLD.points_units
BEGIN
  INSERT INTO lumen_points_history(reward_key,user_id,delta_units,label,created_at)
  VALUES (NEW.reward_key,NEW.user_id,NEW.points_units-OLD.points_units,NEW.label,NEW.updated_at);
END;
