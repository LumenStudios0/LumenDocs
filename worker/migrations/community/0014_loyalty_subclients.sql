CREATE TABLE loyalty_subclients (
  owner_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  member_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (owner_id, product_id, member_id)
);
CREATE INDEX loyalty_subclients_member ON loyalty_subclients(member_id);
