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

export async function ensureDropoffDay(
  db: D1Database,
  date: string,
  defaultDailyCapacityPoints: number,
) {
  await db
    .prepare(
      `INSERT INTO dropoff_days (dropoff_date, capacity_points)
       VALUES (?, ?)
       ON CONFLICT(dropoff_date) DO NOTHING`,
    )
    .bind(date, defaultDailyCapacityPoints)
    .run();
}

export async function getEffectiveDateCapacity(
  db: D1Database,
  date: string,
  defaultDailyCapacityPoints: number,
  areas: CapacityAreaDefaults[],
): Promise<EffectiveDateCapacity> {
  const day = await db
    .prepare(
      `SELECT id, is_open AS isOpen, notes, daily_capacity_override AS dailyCapacityOverride
       FROM dropoff_days
       WHERE dropoff_date = ?`,
    )
    .bind(date)
    .first<{ id: number; isOpen: number; notes: string | null; dailyCapacityOverride: number | null }>();
  const overrides = day
    ? await db
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
        }>()
    : { results: [] };
  const byArea = new Map(overrides.results.map((override) => [override.itemAreaId, override]));

  return {
    date,
    isOpen: day ? day.isOpen === 1 : true,
    note: day?.notes ?? null,
    dailyCapacityPoints: day?.dailyCapacityOverride ?? defaultDailyCapacityPoints,
    dailyCapacityOverridden: day?.dailyCapacityOverride !== null && day?.dailyCapacityOverride !== undefined,
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
