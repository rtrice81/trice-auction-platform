-- A short-lived, opaque claim made before a customer completes authentication
-- and the remainder of a public booking. Expiry is evaluated in every query;
-- cleanup is deliberately not required for correctness.
CREATE TABLE booking_holds (
  id TEXT PRIMARY KEY,
  booking_attempt_id TEXT NOT NULL UNIQUE,
  hold_token TEXT NOT NULL UNIQUE,
  dropoff_day_id INTEGER NOT NULL,
  user_id INTEGER,
  load_type_id INTEGER NOT NULL,
  allocations_json TEXT NOT NULL,
  reserved_daily_intake_points REAL NOT NULL,
  reserved_smalls_points REAL NOT NULL DEFAULT 0,
  reserved_large_furniture_points REAL NOT NULL DEFAULT 0,
  reserved_outdoor_points REAL NOT NULL DEFAULT 0,
  appointment_status TEXT NOT NULL DEFAULT 'scheduled' CHECK (appointment_status IN ('scheduled', 'waitlisted')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'converted', 'expired', 'released')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  converted_at TEXT,
  FOREIGN KEY (dropoff_day_id) REFERENCES dropoff_days(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (load_type_id) REFERENCES dropoff_types(id)
);

CREATE INDEX idx_booking_holds_day_active_expiry
  ON booking_holds (dropoff_day_id, status, expires_at);
CREATE INDEX idx_booking_holds_user_active_expiry
  ON booking_holds (user_id, status, expires_at);
CREATE INDEX idx_booking_holds_attempt ON booking_holds (booking_attempt_id);

-- A converted hold is linked to its single appointment, which makes an
-- idempotent final submit possible and prevents it being counted twice.
ALTER TABLE appointments ADD COLUMN booking_hold_id TEXT REFERENCES booking_holds(id);
CREATE UNIQUE INDEX idx_appointments_booking_hold_id ON appointments (booking_hold_id);
