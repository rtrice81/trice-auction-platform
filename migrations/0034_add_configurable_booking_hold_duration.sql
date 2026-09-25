-- NULL on a date means inherit its Booking Event; dates without a parent use
-- the application default. Existing Booking Events retain the historic 15 min.
ALTER TABLE booking_events ADD COLUMN hold_duration_minutes INTEGER NOT NULL DEFAULT 15 CHECK (hold_duration_minutes BETWEEN 5 AND 60);
ALTER TABLE dropoff_days ADD COLUMN hold_duration_minutes_override INTEGER NULL CHECK (hold_duration_minutes_override BETWEEN 5 AND 60);
