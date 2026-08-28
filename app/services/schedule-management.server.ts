import { getEffectiveDateCapacity, type CapacityAreaDefaults } from "./date-capacity.server";

export type ScheduleResult =
  | { ok: true; message: string; eventId?: number }
  | { ok: false; errors: string[] };

export type EventAreaInput = {
  itemAreaId: number;
  capacityPoints: number;
  overflowAllowancePoints: number;
};

export type DropoffEventInput = {
  date: string;
  eventName: string;
  isOpen: boolean;
  dailyCapacityPoints: number;
  note: string;
  areas: EventAreaInput[];
};

export type EventArea = EventAreaInput & {
  name: string;
  usedPoints: number;
  remainingPoints: number;
  overflowUsagePoints: number;
};

export type ScheduledAppointment = {
  id: number;
  time: string | null;
  customer: string;
  loadType: string;
  capacityPoints: number;
  status: string;
};

export type DropoffEvent = {
  id: number;
  date: string;
  eventName: string | null;
  isOpen: boolean;
  note: string | null;
  dailyCapacityPoints: number;
  scheduledAppointments: number;
  usedPoints: number;
  remainingPoints: number;
  areas: EventArea[];
  appointments: ScheduledAppointment[];
};

export function dropoffEventInputFromForm(form: FormData): DropoffEventInput {
  const areaIds = Array.from(form.keys())
    .filter((key) => key.startsWith("area-") && key.endsWith("-capacity"))
    .map((key) => Number(key.slice("area-".length, -"-capacity".length)));
  return {
    date: String(form.get("date") ?? ""),
    eventName: String(form.get("eventName") ?? ""),
    isOpen: form.get("isOpen") === "true",
    dailyCapacityPoints: Number(form.get("dailyCapacityPoints")),
    note: String(form.get("note") ?? ""),
    areas: areaIds.map((itemAreaId) => ({
      itemAreaId,
      capacityPoints: Number(form.get(`area-${itemAreaId}-capacity`)),
      overflowAllowancePoints: Number(form.get(`area-${itemAreaId}-overflow`)),
    })),
  };
}

export async function getEventFormDefaults(db: D1Database) {
  const [dailyCapacityPoints, areas] = await Promise.all([
    getDefaultDailyCapacity(db),
    getAreaDefaults(db),
  ]);
  return {
    dailyCapacityPoints,
    areas: areas.map((area) => ({
      itemAreaId: area.id,
      name: area.name,
      capacityPoints: area.normalCapacityPoints,
      overflowAllowancePoints: area.overflowAllowancePoints,
    })),
  };
}

export async function getDropoffEvents(db: D1Database): Promise<DropoffEvent[]> {
  const [defaults, areaDefaults, eventRows] = await Promise.all([
    getDefaultDailyCapacity(db),
    getAreaDefaults(db),
    db
      .prepare("SELECT id FROM dropoff_days ORDER BY dropoff_date ASC")
      .all<{ id: number }>(),
  ]);
  return Promise.all(eventRows.results.map((event) => getDropoffEvent(db, event.id, defaults, areaDefaults)));
}

export async function getDropoffEventById(db: D1Database, eventId: number) {
  const [defaults, areaDefaults] = await Promise.all([getDefaultDailyCapacity(db), getAreaDefaults(db)]);
  return getDropoffEvent(db, eventId, defaults, areaDefaults);
}

export async function createDropoffEvent(db: D1Database, input: DropoffEventInput): Promise<ScheduleResult> {
  const validation = await validateEventInput(db, input, true);
  if (validation.length > 0) return { ok: false, errors: validation };

  const existing = await db
    .prepare("SELECT id FROM dropoff_days WHERE dropoff_date = ?")
    .bind(input.date)
    .first<{ id: number }>();
  if (existing) return { ok: false, errors: ["A Drop-Off Event already exists for this date."] };

  const event = await db
    .prepare(
      `INSERT INTO dropoff_days (
        dropoff_date, event_name, capacity_points, daily_capacity_override, is_open, notes
      ) VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id`,
    )
    .bind(
      input.date,
      input.eventName.trim() || null,
      input.dailyCapacityPoints,
      input.dailyCapacityPoints,
      input.isOpen ? 1 : 0,
      input.note.trim() || null,
    )
    .first<{ id: number }>();
  if (!event) return { ok: false, errors: ["The Drop-Off Event could not be saved."] };

  await db.batch(
    input.areas.map((area) =>
      db
        .prepare(
          `INSERT INTO dropoff_day_area_overrides (
            dropoff_day_id, item_area_id, capacity_points_override, overflow_allowance_points_override
          ) VALUES (?, ?, ?, ?)`,
        )
        .bind(event.id, area.itemAreaId, area.capacityPoints, area.overflowAllowancePoints),
    ),
  );
  return {
    ok: true,
    eventId: event.id,
    message: input.isOpen ? "Drop-Off Event saved and open for bookings." : "Drop-Off Event saved as closed.",
  };
}

