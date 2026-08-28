export type AdminDropoffType = {
  id: number;
  name: string;
  capacityPoints: number;
  active: number;
};

export type AdminItemArea = {
  id: number;
  name: string;
  measurementType: "shelves" | "square_feet" | "points";
  physicalCapacity: number;
  pointsPerUnit: number;
  normalCapacityPoints: number;
  overflowAllowancePoints: number;
  active: number;
  displayOrder: number;
};

export type CapacitySettings = {
  defaultDailyIntakeCapacity: number;
  monthlyBookingLimit: number;
  dropoffTypes: AdminDropoffType[];
  itemAreas: AdminItemArea[];
};

export type CapacitySettingsResult =
  | { ok: true; message: string }
  | { ok: false; errors: string[] };

type GeneralSettingsInput = {
  defaultDailyIntakeCapacity: number;
  monthlyBookingLimit: number;
};

type DropoffTypeInput = {
  id?: number;
  name: string;
  capacityPoints: number;
  active: boolean;
};

type ItemAreaInput = {
  id: number;
  name: string;
  measurementType: string;
  physicalCapacity: number;
  pointsPerUnit: number;
  normalCapacityPoints: number;
  overflowAllowancePoints: number;
  active: boolean;
  displayOrder: number;
};

const MEASUREMENT_TYPES = new Set(["shelves", "square_feet", "points"]);

export async function getCapacitySettings(db: D1Database): Promise<CapacitySettings> {
  const [settingsResult, dropoffTypesResult, itemAreasResult] = await db.batch([
    db
      .prepare(
        `SELECT key, value FROM settings
         WHERE key IN ('default_daily_intake_capacity', 'monthly_booking_limit')`,
      ),
    db
      .prepare(
        `SELECT id, name, capacity_points AS capacityPoints, active
         FROM dropoff_types
         ORDER BY active DESC, capacity_points ASC, name ASC`,
      ),
    db
      .prepare(
        `SELECT
           id,
           name,
           measurement_type AS measurementType,
           physical_capacity AS physicalCapacity,
           points_per_unit AS pointsPerUnit,
           normal_capacity_points AS normalCapacityPoints,
           overflow_allowance_points AS overflowAllowancePoints,
           active,
           display_order AS displayOrder
         FROM item_areas
         ORDER BY display_order ASC, name ASC`,
      ),
  ]);

  const settings = new Map(
    (settingsResult.results as Array<{ key: string; value: string }>).map((setting) => [
      setting.key,
      Number(setting.value),
    ]),
  );
  const defaultDailyIntakeCapacity = settings.get("default_daily_intake_capacity");
  const monthlyBookingLimit = settings.get("monthly_booking_limit");

  if (!isNonNegativeNumber(defaultDailyIntakeCapacity) || !isPositiveInteger(monthlyBookingLimit)) {
    throw new Error("Capacity settings are not configured correctly.");
  }

  return {
    defaultDailyIntakeCapacity: defaultDailyIntakeCapacity!,
    monthlyBookingLimit: monthlyBookingLimit!,
    dropoffTypes: dropoffTypesResult.results as AdminDropoffType[],
    itemAreas: itemAreasResult.results as AdminItemArea[],
  };
}

