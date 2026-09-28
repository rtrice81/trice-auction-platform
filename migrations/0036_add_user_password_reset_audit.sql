CREATE TABLE user_password_reset_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_user_id INTEGER NOT NULL,
  actor_user_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type = 'user_password_reset'),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX idx_user_password_reset_audits_target_occurred
  ON user_password_reset_audits (target_user_id, occurred_at DESC, id DESC);
