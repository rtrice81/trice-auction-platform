-- Booking Events are the customer-facing parent of one or more public Drop-Off Dates.
-- Renaming preserves all existing release/date assignments and appointments.
ALTER TABLE booking_releases RENAME TO booking_events;
ALTER TABLE booking_release_events RENAME TO booking_event_dropoff_dates;
ALTER TABLE booking_event_dropoff_dates RENAME COLUMN booking_release_id TO booking_event_id;

ALTER TABLE booking_events ADD COLUMN description TEXT;

CREATE INDEX IF NOT EXISTS idx_booking_event_dropoff_dates_event
  ON booking_event_dropoff_dates(booking_event_id);