export async function saveGeneralSettings(
  db: D1Database,
  input: GeneralSettingsInput,
): Promise<CapacitySettingsResult> {
  const errors: string[] = [];
  if (!isNonNegativeNumber(input.defaultDailyIntakeCapacity)) {
    errors.push("Default daily intake capacity must be a non-negative number.");
  }
  if (!isPositiveInteger(input.monthlyBookingLimit)) {
    errors.push("Monthly booking limit must be a whole number of at least 1.");
  }
  if (errors.length > 0) return { ok: false, errors };

  await db.batch([
    db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('default_daily_intake_capacity', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(String(input.defaultDailyIntakeCapacity)),
    db
      .prepare(
        `INSERT INTO settings (key, value) VALUES ('monthly_booking_limit', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind(String(input.monthlyBookingLimit)),
  ]);

  return { ok: true, message: "General capacity settings saved." };
}

export async function saveDropoffType(
  db: D1Database,
  input: DropoffTypeInput,
): Promise<CapacitySettingsResult> {
  const errors = validateDropoffType(input);
  if (errors.length > 0) return { ok: false, errors };

  try {
    if (input.id) {
      const updated = await db
        .prepare(
          `UPDATE dropoff_types
           SET name = ?, capacity_points = ?, active = ?
           WHERE id = ?`,
        )
        .bind(input.name, input.capacityPoints, input.active ? 1 : 0, input.id)
        .run();
      if (updated.meta.changes !== 1) return { ok: false, errors: ["Load type was not found."] };
      return { ok: true, message: "Load type saved." };
    }

    await db
      .prepare("INSERT INTO dropoff_types (name, capacity_points, active) VALUES (?, ?, ?)")
      .bind(input.name, input.capacityPoints, input.active ? 1 : 0)
      .run();
    return { ok: true, message: "New load type added." };
  } catch (error) {
    return databaseErrorResult(error, "A load type with this name already exists.");
  }
}

export async function saveItemArea(
  db: D1Database,
  input: ItemAreaInput,
): Promise<CapacitySettingsResult> {
  const errors = validateItemArea(input);
  if (errors.length > 0) return { ok: false, errors };

  try {
    const updated = await db
      .prepare(
        `UPDATE item_areas
         SET
           name = ?,
           measurement_type = ?,
           physical_capacity = ?,
           points_per_unit = ?,
           normal_capacity_points = ?,
           overflow_allowance_points = ?,
           active = ?,
           display_order = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
      )
      .bind(
        input.name,
        input.measurementType,
        input.physicalCapacity,
        input.pointsPerUnit,
        input.normalCapacityPoints,
        input.overflowAllowancePoints,
        input.active ? 1 : 0,
        input.displayOrder,
        input.id,
      )
      .run();
    if (updated.meta.changes !== 1) return { ok: false, errors: ["Storage area was not found."] };
    return { ok: true, message: "Storage area saved." };
  } catch (error) {
    return databaseErrorResult(error, "A storage area with this name already exists.");
  }
}

function validateDropoffType(input: DropoffTypeInput) {
  const errors: string[] = [];
  if (!input.name) errors.push("Load type name is required.");
  if (!isPositiveInteger(input.capacityPoints)) {
    errors.push("Load type capacity points must be a whole number of at least 1.");
  }
  return errors;
}

function validateItemArea(input: ItemAreaInput) {
  const errors: string[] = [];
  if (!input.name) errors.push("Storage area name is required.");
  if (!MEASUREMENT_TYPES.has(input.measurementType)) {
    errors.push("Choose a supported measurement type.");
  }
  if (!isNonNegativeNumber(input.physicalCapacity)) {
    errors.push("Physical capacity must be a non-negative number.");
  }
  if (!isPositiveNumber(input.pointsPerUnit)) {
    errors.push("Conversion factor must be greater than zero.");
  }
  if (!isNonNegativeNumber(input.normalCapacityPoints)) {
    errors.push("Normal capacity must be a non-negative number.");
  }
  if (!isNonNegativeNumber(input.overflowAllowancePoints)) {
    errors.push("Overflow allowance must be a non-negative number.");
  }
  if (!isNonNegativeInteger(input.displayOrder)) {
    errors.push("Display order must be a non-negative whole number.");
  }
  return errors;
}

function databaseErrorResult(error: unknown, duplicateMessage: string): CapacitySettingsResult {
  if (error instanceof Error && /unique/i.test(error.message)) {
    return { ok: false, errors: [duplicateMessage] };
  }
  throw error;
}

function isPositiveInteger(value: number | undefined) {
  return Number.isInteger(value) && value! >= 1;
}

function isNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

function isPositiveNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

function isNonNegativeNumber(value: number | undefined) {
  return Number.isFinite(value) && value! >= 0;
}
