ALTER TABLE member_profiles ADD COLUMN appearance TEXT NOT NULL DEFAULT '{"background":"none","frame":"none","decoration":"none"}' CHECK(json_valid(appearance));
ALTER TABLE member_profiles ADD COLUMN servers TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(servers));
ALTER TABLE member_profiles ADD COLUMN banner_version INTEGER;
CREATE TABLE member_profile_banners (
  user_id TEXT PRIMARY KEY REFERENCES member_profiles(user_id) ON DELETE CASCADE,
  data TEXT
);
CREATE INDEX community_threads_profile_author ON community_threads(author_id, hidden);
CREATE INDEX community_posts_profile_author ON community_thread_posts(author_id, hidden, thread_id);
