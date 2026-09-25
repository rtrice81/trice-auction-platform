INSERT INTO settings (key, value) VALUES ('default_booking_hold_duration_minutes', '15')
ON CONFLICT(key) DO NOTHING;
