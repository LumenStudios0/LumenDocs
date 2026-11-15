UPDATE member_profiles
SET public = 1, revision = revision + 1
WHERE public = 0;
