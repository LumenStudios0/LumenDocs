ALTER TABLE lumen_points_accounts ADD COLUMN staff_checked_at TEXT;
ALTER TABLE studio_bulk_grants ADD COLUMN give_points INTEGER NOT NULL DEFAULT 1 CHECK(give_points IN (0,1));
CREATE TABLE lumen_points_license_choices (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  give_points INTEGER NOT NULL CHECK(give_points IN (0,1)),
  actor_id TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,product_id)
);
CREATE TABLE lumen_points_adjustments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES lumen_points_accounts(user_id),
  delta_units INTEGER NOT NULL CHECK(delta_units!=0),
  kind TEXT NOT NULL CHECK(kind IN ('staff_license','staff_adjustment')),
  label TEXT NOT NULL,
  actor_id TEXT,
  reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX lumen_points_adjustments_user ON lumen_points_adjustments(user_id,created_at DESC);
CREATE TABLE lumen_points_staff_rewards (
  user_id TEXT NOT NULL REFERENCES lumen_points_accounts(user_id),
  product_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  awarded_units INTEGER NOT NULL CHECK(awarded_units>=0),
  points_units INTEGER NOT NULL CHECK(points_units>=0),
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,product_id),
  UNIQUE(user_id,resource_id)
);
CREATE TRIGGER lumen_staff_points_awarded AFTER INSERT ON lumen_points_staff_rewards
WHEN NEW.points_units>0
BEGIN
  INSERT INTO lumen_points_adjustments(id,user_id,delta_units,kind,label,created_at)
  VALUES ('license:'||lower(hex(randomblob(16))),NEW.user_id,NEW.points_units,'staff_license','Staff license: '||NEW.product_name,NEW.created_at);
END;
CREATE TRIGGER lumen_staff_points_changed AFTER UPDATE OF points_units ON lumen_points_staff_rewards
WHEN NEW.points_units!=OLD.points_units
BEGIN
  INSERT INTO lumen_points_adjustments(id,user_id,delta_units,kind,label,created_at)
  VALUES ('license:'||lower(hex(randomblob(16))),NEW.user_id,NEW.points_units-OLD.points_units,'staff_license',
    'Staff license purchase reconciliation: '||NEW.product_name,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
END;
CREATE TRIGGER lumen_staff_purchase_added AFTER INSERT ON lumen_points_purchases
BEGIN
  UPDATE lumen_points_staff_rewards SET points_units=MAX(0,awarded_units-
    COALESCE((SELECT SUM(points_units) FROM lumen_points_purchases WHERE user_id=NEW.user_id AND resource_id=NEW.resource_id),0))
    WHERE user_id=NEW.user_id AND resource_id=NEW.resource_id;
END;
CREATE TRIGGER lumen_staff_purchase_changed AFTER UPDATE OF points_units ON lumen_points_purchases
BEGIN
  UPDATE lumen_points_staff_rewards SET points_units=MAX(0,awarded_units-
    COALESCE((SELECT SUM(points_units) FROM lumen_points_purchases WHERE user_id=NEW.user_id AND resource_id=NEW.resource_id),0))
    WHERE user_id=NEW.user_id AND resource_id=NEW.resource_id;
END;
DROP VIEW lumen_points_balances;
CREATE VIEW lumen_points_balances AS
SELECT a.user_id,
  COALESCE((SELECT SUM(r.points_units) FROM lumen_points_rewards r WHERE r.user_id=a.user_id),0)+
  COALESCE((SELECT SUM(t.delta_units) FROM lumen_points_adjustments t WHERE t.user_id=a.user_id),0)-
  COALESCE((SELECT SUM(o.cost_units) FROM lumen_points_orders o WHERE o.user_id=a.user_id AND o.state!='refunded'),0) AS units
FROM lumen_points_accounts a;
CREATE VIEW lumen_points_transactions AS
SELECT 'earn:'||id AS id,user_id,delta_units,label,created_at,NULL AS actor_id,'' AS reason FROM lumen_points_history
UNION ALL SELECT 'shop:'||id,user_id,delta_units,label,created_at,NULL,'' FROM lumen_points_shop_events
UNION ALL SELECT id,user_id,delta_units,label,created_at,actor_id,reason FROM lumen_points_adjustments;
UPDATE website_role_permissions SET permissions=json_insert(permissions,'$[#]','points.manage'),revision=revision+1
WHERE role_id IN ('support_team','sr_support','developer','studio_lead')
  AND EXISTS(SELECT 1 FROM json_each(permissions) WHERE value='customers.view')
  AND EXISTS(SELECT 1 FROM json_each(permissions) WHERE value='dashboard.view')
  AND NOT EXISTS(SELECT 1 FROM json_each(permissions) WHERE value='points.manage');
