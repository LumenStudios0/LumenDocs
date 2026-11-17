CREATE TABLE lumen_points_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES lumen_points_accounts(user_id),
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  cost_units INTEGER NOT NULL CHECK(cost_units > 0),
  state TEXT NOT NULL CHECK(state IN ('pending','processing','review','fulfilled','refunded')),
  details TEXT NOT NULL DEFAULT '{}',
  staff_note TEXT NOT NULL DEFAULT '',
  handled_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX lumen_points_orders_user ON lumen_points_orders(user_id,created_at DESC);
CREATE INDEX lumen_points_orders_queue ON lumen_points_orders(state,created_at);
CREATE UNIQUE INDEX lumen_points_order_pending ON lumen_points_orders(user_id,product_id)
  WHERE state IN ('pending','processing','review');
CREATE TABLE lumen_points_shop_entitlements (
  user_id TEXT NOT NULL REFERENCES lumen_points_accounts(user_id),
  product_id TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE REFERENCES lumen_points_orders(id),
  PRIMARY KEY(user_id,product_id)
);
CREATE TABLE lumen_points_shop_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id TEXT NOT NULL REFERENCES lumen_points_orders(id),
  user_id TEXT NOT NULL,
  delta_units INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX lumen_points_shop_events_user ON lumen_points_shop_events(user_id,id DESC);
CREATE TRIGGER lumen_points_shop_spent AFTER INSERT ON lumen_points_orders
BEGIN
  INSERT INTO lumen_points_shop_events(order_id,user_id,delta_units,label,created_at)
  VALUES (NEW.id,NEW.user_id,-NEW.cost_units,'Shop: '||NEW.product_name,NEW.created_at);
END;
CREATE TRIGGER lumen_points_shop_refunded AFTER UPDATE OF state ON lumen_points_orders
WHEN NEW.state='refunded' AND OLD.state!='refunded'
BEGIN
  INSERT INTO lumen_points_shop_events(order_id,user_id,delta_units,label,created_at)
  VALUES (NEW.id,NEW.user_id,NEW.cost_units,'Refund: '||NEW.product_name,NEW.updated_at);
END;
CREATE VIEW lumen_points_balances AS
SELECT a.user_id,
  COALESCE((SELECT SUM(r.points_units) FROM lumen_points_rewards r WHERE r.user_id=a.user_id),0)-
  COALESCE((SELECT SUM(o.cost_units) FROM lumen_points_orders o WHERE o.user_id=a.user_id AND o.state!='refunded'),0) AS units
FROM lumen_points_accounts a;
