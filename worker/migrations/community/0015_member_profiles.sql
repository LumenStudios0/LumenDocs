CREATE TABLE member_profiles (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar_url TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  pronouns TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  accent TEXT NOT NULL DEFAULT '#9f72ff',
  banner TEXT NOT NULL DEFAULT '#38205c',
  website TEXT NOT NULL DEFAULT '',
  showcase TEXT NOT NULL DEFAULT '',
  favorite_plugin TEXT NOT NULL DEFAULT '',
  public INTEGER NOT NULL DEFAULT 0 CHECK(public IN (0,1)),
  tier TEXT,
  tier_checked_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX member_profiles_public_name ON member_profiles(public, display_name);
