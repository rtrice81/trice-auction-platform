import { type BookingInput, type CapacityContext, validateBooking } from "./booking.server";
import { ensureUserRole } from "./user-roles.server";
import { DEFAULT_BOOKING_HOLD_DURATION_MINUTES, getBookingHoldDuration } from "./booking-hold-duration.server";

/** One authoritative place for the public reservation window. */
export const BOOKING_HOLD_MINUTES = DEFAULT_BOOKING_HOLD_DURATION_MINUTES;

export type BookingHold = { id: string; bookingAttemptId: string; holdToken: string; expiresAt: string; appointmentDate: string; dropoffTypeId: number; allocations: BookingInput["allocations"]; status: string };

type HoldRow = { id: string; bookingAttemptId: string; holdToken: string; expiresAt: string; appointmentDate: string; dropoffTypeId: number; allocationsJson: string; status: string };

export async function reserveBookingHold(db: D1Database, input: BookingInput, bookingAttemptId: string, userId: number | null) {
  const existing = await getBookingHold(db, bookingAttemptId);
  if (existing?.status === "active" && isUnexpired(existing)) {
    if (sameRequest(existing, input)) return { ok: true as const, hold: existing, resumed: true };
  }

  // This is the same validation and capacity service used by every other
  // booking path. The write below is an additional atomic guard, not a second
  // set of business rules.
  const validation = await validateBooking(db, { ...input, userId: userId ?? 0 }, { excludedHoldId: existing?.id });
  if (!validation.ok || validation.appointmentStatus !== "scheduled") {
    return { ok: false as const, errors: validation.ok ? ["This availability was just reserved by another customer. Please adjust your load or select another Drop-Off Date."] : validation.errors };
  }
  const day = await db.prepare("SELECT id FROM dropoff_days WHERE dropoff_date = ?").bind(input.appointmentDate).first<{ id: number }>();
  if (!day) return { ok: false as const, errors: ["This drop-off date is no longer available."] };
  const holdDurationMinutes = await getBookingHoldDuration(db, day.id);
  const requested = new Map(validation.capacityContext.areas.map((area) => [area.name, area.requestedPoints]));
  const values = {
    daily: validation.dropoffType.capacityPoints,
    smalls: requested.get("Smalls") ?? 0,
    large: requested.get("Large/Furniture") ?? 0,
    outdoor: requested.get("Outdoor") ?? 0,
  };
  const id = existing?.id ?? opaqueToken();
  const token = existing?.holdToken ?? opaqueToken();
  const capacity = validation.capacityContext;
  const condition = atomicCapacityCondition(id, day.id, values, capacity);
  const allocationJson = JSON.stringify(input.allocations);
  // Calculated once at claim time; later configuration changes do not affect it.
  const expires = `datetime('now', '+${holdDurationMinutes} minutes')`;

  if (existing) {
    const updated = await db.prepare(
      `UPDATE booking_holds SET dropoff_day_id=?, user_id=COALESCE(?, user_id), load_type_id=?, allocations_json=?, reserved_daily_intake_points=?, reserved_smalls_points=?, reserved_large_furniture_points=?, reserved_outdoor_points=?, status='active', expires_at=${expires}
       WHERE id=? AND status != 'converted' AND ${condition}`,
    ).bind(day.id, userId, input.dropoffTypeId, allocationJson, values.daily, values.smalls, values.large, values.outdoor, id, ...conditionBindings(id, day.id, values, capacity)).run();
    if (updated.meta.changes === 1) return { ok: true as const, hold: (await getBookingHold(db, bookingAttemptId))!, resumed: false };
  }

  // INSERT ... SELECT is a single SQLite write statement. D1 serializes that
  // statement with competing writers, so a final slot can pass this predicate
  // only once; there is no read-then-insert race.
  await db.prepare(
    `INSERT OR IGNORE INTO booking_holds (id, booking_attempt_id, hold_token, dropoff_day_id, user_id, load_type_id, allocations_json, reserved_daily_intake_points, reserved_smalls_points, reserved_large_furniture_points, reserved_outdoor_points, expires_at)
     SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${expires}
     WHERE ${atomicCapacityCondition("", day.id, values, capacity)}`,
  ).bind(id, bookingAttemptId, token, day.id, userId, input.dropoffTypeId, allocationJson, values.daily, values.smalls, values.large, values.outdoor, ...conditionBindings("", day.id, values, capacity)).run();
  const hold = await getBookingHold(db, bookingAttemptId);
  if (hold?.status === "active" && isUnexpired(hold) && sameRequest(hold, input)) return { ok: true as const, hold, resumed: false };
  return { ok: false as const, errors: ["That availability was just reserved by another customer. Please adjust your load or select another Drop-Off Date."] };
}

