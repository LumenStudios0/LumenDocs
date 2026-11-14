CREATE TABLE community_threads (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_staff INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  product_id TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  pinned INTEGER NOT NULL DEFAULT 0,
  locked INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_activity_at TEXT NOT NULL
);
CREATE INDEX community_threads_channel_activity
  ON community_threads(hidden, channel, pinned DESC, last_activity_at DESC);
CREATE INDEX community_threads_activity
  ON community_threads(hidden, pinned DESC, last_activity_at DESC);

CREATE TABLE community_thread_posts (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES community_threads(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  staff INTEGER NOT NULL DEFAULT 0,
  body TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX community_thread_posts_thread_created
  ON community_thread_posts(thread_id, created_at);
