CREATE TABLE lumen_points_resource_catalog (
  product_id TEXT PRIMARY KEY,
  resource_id TEXT NOT NULL UNIQUE,
  verified_at TEXT NOT NULL
);
ALTER TABLE lumen_points_accounts ADD COLUMN staff_deferred_products TEXT NOT NULL DEFAULT '[]';
UPDATE lumen_points_accounts SET purchase_checked_at=NULL,staff_checked_at=NULL,backfill_attempted_at=NULL,backfill_error=NULL;
