CREATE TABLE appointment_notification_recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  active INTEGER NOT NULL DEFAULT 1,
  receive_created INTEGER NOT NULL DEFAULT 1,
  receive_updated INTEGER NOT NULL DEFAULT 1,
  receive_cancelled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_appointment_notification_recipients_active
  ON appointment_notification_recipients(active);
