-- Treat each configured drop-off day as a saved operational event.
ALTER TABLE dropoff_days ADD COLUMN event_name TEXT;

-- Existing configured dates retain their saved daily capacity instead of
-- following later global-default changes.
UPDATE dropoff_days
SET daily_capacity_override = capacity_points
WHERE daily_capacity_override IS NULL;

-- Materialize each active storage area's current values for existing events.
INSERT INTO dropoff_day_area_overrides (
  dropoff_day_id,
  item_area_id,
  capacity_points_override,
  overflow_allowance_points_override
)
SELECT
  day.id,
  area.id,
  area.normal_capacity_points,
  area.overflow_allowance_points
FROM dropoff_days AS day
CROSS JOIN item_areas AS area
LEFT JOIN dropoff_day_area_overrides AS existing
  ON existing.dropoff_day_id = day.id AND existing.item_area_id = area.id
WHERE area.active = 1 AND existing.dropoff_day_id IS NULL;
