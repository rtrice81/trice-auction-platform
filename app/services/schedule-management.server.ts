import { getEffectiveDateCapacity, type CapacityAreaDefaults } from "./date-capacity.server";

export type ScheduleResult =
  | { ok: true; message: string }
  | { ok: false; errors: string[] };

export type ScheduleDay = {
  date: string;
  exists: boolean;
  isOpen: boolean;
  note: string | null;
  dailyCapacityPoints: number;
  dailyCapacityOverridden: boolean;
  scheduledAppointments: number;
  usedPoints: number;
  remainingPoints: number;
  areas: Array<{
    id: number;
    name: string;
    usedPoints: number;
    capacityPoints: number;
    overflowAllowancePoints: number;
    remainingPoints: number;
    overflowUsagePoints: number;
    overridden: boolean;
    capacityOverridden: boolean;
    overflowOverridden: boolean;
  }>;
};

export type ScheduledAppointment = {
  id: number;
  time: string | null;
  customer: string;
  loadType: string;
  capacityPoints: number;
  status: string;
};

export async function getScheduleOverview(db: D1Database, selectedDate: string) {
  const [defaults, areaDefaults, dateResult] = await Promise.all([
    getDefaultDailyCapacity(db),
    getAreaDefaults(db),
    db
      .prepare(
        `SELECT dropoff_date AS date FROM dropoff_days WHERE dropoff_date >= ? AND dropoff_date < ?
         UNION
         SELECT DISTINCT appointment_date AS date FROM appointments WHERE appointment_date >= ? AND appointment_date < ?
         ORDER BY date`,
      )
      .bind(selectedDate, addDays(selectedDate, 31), selectedDate, addDays(selectedDate, 31))
      .all<{ date: string }>(),
  ]);
  const dates = [...new Set([selectedDate, ...dateResult.results.map((row) => row.date)])].sort();
  const days = await Promise.all(dates.map((date) => getScheduleDay(db, date, defaults, areaDefaults)));
  const selectedAppointments = await getAppointmentsForDate(db, selectedDate);
  return { selectedDate, days, selected: days.find((day) => day.date === selectedDate)!, selectedAppointments };
}

export async function createDropoffDate(
  db: D1Database,
  input: { date: string; isOpen: boolean; initializeWithDefaults: boolean; note: string },
): Promise<ScheduleResult> {
  if (!isIsoDate(input.date)) return { ok: false, errors: ["Choose a valid date."] };
  if (input.date < today()) return { ok: false, errors: ["New drop-off dates must be today or later."] };

  const existing = await db
    .prepare("SELECT id FROM dropoff_days WHERE dropoff_date = ?")
    .bind(input.date)
    .first<{ id: number }>();
  if (existing) return { ok: false, errors: ["This drop-off date has already been configured."] };

  const [defaultDailyCapacity, areas] = await Promise.all([
    getDefaultDailyCapacity(db),
    input.initializeWithDefaults ? getAreaDefaults(db) : Promise.resolve([]),
  ]);
  const day = await db
    .prepare(
      `INSERT INTO dropoff_days (
         dropoff_date, capacity_points, is_open, notes, daily_capacity_override
       ) VALUES (?, ?, ?, ?, ?)
       RETURNING id`,
    )
    .bind(
      input.date,
      defaultDailyCapacity,
      input.isOpen ? 1 : 0,
      input.note.trim() || null,
      input.initializeWithDefaults ? defaultDailyCapacity : null,
    )
    .first<{ id: number }>();
  if (!day) return { ok: false, errors: ["The drop-off date could not be created."] };

  if (input.initializeWithDefaults) {
    await db.batch(
      areas.map((area) =>
        db
          .prepare(
            `INSERT INTO dropoff_day_area_overrides
              (dropoff_day_id, item_area_id, capacity_points_override, overflow_allowance_points_override)
             VALUES (?, ?, ?, ?)`,
          )
          .bind(day.id, area.id, area.normalCapacityPoints, area.overflowAllowancePoints),
      ),
    );
  }

  return {
    ok: true,
    message: input.isOpen
      ? "Drop-off date created and opened for bookings."
      : "Drop-off date created and kept closed for bookings.",
  };
}

