ALTER TABLE coupon_rewards ADD COLUMN all_resources INTEGER NOT NULL DEFAULT 0 CHECK(all_resources IN (0,1));