export async function convertBookingHold(db: D1Database, input: BookingInput, bookingAttemptId: string, userId: number) {
  const hold = await getBookingHold(db, bookingAttemptId);
  if (!hold || hold.status !== "active" || !isUnexpired(hold) || !sameRequest(hold, input)) return { ok: false as const, errors: ["Your reservation has expired. Check Availability Again."], appointmentId: null };
  // batch is D1's transaction primitive. The appointment is linked to the hold
  // and the unique link makes a duplicate final POST idempotent.
  await db.batch([
    db.prepare("UPDATE booking_holds SET user_id=COALESCE(user_id, ?) WHERE id=? AND booking_attempt_id=? AND hold_token=? AND status='active' AND expires_at > CURRENT_TIMESTAMP").bind(userId, hold.id, bookingAttemptId, hold.holdToken),
    db.prepare(`INSERT OR IGNORE INTO appointments (user_id, appointment_date, dropoff_type_id, description, status, booking_hold_id)
      SELECT ?, day.dropoff_date, hold.load_type_id, ?, 'scheduled', hold.id
      FROM booking_holds hold JOIN dropoff_days day ON day.id=hold.dropoff_day_id
      WHERE hold.id=? AND hold.booking_attempt_id=? AND hold.hold_token=? AND hold.status='active' AND hold.expires_at > CURRENT_TIMESTAMP`).bind(userId, input.description || null, hold.id, bookingAttemptId, hold.holdToken),
    db.prepare(`INSERT OR IGNORE INTO appointment_area_allocations (appointment_id, item_area_id, allocation_percent, capacity_points)
      SELECT appointment.id, area.id,
        CAST(json_extract(allocation.value, '$.percentage') AS INTEGER),
        CASE area.name WHEN 'Smalls' THEN hold.reserved_smalls_points WHEN 'Large/Furniture' THEN hold.reserved_large_furniture_points WHEN 'Outdoor' THEN hold.reserved_outdoor_points ELSE 0 END
      FROM appointments appointment JOIN booking_holds hold ON hold.id=appointment.booking_hold_id JOIN json_each(hold.allocations_json) allocation JOIN item_areas area ON area.id=CAST(json_extract(allocation.value, '$.itemAreaId') AS INTEGER) AND area.active=1
      WHERE appointment.booking_hold_id=?`).bind(hold.id),
    db.prepare("UPDATE booking_holds SET status='converted', converted_at=CURRENT_TIMESTAMP, user_id=? WHERE id=? AND status='active' AND expires_at > CURRENT_TIMESTAMP").bind(userId, hold.id),
  ]);
  const appointment = await db.prepare("SELECT id FROM appointments WHERE booking_hold_id=? AND user_id=?").bind(hold.id, userId).first<{ id: number }>();
  if (!appointment) return { ok: false as const, errors: ["Your reservation has expired. Check Availability Again."], appointmentId: null };
  await ensureUserRole(db, userId, "consignor");
  return { ok: true as const, appointmentId: appointment.id };
}

export async function associateBookingHoldUser(db: D1Database, bookingAttemptId: string | null, userId: number) {
  if (bookingAttemptId) await db.prepare("UPDATE booking_holds SET user_id=? WHERE booking_attempt_id=? AND status='active' AND expires_at>CURRENT_TIMESTAMP AND user_id IS NULL").bind(userId, bookingAttemptId).run();
}