export async function deleteUnusedFutureDropoffDate(
  db: D1Database,
  date: string,
): Promise<ScheduleResult> {
  if (!isIsoDate(date)) return { ok: false, errors: ["Choose a valid date."] };
  if (date <= today()) return { ok: false, errors: ["Only unused future dates can be removed. Close this date instead."] };

  const [day, appointmentCount] = await Promise.all([
    db.prepare("SELECT id FROM dropoff_days WHERE dropoff_date = ?").bind(date).first<{ id: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = ?").bind(date).first<{ count: number }>(),
  ]);
  if (!day) return { ok: false, errors: ["This drop-off date has not been configured."] };
  if ((appointmentCount?.count ?? 0) > 0) {
    return { ok: false, errors: ["This date has appointments and cannot be removed. Close it instead."] };
  }

  await db.batch([
    db.prepare("DELETE FROM dropoff_day_area_overrides WHERE dropoff_day_id = ?").bind(day.id),
    db.prepare("DELETE FROM dropoff_days WHERE id = ?").bind(day.id),
  ]);
  return { ok: true, message: "Unused future drop-off date removed." };
}

export async function saveDateCapacityOverrides(
  db: D1Database,
  input: {
    date: string;
    isOpen: boolean;
    dailyCapacityOverride: number | null;
    note: string;
    areas: Array<{ itemAreaId: number; capacityOverride: number | null; overflowOverride: number | null }>;
  },
): Promise<ScheduleResult> {
  const errors = validateOverrideInput(input);
  if (errors.length > 0) return { ok: false, errors };
  const [defaultDailyCapacity, areas] = await Promise.all([getDefaultDailyCapacity(db), getAreaDefaults(db)]);
  const validAreaIds = new Set(areas.map((area) => area.id));
  if (input.areas.some((area) => !validAreaIds.has(area.itemAreaId))) {
    return { ok: false, errors: ["An unavailable storage area was submitted."] };
  }
  const hasOverride = !input.isOpen || input.dailyCapacityOverride !== null || input.areas.some(
    (area) => area.capacityOverride !== null || area.overflowOverride !== null,
  );
  if (hasOverride && !input.note.trim()) {
    return { ok: false, errors: ["Add an admin note explaining the date-specific change."] };
  }

  const day = await db.prepare("SELECT id FROM dropoff_days WHERE dropoff_date = ?").bind(input.date).first<{ id: number }>();
  if (!day) return { ok: false, errors: ["Create this drop-off date before changing its capacity."] };

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE dropoff_days
         SET is_open = ?,
             daily_capacity_override = ?,
             capacity_points = ?,
             notes = ?
         WHERE id = ?`,
      )
      .bind(
        input.isOpen ? 1 : 0,
        input.dailyCapacityOverride,
        input.dailyCapacityOverride ?? defaultDailyCapacity,
        input.note.trim() || null,
        day.id,
      ),
  ];
  for (const area of input.areas) {
    if (area.capacityOverride === null && area.overflowOverride === null) {
      statements.push(
        db
          .prepare("DELETE FROM dropoff_day_area_overrides WHERE dropoff_day_id = ? AND item_area_id = ?")
          .bind(day.id, area.itemAreaId),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO dropoff_day_area_overrides
              (dropoff_day_id, item_area_id, capacity_points_override, overflow_allowance_points_override)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(dropoff_day_id, item_area_id) DO UPDATE SET
               capacity_points_override = excluded.capacity_points_override,
               overflow_allowance_points_override = excluded.overflow_allowance_points_override`,
          )
          .bind(day.id, area.itemAreaId, area.capacityOverride, area.overflowOverride),
      );
    }
  }
  await db.batch(statements);
  return { ok: true, message: "Date-specific booking capacity saved." };
}

export async function resetDateCapacityOverrides(db: D1Database, date: string): Promise<ScheduleResult> {
  if (!isIsoDate(date)) return { ok: false, errors: ["Choose a valid date."] };
  const defaultDailyCapacity = await getDefaultDailyCapacity(db);
  const day = await db.prepare("SELECT id FROM dropoff_days WHERE dropoff_date = ?").bind(date).first<{ id: number }>();
  if (!day) return { ok: false, errors: ["Create this drop-off date before resetting it."] };
  await db.batch([
    db
      .prepare(
        `UPDATE dropoff_days
         SET is_open = 1, daily_capacity_override = NULL, capacity_points = ?, notes = NULL
         WHERE id = ?`,
      )
      .bind(defaultDailyCapacity, day.id),
    db.prepare("DELETE FROM dropoff_day_area_overrides WHERE dropoff_day_id = ?").bind(day.id),
  ]);
  return { ok: true, message: "Date reset to global defaults." };
}

