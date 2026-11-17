CREATE TABLE lumen_points_welcome_rewards (
  user_id TEXT PRIMARY KEY REFERENCES lumen_points_accounts(user_id),
  points_units INTEGER NOT NULL DEFAULT 10000 CHECK(points_units=10000),
  created_at TEXT NOT NULL
);
CREATE TRIGGER lumen_points_welcome_notice AFTER INSERT ON lumen_points_welcome_rewards
BEGIN
  INSERT INTO community_notifications(id,recipient_id,title,body,kind,audience,link,created_at)
  VALUES('points:welcome:'||NEW.user_id,NEW.user_id,'Your free 100 Lumen Points',
    'You received 100 LP as a one-time welcome gift. This includes existing accounts too. Spend them in the Points shop or save toward another reward.',
    'license','user','/account/points',NEW.created_at);
END;
CREATE TRIGGER lumen_points_welcome_award AFTER INSERT ON lumen_points_accounts
BEGIN
  INSERT INTO lumen_points_welcome_rewards(user_id,created_at)
  VALUES(NEW.user_id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
INSERT INTO lumen_points_accounts(user_id,referral_code,created_at)
SELECT discord_id,'LP-'||upper(hex(randomblob(6))),strftime('%Y-%m-%dT%H:%M:%fZ','now')
FROM website_members WHERE discord_id NOT IN (SELECT user_id FROM lumen_points_accounts);
INSERT OR IGNORE INTO lumen_points_welcome_rewards(user_id,created_at)
SELECT user_id,strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM lumen_points_accounts;

DROP VIEW lumen_points_balances;
CREATE VIEW lumen_points_balances AS
SELECT a.user_id,
  COALESCE((SELECT SUM(r.points_units) FROM lumen_points_rewards r WHERE r.user_id=a.user_id),0)+
  COALESCE((SELECT SUM(t.delta_units) FROM lumen_points_adjustments t WHERE t.user_id=a.user_id),0)+
  COALESCE((SELECT points_units FROM lumen_points_welcome_rewards w WHERE w.user_id=a.user_id),0)-
  COALESCE((SELECT SUM(o.cost_units) FROM lumen_points_orders o WHERE o.user_id=a.user_id AND o.state!='refunded'),0) AS units
FROM lumen_points_accounts a;
DROP VIEW lumen_points_transactions;
CREATE VIEW lumen_points_transactions AS
SELECT 'earn:'||id AS id,user_id,delta_units,label,created_at,NULL AS actor_id,'' AS reason FROM lumen_points_history
UNION ALL SELECT 'shop:'||id,user_id,delta_units,label,created_at,NULL,'' FROM lumen_points_shop_events
UNION ALL SELECT id,user_id,delta_units,label,created_at,actor_id,reason FROM lumen_points_adjustments
UNION ALL SELECT 'welcome:'||user_id,user_id,points_units,'Welcome gift',created_at,NULL,'' FROM lumen_points_welcome_rewards;
