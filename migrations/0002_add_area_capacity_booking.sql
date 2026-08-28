-- Store editable physical and points-based capacity for each intake area.
CREATE TABLE item_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  measurement_type TEXT NOT NULL CHECK (measurement_type IN ('shelves', 'square_feet', 'points')),
  physical_capacity REAL NOT NULL CHECK (physical_capacity >= 0),
  points_per_unit REAL NOT NULL CHECK (points_per_unit > 0),
  normal_capacity_points REAL NOT NULL CHECK (normal_capacity_points >= 0),
  overflow_allowance_points REAL NOT NULL DEFAULT 0 CHECK (overflow_allowance_points >= 0),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  display_order INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE appointment_area_allocations (
  appointment_id INTEGER NOT NULL,
  item_area_id INTEGER NOT NULL,
  allocation_percent INTEGER NOT NULL CHECK (allocation_percent BETWEEN 0 AND 100),
  capacity_points REAL NOT NULL CHECK (capacity_points >= 0),
  PRIMARY KEY (appointment_id, item_area_id),
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (item_area_id) REFERENCES item_areas(id)
);

CREATE INDEX idx_appointments_date_status
  ON appointments (appointment_date, status);

CREATE INDEX idx_appointment_area_allocations_area
  ON appointment_area_allocations (item_area_id, appointment_id);

-- Adopt a whole-number scale that supports proportional allocation cleanly.
UPDATE dropoff_types SET capacity_points = 10 WHERE name = 'Car Load';
UPDATE dropoff_types SET capacity_points = 20 WHERE name = 'Truck Load';
UPDATE dropoff_types SET capacity_points = 30 WHERE name = 'Trailer under 16''';
UPDATE dropoff_types SET capacity_points = 50 WHERE name = 'Trailer over 16'' / Larger Trailer';

INSERT INTO item_areas (
  name,
  measurement_type,
  physical_capacity,
  points_per_unit,
  normal_capacity_points,
  overflow_allowance_points,
  display_order
) VALUES
  ('Smalls', 'shelves', 50, 10, 500, 100, 1),
  ('Large/Furniture', 'square_feet', 4000, 0.1, 400, 80, 2),
  ('Outdoor', 'square_feet', 3500, 0.1, 350, 70, 3);

-- Operational limits are settings so a future admin interface can edit them.
DELETE FROM settings WHERE key = 'default_daily_capacity';

INSERT INTO settings (key, value) VALUES
  ('default_daily_intake_capacity', '120'),
  ('monthly_booking_limit', '2')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
