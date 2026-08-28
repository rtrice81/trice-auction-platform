-- Keep global settings as defaults while allowing explicit operational overrides per date.
ALTER TABLE dropoff_days ADD COLUMN daily_capacity_override REAL;

CREATE TABLE dropoff_day_area_overrides (
  dropoff_day_id INTEGER NOT NULL,
  item_area_id INTEGER NOT NULL,
  capacity_points_override REAL,
  overflow_allowance_points_override REAL,
  PRIMARY KEY (dropoff_day_id, item_area_id),
  FOREIGN KEY (dropoff_day_id) REFERENCES dropoff_days(id) ON DELETE CASCADE,
  FOREIGN KEY (item_area_id) REFERENCES item_areas(id) ON DELETE CASCADE,
  CHECK (capacity_points_override IS NULL OR capacity_points_override >= 0),
  CHECK (overflow_allowance_points_override IS NULL OR overflow_allowance_points_override >= 0)
);

CREATE INDEX idx_dropoff_day_area_overrides_day
  ON dropoff_day_area_overrides (dropoff_day_id, item_area_id);