async function getScheduleDay(
  db: D1Database,
  date: string,
  defaultDailyCapacity: number,
  areas: CapacityAreaDefaults[],
): Promise<ScheduleDay> {
  const [effective, summary, areaUsage] = await Promise.all([
    getEffectiveDateCapacity(db, date, defaultDailyCapacity, areas),
    db
      .prepare(
        `SELECT COUNT(*) AS scheduledAppointments, COALESCE(SUM(dt.capacity_points), 0) AS usedPoints
         FROM appointments a
         JOIN dropoff_types dt ON dt.id = a.dropoff_type_id
         WHERE a.appointment_date = ? AND a.status = 'scheduled'`,
      )
      .bind(date)
      .first<{ scheduledAppointments: number; usedPoints: number }>(),
    db
      .prepare(
        `SELECT allocation.item_area_id AS itemAreaId, COALESCE(SUM(allocation.capacity_points), 0) AS usedPoints
         FROM appointment_area_allocations allocation
         JOIN appointments a ON a.id = allocation.appointment_id
         WHERE a.appointment_date = ? AND a.status = 'scheduled'
         GROUP BY allocation.item_area_id`,
      )
      .bind(date)
      .all<{ itemAreaId: number; usedPoints: number }>(),
  ]);
  const usedByArea = new Map(areaUsage.results.map((row) => [row.itemAreaId, row.usedPoints]));
  const usedPoints = summary?.usedPoints ?? 0;
  if (!effective) {
    return {
      date,
      exists: false,
      isOpen: false,
      note: null,
      dailyCapacityPoints: defaultDailyCapacity,
      dailyCapacityOverridden: false,
      scheduledAppointments: summary?.scheduledAppointments ?? 0,
      usedPoints,
      remainingPoints: defaultDailyCapacity - usedPoints,
      areas: areas.map((area) => {
        const used = usedByArea.get(area.id) ?? 0;
        return {
          id: area.id,
          name: area.name,
          usedPoints: used,
          capacityPoints: area.normalCapacityPoints,
          overflowAllowancePoints: area.overflowAllowancePoints,
          remainingPoints: area.normalCapacityPoints + area.overflowAllowancePoints - used,
          overflowUsagePoints: Math.max(0, used - area.normalCapacityPoints),
          overridden: false,
          capacityOverridden: false,
          overflowOverridden: false,
        };
      }),
    };
  }
  return {
    date,
    exists: true,
    isOpen: effective.isOpen,
    note: effective.note,
    dailyCapacityPoints: effective.dailyCapacityPoints,
    dailyCapacityOverridden: effective.dailyCapacityOverridden,
    scheduledAppointments: summary?.scheduledAppointments ?? 0,
    usedPoints,
    remainingPoints: effective.dailyCapacityPoints - usedPoints,
    areas: effective.areas.map((area) => {
      const used = usedByArea.get(area.id) ?? 0;
      return {
        id: area.id,
        name: area.name,
        usedPoints: used,
        capacityPoints: area.capacityPoints,
        overflowAllowancePoints: area.overflowAllowancePoints,
        remainingPoints: area.capacityPoints + area.overflowAllowancePoints - used,
        overflowUsagePoints: Math.max(0, used - area.capacityPoints),
        overridden: area.capacityOverridden || area.overflowOverridden,
        capacityOverridden: area.capacityOverridden,
        overflowOverridden: area.overflowOverridden,
      };
    }),
  };
}

async function getAppointmentsForDate(db: D1Database, date: string): Promise<ScheduledAppointment[]> {
  const { results } = await db
    .prepare(
      `SELECT
        a.id,
        a.appointment_time AS time,
        COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS customer,
        dt.name AS loadType,
        dt.capacity_points AS capacityPoints,
        a.status
       FROM appointments a
       JOIN users u ON u.id = a.user_id
       JOIN dropoff_types dt ON dt.id = a.dropoff_type_id
       WHERE a.appointment_date = ?
       ORDER BY a.appointment_time, a.id`,
    )
    .bind(date)
    .all<ScheduledAppointment>();
  return results;
}

async function getDefaultDailyCapacity(db: D1Database) {
  const setting = await db.prepare("SELECT value FROM settings WHERE key = 'default_daily_intake_capacity'").first<{ value: string }>();
  const value = Number(setting?.value);
  if (!Number.isFinite(value) || value < 0) throw new Error("Default daily intake capacity is not configured correctly.");
  return value;
}

async function getAreaDefaults(db: D1Database): Promise<CapacityAreaDefaults[]> {
  const { results } = await db
    .prepare(
      `SELECT id, name, normal_capacity_points AS normalCapacityPoints,
              overflow_allowance_points AS overflowAllowancePoints
       FROM item_areas WHERE active = 1 ORDER BY display_order, name`,
    )
    .all<CapacityAreaDefaults>();
  return results;
}

function validateOverrideInput(input: {
  date: string;
  dailyCapacityOverride: number | null;
  areas: Array<{ capacityOverride: number | null; overflowOverride: number | null }>;
}) {
  const errors: string[] = [];
  if (!isIsoDate(input.date)) errors.push("Choose a valid date.");
  if (input.dailyCapacityOverride !== null && (!Number.isFinite(input.dailyCapacityOverride) || input.dailyCapacityOverride < 0)) errors.push("Daily capacity must be non-negative.");
  if (input.areas.some((area) => (area.capacityOverride !== null && (!Number.isFinite(area.capacityOverride) || area.capacityOverride < 0)) || (area.overflowOverride !== null && (!Number.isFinite(area.overflowOverride) || area.overflowOverride < 0)))) errors.push("Storage capacities and overflow allowances must be non-negative.");
  return errors;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
