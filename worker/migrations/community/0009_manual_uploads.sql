-- Apply before enabling staff uploads. Existing published downloads are unaffected.
CREATE TABLE studio_manual_uploads (
  download_id TEXT PRIMARY KEY REFERENCES studio_downloads(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('uploading', 'verifying', 'published', 'failed')),
  expires_at TEXT NOT NULL
);
CREATE INDEX studio_manual_uploads_actor ON studio_manual_uploads(actor_id, state);
