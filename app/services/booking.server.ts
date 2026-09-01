import { getEffectiveDateCapacity, type EffectiveDateCapacity } from "./date-capacity.server";
import { getBookableBookingEventForDate } from "./booking-event.server";
import { bookingEventInstant } from "../lib/booking-event-time";

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

export type AvailableDropoffDate = {
  date: string;
  eventName: string | null;
  adminStatus?: string[];
};

export type BookingInput = {
  userId: number;
  appointmentId?: number;
  appointmentDate: string;
  dropoffTypeId: number;
  description: string;
  allocations: Array<{ itemAreaId: number; percentage: number }>;
};

type Settings = {
  defaultDailyIntakeCapacity: number;
  monthlyBookingLimit: number;
};

export type CapacityContext = {
  monthly: {
    appointmentDate: string;
    bookingCount: number;
    bookingLimit: number;
    monthStart: string;
    monthEnd: string;
  };
  day: {
    date: string;
    isOpen: boolean;
    capacityPoints: number;
    usedPoints: number;
    requestedPoints: number;
  } | null;
  areas: Array<{
    id: number;
    name: string;
    usedPoints: number;
    requestedPoints: number;
    allowedPoints: number;
  }>;
};

export type BookingResult =
  | { ok: true; appointmentId: number; message: string }
  | {
      ok: false;
      errors: string[];
      overridableViolations: string[];
      capacityContext: CapacityContext | null;
      dropoffType: DropoffType | null;
    };

export type BookingValidationResult =
  | {
      ok: true;
      dropoffType: DropoffType;
      capacityContext: CapacityContext;
    }
  | {
      ok: false;
      errors: string[];
      overridableViolations: string[];
      capacityContext: CapacityContext | null;
      dropoffType: DropoffType | null;
    };

const ACTIVE_APPOINTMENT_STATUS = "scheduled";

export async function getBookingOptions(db: D1Database, options: { adminScheduling?: boolean } = {}) {
  const [dropoffTypesResult, itemAreasResult, datesResult] = await db.batch([
    db.prepare(
      `SELECT id, name, capacity_points AS capacityPoints
       FROM dropoff_types
       WHERE active = 1
       ORDER BY capacity_points ASC, name ASC`,
    ),
    db.prepare(
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
    db.prepare(options.adminScheduling
      ? `SELECT day.dropoff_date AS date, day.event_name AS eventName, day.is_open AS dateOpen,
                event.id AS bookingEventId, event.opens_at AS opensAt, event.closes_at AS closesAt, event.timestamp_storage_version AS timeStorageVersion, event.timezone, event.active AS eventActive
           FROM dropoff_days day
           LEFT JOIN booking_event_dropoff_dates link ON link.dropoff_day_id = day.id
           LEFT JOIN booking_events event ON event.id = link.booking_event_id
           WHERE day.dropoff_date >= date('now') ORDER BY day.dropoff_date ASC`
      : `SELECT dropoff_date AS date, event_name AS eventName
           FROM dropoff_days WHERE visibility = 'public' AND dropoff_date >= date('now') ORDER BY dropoff_date ASC`,
    ),
  ]);

  const availableDates = datesResult.results as Array<AvailableDropoffDate & { dateOpen?: number; bookingEventId?: number | null; opensAt?: string | null; closesAt?: string | null; timeStorageVersion?: number | null; timezone?: string | null; eventActive?: number | null }>;
  const eligibleDates = options.adminScheduling ? availableDates.map(adminDate => ({ date: adminDate.date, eventName: adminDate.eventName, adminStatus: getAdminDateStatus(adminDate) })) : (await Promise.all(availableDates.map(async (date) => (await getBookableBookingEventForDate(db, date.date)).eligible ? date : null))).filter((date): date is AvailableDropoffDate => date !== null);
  return {
    dropoffTypes: dropoffTypesResult.results as DropoffType[],
    itemAreas: itemAreasResult.results as ItemArea[],
    availableDates: eligibleDates,
  };
}

export async function createBooking(db: D1Database, input: BookingInput, options: { allowAdminScheduling?: boolean } = {}): Promise<BookingResult> {
  const validation = await validateBooking(db, input, options);
  if (!validation.ok) return validation;

  const appointmentId = input.appointmentId;
  if (appointmentId) {
    await db.batch(
      getBookingUpdateStatements(db, { ...input, appointmentId }, validation.dropoffType),
    );
    return {
      ok: true,
      appointmentId,
      message: "Your appointment has been updated.",
    };
  }

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
      validation.dropoffType.id,
      input.description || null,
      ACTIVE_APPOINTMENT_STATUS,
    )
    .first<{ id: number }>();

  if (!appointment) {
    return {
      ok: false,
      errors: ["The booking could not be created. Please try again."],
      overridableViolations: [],
      capacityContext: null,
      dropoffType: null,
    };
  }

  await db.batch(
    input.allocations.map((allocation) =>
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
          calculateAllocatedPoints(validation.dropoffType.capacityPoints, allocation.percentage),
        ),
    ),
  );

  return {
    ok: true,
    appointmentId: appointment.id,
    message: "Your drop-off request has been scheduled.",
  };
}

