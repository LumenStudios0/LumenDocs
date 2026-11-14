ALTER TABLE community_trials ADD COLUMN requested_duration_days INTEGER NOT NULL DEFAULT 7
  CHECK (requested_duration_days IN (1, 3, 7, 30));
