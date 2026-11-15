ALTER TABLE member_profiles ADD COLUMN badge_selection TEXT
  CHECK (badge_selection IS NULL OR (json_valid(badge_selection) AND json_type(badge_selection) = 'array'));