// Used only by the manager/admin override workflow after it has revalidated
// the request and established that every failure is explicitly overridable.
export async function createBookingWithOverride(
  db: D1Database,
  input: BookingInput,
  dropoffType: DropoffType,
) {
  const appointment = await db.prepare(
    `INSERT INTO appointments (user_id, appointment_date, dropoff_type_id, description, status)
     VALUES (?, ?, ?, ?, ?) RETURNING id`,
  ).bind(input.userId, input.appointmentDate, dropoffType.id, input.description || null, ACTIVE_APPOINTMENT_STATUS).first<{ id: number }>();
  if (!appointment) throw new Error("The overridden booking could not be created.");
  await db.batch(input.allocations.map((allocation) => db.prepare(
    `INSERT INTO appointment_area_allocations (appointment_id, item_area_id, allocation_percent, capacity_points)
     VALUES (?, ?, ?, ?)`,
  ).bind(appointment.id, allocation.itemAreaId, allocation.percentage, calculateAllocatedPoints(dropoffType.capacityPoints, allocation.percentage))));
  return appointment.id;
}

export async function validateBooking(
  db: D1Database,
  input: BookingInput,
  validationOptions: { allowAdminScheduling?: boolean } = {},
): Promise<BookingValidationResult> {
  const inputErrors = validateInput(input);
  if (inputErrors.length > 0) return validationFailure(inputErrors);

  if (!validationOptions.allowAdminScheduling) {
    const bookingEvent = await getBookableBookingEventForDate(db, input.appointmentDate);
    if (!bookingEvent.eligible) return validationFailure(["This drop-off date is not currently available for signup."]);
  }

  if (await isBlockedByDropoffBan(db, input)) {
    return validationFailure(["You are currently unable to schedule a drop-off."]);
  }

  const [options, settings] = await Promise.all([getBookingOptions(db), getSettings(db)]);
  const dropoffType = options.dropoffTypes.find((type) => type.id === input.dropoffTypeId);
  if (!dropoffType) return validationFailure(["Choose an available load type."]);

  const allocationErrors = validateAllocations(input.allocations, options.itemAreas);
  if (allocationErrors.length > 0) return validationFailure(allocationErrors);

  const effectiveCapacity = await getEffectiveDateCapacity(
    db,
    input.appointmentDate,
    settings.defaultDailyIntakeCapacity,
    options.itemAreas,
  );
  if (!effectiveCapacity) {
    return validationFailure([
      "This drop-off date has not been configured by an administrator.",
    ]);
  }

  const monthBounds = getMonthBounds(input.appointmentDate);
  const monthlyBookings = await db
    .prepare(
      `SELECT COUNT(*) AS count
       FROM appointments
       WHERE user_id = ?
         AND appointment_date >= ?
         AND appointment_date < ?
         AND status = ?
         AND id != ?`,
    )
    .bind(
      input.userId,
      monthBounds.start,
      monthBounds.end,
      ACTIVE_APPOINTMENT_STATUS,
      input.appointmentId ?? 0,
    )
    .first<{ count: number }>();
  const monthlyCount = monthlyBookings?.count ?? 0;
  const monthlyViolation =
    monthlyCount >= settings.monthlyBookingLimit
      ? `This consignor has reached the monthly booking limit of ${settings.monthlyBookingLimit}.`
      : null;

  const capacity = await getCapacityEvaluation(
    db,
    input.appointmentDate,
    dropoffType,
    options.itemAreas,
    input.allocations,
    effectiveCapacity,
    input.appointmentId,
    validationOptions.allowAdminScheduling === true,
  );
  const capacityContext: CapacityContext = {
    monthly: {
      appointmentDate: input.appointmentDate,
      bookingCount: monthlyCount,
      bookingLimit: settings.monthlyBookingLimit,
      monthStart: monthBounds.start,
      monthEnd: monthBounds.end,
    },
    day: capacity.context.day,
    areas: capacity.context.areas,
  };
  const errors = [...(monthlyViolation ? [monthlyViolation] : []), ...capacity.errors];
  const overridableViolations = [
    ...(monthlyViolation ? [monthlyViolation] : []),
    ...capacity.overridableViolations,
  ];

  if (errors.length > 0) {
    return { ok: false, errors, overridableViolations, capacityContext, dropoffType };
  }

  return { ok: true, dropoffType, capacityContext };
}

