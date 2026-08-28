export type CapacityAreaDefaults = {
  id: number;
  name: string;
  normalCapacityPoints: number;
  overflowAllowancePoints: number;
};

export type EffectiveDateCapacity = {
  date: string;
  isOpen: boolean;
  note: string | null;
  dailyCapacityPoints: number;
  dailyCapacityOverridden: boolean;
  areas: Array<CapacityAreaDefaults & {
    capacityPoints: number;
    overflowAllowancePoints: number;
    capacityOverridden: boolean;
    overflowOverridden: boolean;
  }>;
};

export async function getEffectiveDateCapacity(
  db: D1Database,
  date: string,
  defaultDailyCapacityPoints: number,
  areas: CapacityAreaDefaults[],
): Promise<EffectiveDateCapacity | null> {
  const day = await db
    .prepare(
      `SELECT id, is_open AS isOpen, notes, daily_capacity_override AS dailyCapacityOverride
       FROM dropoff_days
       WHERE dropoff_date = ?`,
    )
    .bind(date)
    .first<{ id: number; isOpen: number; notes: string | null; dailyCapacityOverride: number | null }>();
  if (!day) return null;

  const overrides = await db
    .prepare(
      `SELECT
         item_area_id AS itemAreaId,
         capacity_points_override AS capacityPointsOverride,
         overflow_allowance_points_override AS overflowAllowancePointsOverride
       FROM dropoff_day_area_overrides
       WHERE dropoff_day_id = ?`,
    )
    .bind(day.id)
    .all<{
      itemAreaId: number;
      capacityPointsOverride: number | null;
      overflowAllowancePointsOverride: number | null;
    }>();
  const byArea = new Map(overrides.results.map((override) => [override.itemAreaId, override]));

  return {
    date,
    isOpen: day.isOpen === 1,
    note: day.notes,
    dailyCapacityPoints: day.dailyCapacityOverride ?? defaultDailyCapacityPoints,
    dailyCapacityOverridden: day.dailyCapacityOverride !== null && day.dailyCapacityOverride !== undefined,
    areas: areas.map((area) => {
      const override = byArea.get(area.id);
      return {
        ...area,
        capacityPoints: override?.capacityPointsOverride ?? area.normalCapacityPoints,
        overflowAllowancePoints:
          override?.overflowAllowancePointsOverride ?? area.overflowAllowancePoints,
        capacityOverridden: override?.capacityPointsOverride !== null && override?.capacityPointsOverride !== undefined,
        overflowOverridden:
          override?.overflowAllowancePointsOverride !== null &&
          override?.overflowAllowancePointsOverride !== undefined,
      };
    }),
  };
}
