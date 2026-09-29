-- Internal estate and consignment pickup planning. Pickups are deliberately
-- independent from public drop-off dates and their capacity accounting.
CREATE TABLE consignment_pickups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  pickup_date TEXT NOT NULL,
  arrival_time TEXT,
  estimated_duration_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'scheduled', 'en_route', 'on_site', 'completed', 'cancelled')),
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  access_instructions TEXT,
  estate_description TEXT,
  estimated_load_size TEXT,
  estimated_smalls_percent INTEGER NOT NULL DEFAULT 0 CHECK (estimated_smalls_percent BETWEEN 0 AND 100),
  estimated_large_percent INTEGER NOT NULL DEFAULT 0 CHECK (estimated_large_percent BETWEEN 0 AND 100),
  estimated_outdoor_percent INTEGER NOT NULL DEFAULT 0 CHECK (estimated_outdoor_percent BETWEEN 0 AND 100),
  internal_notes TEXT,
  created_by_user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (created_by_user_id) REFERENCES users(id)
);

CREATE INDEX idx_consignment_pickups_date_status ON consignment_pickups(pickup_date, status);
CREATE INDEX idx_consignment_pickups_user ON consignment_pickups(user_id, pickup_date DESC);

-- This join table is intentionally separate so crew, vehicles, and routing can
-- grow without changing the pickup record.
CREATE TABLE consignment_pickup_assignments (
  pickup_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  assigned_by_user_id INTEGER,
  PRIMARY KEY (pickup_id, user_id),
  FOREIGN KEY (pickup_id) REFERENCES consignment_pickups(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_consignment_pickup_assignments_user ON consignment_pickup_assignments(user_id, pickup_id);