function getAdminDateStatus(date: AvailableDropoffDate & { dateOpen?: number; bookingEventId?: number | null; opensAt?: string | null; closesAt?: string | null; timeStorageVersion?: number | null; timezone?: string | null; eventActive?: number | null }) {
  const labels = [date.bookingEventId ? "Public" : "Private"];
  if (!date.bookingEventId) { if (date.dateOpen !== 1) labels.push("Event closed"); return labels; }
  const opensAt = date.opensAt ? bookingEventInstant(date.opensAt, date.timezone ?? undefined, date.timeStorageVersion) : null;
  const closesAt = date.closesAt ? bookingEventInstant(date.closesAt, date.timezone ?? undefined, date.timeStorageVersion) : null;
  if (date.eventActive !== 1) labels.push("Public signup inactive");
  else if (opensAt && Date.now() < opensAt.getTime()) labels.push("Upcoming signup");
  else if (closesAt && Date.now() >= closesAt.getTime()) labels.push("Public signup closed");
  else labels.push("Public signup open");
  if (date.dateOpen !== 1) labels.push("Event closed");
  return labels;
}

export function getBookingUpdateStatements(
  db: D1Database,
  input: BookingInput & { appointmentId: number },
  dropoffType: DropoffType,
): D1PreparedStatement[] {
  return [
    db
      .prepare("DELETE FROM appointment_area_allocations WHERE appointment_id = ?")
      .bind(input.appointmentId),
    db
      .prepare(
        `UPDATE appointments
         SET appointment_date = ?,
             dropoff_type_id = ?,
             description = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND status = 'scheduled'`,
      )
      .bind(
        input.appointmentDate,
        dropoffType.id,
        input.description || null,
        input.appointmentId,
        input.userId,
      ),
    ...input.allocations.map((allocation) =>
      db
        .prepare(
          `INSERT INTO appointment_area_allocations
            (appointment_id, item_area_id, allocation_percent, capacity_points)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(
          input.appointmentId,
          allocation.itemAreaId,
          allocation.percentage,
          calculateAllocatedPoints(dropoffType.capacityPoints, allocation.percentage),
        ),
    ),
  ];
}

function validationFailure(errors: string[]): BookingValidationResult {
  return {
    ok: false,
    errors,
    overridableViolations: [],
    capacityContext: null,
    dropoffType: null,
  };
}

/**
 * A ban prevents a customer from creating a future booking.  They may still
 * save an existing appointment without moving it to a different date, so that
 * a ban does not lock them out of viewing or making non-scheduling changes to
 * their already-booked appointment.
 */
async function isBlockedByDropoffBan(db: D1Database, input: BookingInput) {
  const user = await db.prepare(
    "SELECT dropoff_banned AS dropoffBanned FROM users WHERE id = ?",
  ).bind(input.userId).first<{ dropoffBanned: number }>();
  if (user?.dropoffBanned !== 1) return false;

  if (!input.appointmentId) return true;

  const appointment = await db.prepare(
    "SELECT appointment_date AS appointmentDate FROM appointments WHERE id = ? AND user_id = ?",
  ).bind(input.appointmentId, input.userId).first<{ appointmentDate: string }>();
  return !appointment || appointment.appointmentDate !== input.appointmentDate;
}

function validateInput(input: BookingInput) {
  const errors: string[] = [];
  if (!isIsoDate(input.appointmentDate)) errors.push("Choose a valid drop-off date.");
  if (!Number.isInteger(input.dropoffTypeId) || input.dropoffTypeId < 1) {
    errors.push("Choose a load type.");
  }
  return errors;
}

function validateAllocations(allocations: BookingInput["allocations"], itemAreas: ItemArea[]) {
  const errors: string[] = [];
  const submittedIds = new Set(allocations.map((allocation) => allocation.itemAreaId));
  const activeIds = new Set(itemAreas.map((area) => area.id));

  if (submittedIds.size !== allocations.length || submittedIds.size !== activeIds.size) {
    errors.push("Provide one allocation for every active item area.");
  }
  if ([...submittedIds].some((id) => !activeIds.has(id))) {
    errors.push("An unavailable item area was submitted.");
  }
  if (
    allocations.some(
      ({ percentage }) => !Number.isInteger(percentage) || percentage < 0 || percentage > 100,
    )
  ) {
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

async function getCapacityEvaluation(
  db: D1Database,
  appointmentDate: string,
  dropoffType: DropoffType,
  itemAreas: ItemArea[],
  allocations: BookingInput["allocations"],
  effectiveCapacity: EffectiveDateCapacity,
  excludedAppointmentId?: number,
  allowClosedDate = false,
) {
  if (!effectiveCapacity.isOpen && !allowClosedDate) {
    return {
      errors: ["This drop-off date is not open for bookings."],
      overridableViolations: [],
      context: {
        day: {
          date: appointmentDate,
          isOpen: false,
          capacityPoints: effectiveCapacity.dailyCapacityPoints,
          usedPoints: 0,
          requestedPoints: dropoffType.capacityPoints,
        },
        areas: effectiveCapacity.areas.map((area) => ({
          id: area.id,
          name: area.name,
          usedPoints: 0,
          requestedPoints: 0,
          allowedPoints: area.capacityPoints + area.overflowAllowancePoints,
        })),
      },
    };
  }

  const [dailyUsage, areaUsageResult] = await Promise.all([
    db
      .prepare(
        `SELECT COALESCE(SUM(dt.capacity_points), 0) AS usedPoints
         FROM appointments appointment
         JOIN dropoff_types dt ON dt.id = appointment.dropoff_type_id
         WHERE appointment.appointment_date = ?
           AND appointment.status = ?
           AND appointment.id != ?`,
      )
      .bind(appointmentDate, ACTIVE_APPOINTMENT_STATUS, excludedAppointmentId ?? 0)
      .first<{ usedPoints: number }>(),
    db
      .prepare(
        `SELECT allocation.item_area_id AS itemAreaId,
                COALESCE(SUM(allocation.capacity_points), 0) AS usedPoints
         FROM appointment_area_allocations allocation
         JOIN appointments appointment ON appointment.id = allocation.appointment_id
         WHERE appointment.appointment_date = ?
           AND appointment.status = ?
           AND appointment.id != ?
         GROUP BY allocation.item_area_id`,
      )
      .bind(appointmentDate, ACTIVE_APPOINTMENT_STATUS, excludedAppointmentId ?? 0)
      .all<{ itemAreaId: number; usedPoints: number }>(),
  ]);
  const dailyUsedPoints = dailyUsage?.usedPoints ?? 0;
  const dailyRequestedPoints = dropoffType.capacityPoints;
  const errors: string[] = [];
  const overridableViolations: string[] = [];
  if (dailyUsedPoints + dailyRequestedPoints > effectiveCapacity.dailyCapacityPoints) {
    const violation = "This drop-off date has reached its daily intake capacity.";
    errors.push(violation);
    overridableViolations.push(violation);
  }

  const usedByArea = new Map(
    areaUsageResult.results.map((usage) => [usage.itemAreaId, usage.usedPoints]),
  );
  const areas = itemAreas.map((area) => {
    const effectiveArea = effectiveCapacity.areas.find((candidate) => candidate.id === area.id)!;
    const percentage = allocations.find((allocation) => allocation.itemAreaId === area.id)!.percentage;
    const requestedPoints = calculateAllocatedPoints(dropoffType.capacityPoints, percentage);
    const usedPoints = usedByArea.get(area.id) ?? 0;
    const allowedPoints = effectiveArea.capacityPoints + effectiveArea.overflowAllowancePoints;
    if (usedPoints + requestedPoints > allowedPoints) {
      const violation = `${area.name} has reached its capacity, including the allowed overflow.`;
      errors.push(violation);
      overridableViolations.push(violation);
    }
    return { id: area.id, name: area.name, usedPoints, requestedPoints, allowedPoints };
  });

  return {
    errors,
    overridableViolations,
    context: {
      day: {
        date: appointmentDate,
        isOpen: true,
        capacityPoints: effectiveCapacity.dailyCapacityPoints,
        usedPoints: dailyUsedPoints,
        requestedPoints: dailyRequestedPoints,
      },
      areas,
    },
  };
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
