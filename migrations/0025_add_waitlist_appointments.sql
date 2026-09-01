-- Keep the existing overflow columns as the configured waitlist allowance.
-- These fields record when and why an appointment entered the waitlist.
ALTER TABLE appointments ADD COLUMN waitlisted_at TEXT;
ALTER TABLE appointments ADD COLUMN waitlist_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_appointments_waitlist_order
  ON appointments (appointment_date, status, waitlisted_at, id);
