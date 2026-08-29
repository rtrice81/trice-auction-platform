-- One-time, authenticated confirmation messages for newly created appointments.
CREATE TABLE booking_success_flashes (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  appointment_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE
);

CREATE INDEX idx_booking_success_flashes_expires_at
  ON booking_success_flashes (expires_at);
