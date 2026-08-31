CREATE TABLE booking_releases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  opens_at TEXT NOT NULL,
  closes_at TEXT,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (closes_at IS NULL OR closes_at > opens_at)
);
CREATE TABLE booking_release_events (
  booking_release_id INTEGER NOT NULL REFERENCES booking_releases(id) ON DELETE CASCADE,
  dropoff_day_id INTEGER NOT NULL UNIQUE REFERENCES dropoff_days(id) ON DELETE CASCADE,
  PRIMARY KEY (booking_release_id, dropoff_day_id)
);
CREATE INDEX idx_booking_release_events_release ON booking_release_events(booking_release_id);
