-- Repair databases where 0003 created a non-unique index before the migration
-- was corrected. This preserves every existing users row.
DROP INDEX IF EXISTS idx_users_auth_user_id;
CREATE UNIQUE INDEX idx_users_auth_user_id ON users(auth_user_id);
