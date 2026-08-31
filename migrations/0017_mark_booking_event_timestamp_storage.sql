-- Existing values were written from datetime-local form values as if they were UTC.
-- Keep them untouched and explicitly mark their legacy interpretation so DST-aware
-- conversion can preserve the administrator's original America/New_York wall time.
ALTER TABLE booking_events ADD COLUMN timestamp_storage_version INTEGER NOT NULL DEFAULT 1;
