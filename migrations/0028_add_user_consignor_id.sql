-- Internal identifier supplied by the main bidding platform. It is intentionally
-- nullable and non-unique: not every customer has one, and external uniqueness
-- has not been established.
ALTER TABLE users ADD COLUMN consignor_id TEXT;
