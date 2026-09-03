-- Attendance timestamps retain operational facts without changing legacy records.
ALTER TABLE appointments ADD COLUMN checked_in_at TEXT;
ALTER TABLE appointments ADD COLUMN completed_at TEXT;
ALTER TABLE appointments ADD COLUMN no_show_at TEXT;
ALTER TABLE appointments ADD COLUMN last_minute_cancelled_at TEXT;

CREATE TABLE appointment_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  previous_status TEXT NOT NULL,
  status TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);

CREATE INDEX idx_appointment_status_history_appointment_occurred
  ON appointment_status_history (appointment_id, occurred_at DESC, id DESC);
