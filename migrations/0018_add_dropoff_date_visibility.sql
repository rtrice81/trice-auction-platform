ALTER TABLE dropoff_days ADD COLUMN visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public', 'private'));

-- Existing Booking Event children retain their public customer-facing role.
UPDATE dropoff_days
SET visibility = 'public'
WHERE id IN (SELECT dropoff_day_id FROM booking_event_dropoff_dates);