export async function getBookingHold(db: D1Database, bookingAttemptId: string | null): Promise<BookingHold | null> {
  if (!bookingAttemptId) return null;
  const row = await db.prepare(`SELECT hold.id, hold.booking_attempt_id AS bookingAttemptId, hold.hold_token AS holdToken, hold.expires_at AS expiresAt, day.dropoff_date AS appointmentDate, hold.load_type_id AS dropoffTypeId, hold.allocations_json AS allocationsJson, hold.status FROM booking_holds hold JOIN dropoff_days day ON day.id=hold.dropoff_day_id WHERE hold.booking_attempt_id=?`).bind(bookingAttemptId).first<HoldRow>();
  if (!row) return null;
  return { ...row, allocations: JSON.parse(row.allocationsJson) as BookingInput["allocations"] };
}

function atomicCapacityCondition(excludedId: string, dayId: number, values: { daily: number; smalls: number; large: number; outdoor: number }, context: CapacityContext) {
  const areaLimit = (name: string) => context.areas.find((area) => area.name === name)?.allowedPoints ?? 0;
  const usage = (column: "reserved_smalls_points" | "reserved_large_furniture_points" | "reserved_outdoor_points", name: string) =>
    `(COALESCE((SELECT SUM(allocation.capacity_points) FROM appointment_area_allocations allocation JOIN appointments appointment ON appointment.id=allocation.appointment_id WHERE appointment.appointment_date=(SELECT dropoff_date FROM dropoff_days WHERE id=?) AND appointment.status IN ('scheduled','checked_in','completed') AND allocation.item_area_id=(SELECT id FROM item_areas WHERE name=?)),0) + COALESCE((SELECT SUM(${column}) FROM booking_holds WHERE dropoff_day_id=? AND status='active' AND expires_at>CURRENT_TIMESTAMP AND appointment_status='scheduled' AND id != ?),0) + ? <= ?)`;
  return `(
    COALESCE((SELECT SUM(type.capacity_points) FROM appointments appointment JOIN dropoff_types type ON type.id=appointment.dropoff_type_id WHERE appointment.appointment_date=(SELECT dropoff_date FROM dropoff_days WHERE id=?) AND appointment.status IN ('scheduled','checked_in','completed')),0)
    + COALESCE((SELECT SUM(reserved_daily_intake_points) FROM booking_holds WHERE dropoff_day_id=? AND status='active' AND expires_at>CURRENT_TIMESTAMP AND appointment_status='scheduled' AND id != ?),0) + ? <= ?
  ) AND ${usage("reserved_smalls_points", "Smalls")} AND ${usage("reserved_large_furniture_points", "Large/Furniture")} AND ${usage("reserved_outdoor_points", "Outdoor")}`;
}

function conditionBindings(excludedId: string, dayId: number, values: { daily: number; smalls: number; large: number; outdoor: number }, context: CapacityContext) {
  const limit = (name: string) => context.areas.find((area) => area.name === name)?.allowedPoints ?? 0;
  return [dayId, dayId, excludedId, values.daily, context.day?.capacityPoints ?? 0,
    dayId, "Smalls", dayId, excludedId, values.smalls, limit("Smalls"),
    dayId, "Large/Furniture", dayId, excludedId, values.large, limit("Large/Furniture"),
    dayId, "Outdoor", dayId, excludedId, values.outdoor, limit("Outdoor")];
}

function sameRequest(hold: BookingHold, input: BookingInput) { return hold.appointmentDate === input.appointmentDate && hold.dropoffTypeId === input.dropoffTypeId && JSON.stringify(hold.allocations) === JSON.stringify(input.allocations); }
function isUnexpired(hold: BookingHold) { return Date.parse(`${hold.expiresAt.replace(" ", "T")}Z`) > Date.now(); }
function opaqueToken() { const bytes = new Uint8Array(32); crypto.getRandomValues(bytes); return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""); }
