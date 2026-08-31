ALTER TABLE users ADD COLUMN dropoff_banned INTEGER NOT NULL DEFAULT 0 CHECK (dropoff_banned IN (0, 1));
ALTER TABLE users ADD COLUMN dropoff_ban_reason TEXT;
ALTER TABLE users ADD COLUMN dropoff_banned_at TEXT;
ALTER TABLE users ADD COLUMN dropoff_banned_by_user_id INTEGER;

CREATE TABLE customer_private_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_user_id INTEGER NOT NULL,
  author_user_id INTEGER NOT NULL,
  note_text TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (author_user_id) REFERENCES users(id)
);

CREATE INDEX idx_customer_private_notes_customer_created ON customer_private_notes(customer_user_id, created_at ASC, id ASC);