export async function updateDropoffEvent(
  db: D1Database,
  eventId: number,
  input: DropoffEventInput,
): Promise<ScheduleResult> {
  const validation = await validateEventInput(db, input, false);
  if (validation.length > 0) return { ok: false, errors: validation };

  const event = await db.prepare("SELECT id FROM dropoff_days WHERE id = ?").bind(eventId).first<{ id: number }>();
  if (!event) return { ok: false, errors: ["This Drop-Off Event no longer exists."] };

  await db.batch([
    db
      .prepare(
        `UPDATE dropoff_days
         SET event_name = ?, capacity_points = ?, daily_capacity_override = ?, is_open = ?, notes = ?
         WHERE id = ?`,
      )
      .bind(
        input.eventName.trim() || null,
        input.dailyCapacityPoints,
        input.dailyCapacityPoints,
        input.isOpen ? 1 : 0,
        input.note.trim() || null,
        eventId,
      ),
    ...input.areas.map((area) =>
      db
        .prepare(
          `INSERT INTO dropoff_day_area_overrides (
            dropoff_day_id, item_area_id, capacity_points_override, overflow_allowance_points_override
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(dropoff_day_id, item_area_id) DO UPDATE SET
            capacity_points_override = excluded.capacity_points_override,
            overflow_allowance_points_override = excluded.overflow_allowance_points_override`,
        )
        .bind(eventId, area.itemAreaId, area.capacityPoints, area.overflowAllowancePoints),
    ),
  ]);
  return { ok: true, eventId, message: "Drop-Off Event updated." };
}

export async function setDropoffEventOpen(
  db: D1Database,
  eventId: number,
  isOpen: boolean,
): Promise<ScheduleResult> {
  const event = await db.prepare("SELECT id FROM dropoff_days WHERE id = ?").bind(eventId).first<{ id: number }>();
  if (!event) return { ok: false, errors: ["This Drop-Off Event no longer exists."] };
  await db.prepare("UPDATE dropoff_days SET is_open = ? WHERE id = ?").bind(isOpen ? 1 : 0, eventId).run();
  return { ok: true, eventId, message: isOpen ? "Drop-Off Event opened for bookings." : "Drop-Off Event closed for bookings." };
}

