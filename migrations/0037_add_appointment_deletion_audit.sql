CREATE TABLE appointment_deletion_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  appointment_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  dropoff_day_id INTEGER,
  dropoff_date TEXT NOT NULL,
  actor_user_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type = 'appointment_deleted'),
  occurred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointment_deletion_audits_appointment_occurred
  ON appointment_deletion_audits (appointment_id, occurred_at DESC, id DESC);
