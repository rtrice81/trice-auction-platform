-- Booking Event windows control public signup timing. A linked public child
-- date's is_open flag is only its explicit operational staff closure control.
-- Older children were created with is_open = 0 solely because the parent
-- window had not opened yet; make those dates operationally enabled so the
-- parent window can govern availability dynamically.
UPDATE dropoff_days
SET is_open = 1
WHERE visibility = 'public'
  AND is_open = 0
  AND id IN (SELECT dropoff_day_id FROM booking_event_dropoff_dates);
