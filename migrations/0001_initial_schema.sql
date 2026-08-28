-- Migration number: 0001 	 2026-08-28T15:15:31.970Z
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE dropoff_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  capacity_points INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE dropoff_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dropoff_date TEXT NOT NULL UNIQUE,
  capacity_points INTEGER NOT NULL,
  is_open INTEGER NOT NULL DEFAULT 1,
  notes TEXT
);

CREATE TABLE appointments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  appointment_date TEXT NOT NULL,
  appointment_time TEXT,
  dropoff_type_id INTEGER NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  admin_notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (dropoff_type_id) REFERENCES dropoff_types(id)
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO dropoff_types (name, capacity_points) VALUES
  ('Car Load', 1),
  ('Truck Load', 2),
  ('Trailer under 16''', 3),
  ('Trailer over 16'' / Larger Trailer', 5);

INSERT INTO settings (key, value) VALUES
  ('monthly_booking_limit', '2'),
  ('default_daily_capacity', '12');