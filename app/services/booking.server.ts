export type ItemArea = {
  id: number;
  name: string;
  measurementType: "shelves" | "square_feet" | "points";
  physicalCapacity: number;
  pointsPerUnit: number;
  normalCapacityPoints: number;
  overflowAllowancePoints: number;
  displayOrder: number;
};

export type DropoffType = {
  id: number;
  name: string;
  capacityPoints: number;
};

type BookingInput = {
  userId: number;
  appointmentDate: string;
  dropoffTypeId: number;
  description: string;
  allocations: Array<{ itemAreaId: number; percentage: number }>;
};

type Settings = {
  defaultDailyIntakeCapacity: number;
  monthlyBookingLimit: number;
};

export type BookingResult =
  | { ok: true; appointmentId: number; message: string }
  | { ok: false; errors: string[] };

const ACTIVE_APPOINTMENT_STATUS = "scheduled";

export async function getBookingOptions(db: D1Database) {
  const [dropoffTypesResult, itemAreasResult] = await db.batch([
    db
      .prepare(
        `SELECT id, name, capacity_points AS capacityPoints
         FROM dropoff_types
         WHERE active = 1
         ORDER BY capacity_points ASC, name ASC`,
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
           display_order AS displayOrder
         FROM item_areas
         WHERE active = 1
         ORDER BY display_order ASC, name ASC`,
      ),
  ]);

  return {
    dropoffTypes: dropoffTypesResult.results as DropoffType[],
    itemAreas: itemAreasResult.results as ItemArea[],
  };
}

export async function createBooking(
  db: D1Database,
  input: BookingInput,
): Promise<BookingResult> {
  const errors = validateInput(input);
  if (errors.length > 0) return { ok: false, errors };

  const [options, settings] = await Promise.all([
    getBookingOptions(db),
    getSettings(db),
  ]);

  const dropoffType = options.dropoffTypes.find(
    (type) => type.id === input.dropoffTypeId,
  );
  if (!dropoffType) {
    return { ok: false, errors: ["Choose an available load type."] };
  }

  const allocationErrors = validateAllocations(input.allocations, options.itemAreas);
  if (allocationErrors.length > 0) return { ok: false, errors: allocationErrors };

  const monthBounds = getMonthBounds(input.appointmentDate);
  const monthlyBookings = await db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM appointments
         WHERE user_id = ?
           AND appointment_date >= ?
           AND appointment_date < ?
           AND status = ?`,
      )
      .bind(
        input.userId,
        monthBounds.start,
        monthBounds.end,
        ACTIVE_APPOINTMENT_STATUS,
      )
      .first<{ count: number }>();

  if ((monthlyBookings?.count ?? 0) >= settings.monthlyBookingLimit) {
      return {
        ok: false,
        errors: [`This consignor has reached the monthly booking limit of ${settings.monthlyBookingLimit}.`],
      };
  }

  await db
    .prepare(
      `INSERT INTO dropoff_days (dropoff_date, capacity_points)
       VALUES (?, ?)
       ON CONFLICT(dropoff_date) DO NOTHING`,
    )
    .bind(input.appointmentDate, settings.defaultDailyIntakeCapacity)
    .run();

  const capacityErrors = await getCapacityErrors(
    db,
    input.appointmentDate,
    dropoffType,
    options.itemAreas,
    input.allocations,
  );
  if (capacityErrors.length > 0) return { ok: false, errors: capacityErrors };

  const appointment = await db
    .prepare(
      `INSERT INTO appointments (
        user_id, appointment_date, dropoff_type_id, description, status
      ) VALUES (?, ?, ?, ?, ?)
      RETURNING id`,
    )
    .bind(
      input.userId,
      input.appointmentDate,
      dropoffType.id,
      input.description || null,
      ACTIVE_APPOINTMENT_STATUS,
    )
    .first<{ id: number }>();

  if (!appointment) {
    return { ok: false, errors: ["The booking could not be created. Please try again."] };
  }

  const allocationStatements = input.allocations.map((allocation) =>
    db
      .prepare(
        `INSERT INTO appointment_area_allocations (
          appointment_id, item_area_id, allocation_percent, capacity_points
        ) VALUES (?, ?, ?, ?)`,
      )
      .bind(
        appointment.id,
        allocation.itemAreaId,
        allocation.percentage,
        calculateAllocatedPoints(dropoffType.capacityPoints, allocation.percentage),
      ),
  );
  await db.batch(allocationStatements);

  return {
    ok: true,
    appointmentId: appointment.id,
    message: "Your drop-off request has been scheduled.",
  };
}

function validateInput(input: BookingInput) {
  const errors: string[] = [];
  if (!isIsoDate(input.appointmentDate)) errors.push("Choose a valid drop-off date.");
  if (!Number.isInteger(input.dropoffTypeId) || input.dropoffTypeId < 1) {
    errors.push("Choose a load type.");
  }
  return errors;
}

function validateAllocations(
  allocations: BookingInput["allocations"],
  itemAreas: ItemArea[],
) {
  const errors: string[] = [];
  const submittedIds = new Set(allocations.map((allocation) => allocation.itemAreaId));
  const activeIds = new Set(itemAreas.map((area) => area.id));

  if (submittedIds.size !== allocations.length || submittedIds.size !== activeIds.size) {
    errors.push("Provide one allocation for every active item area.");
  }
  if ([...submittedIds].some((id) => !activeIds.has(id))) {
    errors.push("An unavailable item area was submitted.");
  }
  if (allocations.some(({ percentage }) => !Number.isInteger(percentage) || percentage < 0 || percentage > 100)) {
    errors.push("Each item-area allocation must be a whole percentage from 0 to 100.");
  }
  if (allocations.reduce((total, allocation) => total + allocation.percentage, 0) !== 100) {
    errors.push("Item-area allocations must total exactly 100%.");
  }
  return errors;
}

async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db
    .prepare(
      `SELECT key, value FROM settings
       WHERE key IN ('default_daily_intake_capacity', 'monthly_booking_limit')`,
    )
    .all<{ key: string; value: string }>();
  const values = new Map(results.map((setting) => [setting.key, Number(setting.value)]));
  const defaultDailyIntakeCapacity = values.get("default_daily_intake_capacity");
  const monthlyBookingLimit = values.get("monthly_booking_limit");

  if (
    !Number.isFinite(defaultDailyIntakeCapacity) ||
    defaultDailyIntakeCapacity! < 0 ||
    !Number.isInteger(monthlyBookingLimit) ||
    monthlyBookingLimit! < 1
  ) {
    throw new Error("Booking capacity settings are not configured correctly.");
  }

  return {
    defaultDailyIntakeCapacity: defaultDailyIntakeCapacity!,
    monthlyBookingLimit: monthlyBookingLimit!,
  };
}

async function getCapacityErrors(
  db: D1Database,
  appointmentDate: string,
  dropoffType: DropoffType,
  itemAreas: ItemArea[],
  allocations: BookingInput["allocations"],
) {
  const errors: string[] = [];
  const dropoffDay = await db
    .prepare(
      "SELECT capacity_points AS capacityPoints, is_open AS isOpen FROM dropoff_days WHERE dropoff_date = ?",
    )
    .bind(appointmentDate)
    .first<{ capacityPoints: number; isOpen: number }>();
  if (!dropoffDay?.isOpen) return ["This drop-off date is not open for bookings."];

  const dailyUsage = await db
    .prepare(
      `SELECT COALESCE(SUM(dt.capacity_points), 0) AS usedPoints
       FROM appointments appointment
       JOIN dropoff_types dt ON dt.id = appointment.dropoff_type_id
       WHERE appointment.appointment_date = ? AND appointment.status = ?`,
    )
    .bind(appointmentDate, ACTIVE_APPOINTMENT_STATUS)
    .first<{ usedPoints: number }>();
  if ((dailyUsage?.usedPoints ?? 0) + dropoffType.capacityPoints > dropoffDay.capacityPoints) {
    errors.push("This drop-off date has reached its daily intake capacity.");
  }

  const { results: areaUsage } = await db
    .prepare(
      `SELECT allocation.item_area_id AS itemAreaId,
              COALESCE(SUM(allocation.capacity_points), 0) AS usedPoints
       FROM appointment_area_allocations allocation
       JOIN appointments appointment ON appointment.id = allocation.appointment_id
       WHERE appointment.appointment_date = ? AND appointment.status = ?
       GROUP BY allocation.item_area_id`,
    )
    .bind(appointmentDate, ACTIVE_APPOINTMENT_STATUS)
    .all<{ itemAreaId: number; usedPoints: number }>();
  const usedByArea = new Map(areaUsage.map((usage) => [usage.itemAreaId, usage.usedPoints]));

  for (const area of itemAreas) {
    const percentage = allocations.find(
      (allocation) => allocation.itemAreaId === area.id,
    )!.percentage;
    const requestedPoints = calculateAllocatedPoints(dropoffType.capacityPoints, percentage);
    const allowedPoints = area.normalCapacityPoints + area.overflowAllowancePoints;
    if ((usedByArea.get(area.id) ?? 0) + requestedPoints > allowedPoints) {
      errors.push(
        `${area.name} has reached its capacity, including the allowed overflow.`,
      );
    }
  }

  return errors;
}


function calculateAllocatedPoints(capacityPoints: number, percentage: number) {
  return Math.round(capacityPoints * (percentage / 100) * 10_000) / 10_000;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function getMonthBounds(date: string) {
  const [year, month] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
  return { start, end };
}
