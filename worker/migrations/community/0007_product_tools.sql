CREATE TABLE studio_releases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK(channel IN ('stable', 'beta')),
  body TEXT NOT NULL,
  minecraft_versions TEXT NOT NULL DEFAULT '',
  published INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(product_id, version)
);
CREATE INDEX studio_releases_public ON studio_releases(published, updated_at DESC);

CREATE TABLE studio_bulk_grants (
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  expires_at TEXT,
  state TEXT NOT NULL CHECK(state IN ('processing', 'granted', 'skipped', 'failed', 'uncertain')),
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  PRIMARY KEY(actor_id, request_id, customer_id)
);

CREATE TABLE studio_jobs (
  id TEXT PRIMARY KEY,
  cursor INTEGER NOT NULL DEFAULT 1
);
