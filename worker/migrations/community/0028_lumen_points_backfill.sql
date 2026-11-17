ALTER TABLE lumen_points_accounts ADD COLUMN backfill_attempted_at TEXT;
ALTER TABLE lumen_points_accounts ADD COLUMN backfill_error TEXT;
