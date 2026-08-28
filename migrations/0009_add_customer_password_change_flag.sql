-- Admin-created customer accounts must change their temporary Better Auth password.
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0
  CHECK (must_change_password IN (0, 1));