export async function deleteDropoffEvent(db: D1Database, eventId: number): Promise<ScheduleResult> {
  const [event, appointmentCount] = await Promise.all([
    db.prepare("SELECT id FROM dropoff_days WHERE id = ?").bind(eventId).first<{ id: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM appointments WHERE appointment_date = (SELECT dropoff_date FROM dropoff_days WHERE id = ?)").bind(eventId).first<{ count: number }>(),
  ]);
  if (!event) return { ok: false, errors: ["This Drop-Off Event no longer exists."] };
  if ((appointmentCount?.count ?? 0) > 0) return { ok: false, errors: ["This event has appointments. Close it instead of deleting it."] };
  await db.batch([
    db.prepare("DELETE FROM dropoff_day_area_overrides WHERE dropoff_day_id = ?").bind(eventId),
    db.prepare("DELETE FROM dropoff_days WHERE id = ?").bind(eventId),
  ]);
  return { ok: true, message: "Drop-Off Event deleted." };
}

async function getDropoffEvent(
  db: D1Database,
  eventId: number,
  defaultDailyCapacity: number,
  areaDefaults: CapacityAreaDefaults[],
): Promise<DropoffEvent> {
  const event = await db
    .prepare(
      `SELECT id, dropoff_date AS date, event_name AS eventName, is_open AS isOpen, notes
       FROM dropoff_days WHERE id = ?`,
    )
    .bind(eventId)
    .first<{ id: number; date: string; eventName: string | null; isOpen: number; notes: string | null }>();
  if (!event) throw new Response("Not Found", { status: 404 });

  const [effective, summary, usage, appointments] = await Promise.all([
    getEffectiveDateCapacity(db, event.date, defaultDailyCapacity, areaDefaults),
    db.prepare(
      `SELECT COUNT(*) AS scheduledAppointments, COALESCE(SUM(dt.capacity_points), 0) AS usedPoints
       FROM appointments appointment
       JOIN dropoff_types dt ON dt.id = appointment.dropoff_type_id
       WHERE appointment.appointment_date = ? AND appointment.status = 'scheduled'`,
    ).bind(event.date).first<{ scheduledAppointments: number; usedPoints: number }>(),
    db.prepare(
      `SELECT allocation.item_area_id AS itemAreaId, COALESCE(SUM(allocation.capacity_points), 0) AS usedPoints
       FROM appointment_area_allocations allocation
       JOIN appointments appointment ON appointment.id = allocation.appointment_id
       WHERE appointment.appointment_date = ? AND appointment.status = 'scheduled'
       GROUP BY allocation.item_area_id`,
    ).bind(event.date).all<{ itemAreaId: number; usedPoints: number }>(),
    getAppointmentsForDate(db, event.date),
  ]);
  if (!effective) throw new Response("Not Found", { status: 404 });

  const usedByArea = new Map(usage.results.map((row) => [row.itemAreaId, row.usedPoints]));
  const usedPoints = summary?.usedPoints ?? 0;
  return {
    id: event.id,
    date: event.date,
    eventName: event.eventName,
    isOpen: event.isOpen === 1,
    note: event.notes,
    dailyCapacityPoints: effective.dailyCapacityPoints,
    scheduledAppointments: summary?.scheduledAppointments ?? 0,
    usedPoints,
    remainingPoints: effective.dailyCapacityPoints - usedPoints,
    areas: effective.areas.map((area) => {
      const used = usedByArea.get(area.id) ?? 0;
      return {
        itemAreaId: area.id,
        name: area.name,
        capacityPoints: area.capacityPoints,
        overflowAllowancePoints: area.overflowAllowancePoints,
        usedPoints: used,
        remainingPoints: area.capacityPoints + area.overflowAllowancePoints - used,
        overflowUsagePoints: Math.max(0, used - area.capacityPoints),
      };
    }),
    appointments,
  };
}

async function validateEventInput(db: D1Database, input: DropoffEventInput, isNew: boolean) {
  const errors: string[] = [];
  if (!isIsoDate(input.date)) errors.push("Choose a valid drop-off date.");
  if (isNew && input.date < today()) errors.push("New Drop-Off Events must be today or later.");
  if (!Number.isFinite(input.dailyCapacityPoints) || input.dailyCapacityPoints < 0) errors.push("Daily intake capacity must be non-negative.");
  const areas = await getAreaDefaults(db);
  const validAreaIds = new Set(areas.map((area) => area.id));
  const submittedIds = new Set(input.areas.map((area) => area.itemAreaId));
  if (submittedIds.size !== areas.length || [...submittedIds].some((id) => !validAreaIds.has(id))) {
    errors.push("Provide capacity and overflow values for every active storage area.");
  }
  if (input.areas.some((area) => !Number.isFinite(area.capacityPoints) || area.capacityPoints < 0 || !Number.isFinite(area.overflowAllowancePoints) || area.overflowAllowancePoints < 0)) {
    errors.push("Storage capacities and overflow allowances must be non-negative.");
  }
  return errors;
}

async function getAppointmentsForDate(db: D1Database, date: string): Promise<ScheduledAppointment[]> {
  const { results } = await db.prepare(
    `SELECT appointment.id, appointment.appointment_time AS time,
            COALESCE(NULLIF(TRIM(user.first_name || ' ' || user.last_name), ''), user.email) AS customer,
            type.name AS loadType, type.capacity_points AS capacityPoints, appointment.status
     FROM appointments appointment
     JOIN users user ON user.id = appointment.user_id
     JOIN dropoff_types type ON type.id = appointment.dropoff_type_id
     WHERE appointment.appointment_date = ?
     ORDER BY appointment.appointment_time, appointment.id`,
  ).bind(date).all<ScheduledAppointment>();
  return results;
}

async function getDefaultDailyCapacity(db: D1Database) {
  const setting = await db.prepare("SELECT value FROM settings WHERE key = 'default_daily_intake_capacity'").first<{ value: string }>();
  const value = Number(setting?.value);
  if (!Number.isFinite(value) || value < 0) throw new Error("Default daily intake capacity is not configured correctly.");
  return value;
}

async function getAreaDefaults(db: D1Database): Promise<CapacityAreaDefaults[]> {
  const { results } = await db.prepare(
    `SELECT id, name, normal_capacity_points AS normalCapacityPoints,
            overflow_allowance_points AS overflowAllowancePoints
     FROM item_areas WHERE active = 1 ORDER BY display_order, name`,
  ).all<CapacityAreaDefaults>();
  return results;
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}
