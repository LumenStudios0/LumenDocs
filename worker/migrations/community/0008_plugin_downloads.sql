CREATE TABLE IF NOT EXISTS studio_downloads (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  product_key TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  filename TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  source_commit TEXT NOT NULL,
  created_at TEXT NOT NULL,
  published INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS studio_downloads_product
  ON studio_downloads(published, product_id, created_at DESC);

CREATE TABLE IF NOT EXISTS studio_download_chunks (
  download_id TEXT NOT NULL REFERENCES studio_downloads(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  PRIMARY KEY(download_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS studio_build_results (
  product_key TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  state TEXT NOT NULL,
  message TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
