export type BookingEventStatus = "upcoming" | "open" | "closed" | "full" | "inactive";
export type CustomerAvailability = "Available" | "Limited Availability" | "Nearly Full" | "Waitlist" | "Full" | "Signup Not Open Yet" | "Closed";

export type CustomerDropoffDate = { eventId: number; eventDate: string; eventName: string | null; description: string | null; isOpen: boolean; bookable: boolean; availability: CustomerAvailability };
import { bookingEventInstant } from "../lib/booking-event-time";
import { calendarDateInTimezone, customerBookingEventSignupStatus, getEffectivePublicDropoffDateAvailability, isCustomerBookingEventVisible } from "../lib/booking-event-visibility";
export type CustomerBookingEvent = { id: number; name: string; description: string | null; opensAt: string; closesAt: string | null; timezone: string; timeStorageVersion: number; active: boolean; status: BookingEventStatus; dates: CustomerDropoffDate[] };
type BookingEventRow = { bookingEventId: number; name: string; description: string | null; opensAt: string; closesAt: string | null; timezone: string; timeStorageVersion: number; active: number; eventId: number; eventDate: string; eventName: string | null; eventDescription: string | null; eventOpen: number };

export async function getBookableBookingEventForDate(db: D1Database, date: string, now = new Date()) {
  const row = await db.prepare(`SELECT event.id, event.name, event.opens_at AS opensAt, event.closes_at AS closesAt, event.timezone, event.timestamp_storage_version AS timeStorageVersion, event.active, day.is_open AS eventOpen FROM dropoff_days day LEFT JOIN booking_event_dropoff_dates link ON link.dropoff_day_id = day.id LEFT JOIN booking_events event ON event.id = link.booking_event_id WHERE day.dropoff_date = ? AND day.visibility = 'public'`).bind(date).first<{ id: number | null; name: string | null; opensAt: string | null; closesAt: string | null; timezone: string | null; timeStorageVersion: number | null; active: number | null; eventOpen: number | null }>();
  if (!row?.id || !row.opensAt) return { eligible: false, status: "inactive" as const, bookingEvent: row };
  const availability = getPublicDropoffDateAvailability(row, now);
  return { eligible: availability.bookable, status: availability.bookingEventStatus, bookingEvent: row };
}

export async function getCustomerBookingEvents(db: D1Database, now = new Date()): Promise<CustomerBookingEvent[]> {
  const { results } = await db.prepare(`SELECT event.id AS bookingEventId, event.name, event.description, event.opens_at AS opensAt, event.closes_at AS closesAt, event.timezone, event.timestamp_storage_version AS timeStorageVersion, event.active, day.id AS eventId, day.dropoff_date AS eventDate, day.event_name AS eventName, day.description AS eventDescription, day.is_open AS eventOpen FROM booking_events event JOIN booking_event_dropoff_dates link ON link.booking_event_id = event.id JOIN dropoff_days day ON day.id = link.dropoff_day_id WHERE event.active = 1 AND day.visibility = 'public' ORDER BY event.opens_at ASC, day.dropoff_date ASC`).all<BookingEventRow>();
  const visibleRows = results.filter((row) => {
    const opensAt = bookingEventInstant(row.opensAt, row.timezone, row.timeStorageVersion);
    const closesAt = row.closesAt ? bookingEventInstant(row.closesAt, row.timezone, row.timeStorageVersion) : null;
    return Boolean(opensAt && (!row.closesAt || closesAt) && isCustomerBookingEventVisible({ opensAt, closesAt }, now));
  });
  return groupCustomerBookingEventRows(db, visibleRows, now);
}

export async function getCustomerDropoffDateById(db: D1Database, eventId: number, now = new Date()) {
  const row = await db.prepare(`SELECT event.id AS bookingEventId, event.name, event.description, event.opens_at AS opensAt, event.closes_at AS closesAt, event.timezone, event.timestamp_storage_version AS timeStorageVersion, event.active, day.id AS eventId, day.dropoff_date AS eventDate, day.event_name AS eventName, day.description AS eventDescription, day.is_open AS eventOpen FROM booking_events event JOIN booking_event_dropoff_dates link ON link.booking_event_id = event.id JOIN dropoff_days day ON day.id = link.dropoff_day_id WHERE event.active = 1 AND day.visibility = 'public' AND day.id = ? AND day.dropoff_date >= ?`).bind(eventId, today(now)).first<BookingEventRow>();
  if (!row) return null;
  const [bookingEvent] = await groupCustomerBookingEventRows(db, [row], now);
  return bookingEvent ? { bookingEvent, date: bookingEvent.dates[0] } : null;
}

export async function getCustomerDropoffDateForDate(db: D1Database, date: string, now = new Date()) {
  const bookingEvents = await getCustomerBookingEvents(db, now);
  for (const bookingEvent of bookingEvents) { const dropoffDate = bookingEvent.dates.find((candidate) => candidate.eventDate === date); if (dropoffDate) return { bookingEvent, date: dropoffDate }; }
  return null;
}

async function groupCustomerBookingEventRows(db: D1Database, rows: BookingEventRow[], now: Date): Promise<CustomerBookingEvent[]> {
  const details = await Promise.all(rows.map(async (row) => ({ row, availability: await getDateAvailability(db, row, now) })));
  const grouped = new Map<number, CustomerBookingEvent>();
  for (const { row, availability } of details) {
    let bookingEvent = grouped.get(row.bookingEventId);
    if (!bookingEvent) { bookingEvent = { id: row.bookingEventId, name: row.name, description: row.description, opensAt: row.opensAt, closesAt: row.closesAt, timezone: row.timezone, timeStorageVersion: row.timeStorageVersion, active: row.active === 1, status: getBookingEventStatus(row, now), dates: [] }; grouped.set(row.bookingEventId, bookingEvent); }
    bookingEvent.dates.push({ eventId: row.eventId, eventDate: row.eventDate, eventName: row.eventName, description: row.eventDescription, isOpen: row.eventOpen === 1, ...availability });
  }
  return [...grouped.values()].map((bookingEvent) => bookingEvent.status === "open" && bookingEvent.dates.length > 0 && bookingEvent.dates.every((date) => date.availability === "Full") ? { ...bookingEvent, status: "full" } : bookingEvent);
}

function getBookingEventStatus(row: Pick<BookingEventRow, "opensAt" | "closesAt" | "timezone" | "timeStorageVersion" | "active">, now: Date): BookingEventStatus { const opensAt=bookingEventInstant(row.opensAt,row.timezone,row.timeStorageVersion), closesAt=row.closesAt?bookingEventInstant(row.closesAt,row.timezone,row.timeStorageVersion):null; if (!opensAt || (row.closesAt && !closesAt)) return "inactive"; return customerBookingEventSignupStatus({ opensAt, closesAt, active: row.active === 1 }, now); }
async function getDateAvailability(db: D1Database, row: BookingEventRow, now: Date): Promise<Pick<CustomerDropoffDate, "bookable" | "availability">> {
  const availability = getPublicDropoffDateAvailability(row, now);
  const status = availability.bookingEventStatus;
  if (status === "upcoming") return { bookable: false, availability: "Signup Not Open Yet" };
  if (!availability.bookable) return { bookable: false, availability: "Closed" };
  const capacity = await getEventCapacitySnapshot(db, row.eventId, row.eventDate);
  if (!capacity.bookable) return { bookable: false, availability: "Full" };
  if (capacity.waitlistOnly) return { bookable: true, availability: "Waitlist" };
  if (capacity.remainingRatio <= .1) return { bookable: true, availability: "Nearly Full" };
  if (capacity.remainingRatio <= .35) return { bookable: true, availability: "Limited Availability" };
  return { bookable: true, availability: "Available" };
}
function getPublicDropoffDateAvailability(row: { opensAt: string | null; closesAt: string | null; timezone: string | null; timeStorageVersion: number | null; active: number | null; eventOpen: number | null }, now: Date) {
  const opensAt = row.opensAt ? bookingEventInstant(row.opensAt, row.timezone ?? undefined, row.timeStorageVersion) : null;
  const closesAt = row.closesAt ? bookingEventInstant(row.closesAt, row.timezone ?? undefined, row.timeStorageVersion) : null;
  if (!opensAt || (row.closesAt && !closesAt)) return { bookingEventStatus: "inactive" as const, bookable: false };
  return getEffectivePublicDropoffDateAvailability({ opensAt, closesAt, active: row.active === 1, visibility: "public", operationallyEnabled: row.eventOpen === 1 }, now);
}
async function getEventCapacitySnapshot(db: D1Database, eventId: number, eventDate: string) {
  const [event, settingsResult, typesResult, areasResult, dailyUsage, confirmedAreaUsage, waitlistAreaUsage] = await db.batch([
    db.prepare("SELECT capacity_points AS capacityPoints, daily_capacity_override AS dailyCapacityOverride FROM dropoff_days WHERE id = ?").bind(eventId), db.prepare("SELECT value FROM settings WHERE key = 'default_daily_intake_capacity'"), db.prepare("SELECT capacity_points AS capacityPoints FROM dropoff_types WHERE active = 1"),
    db.prepare(`SELECT area.id, COALESCE(override.capacity_points_override, area.normal_capacity_points) AS capacityPoints, COALESCE(override.overflow_allowance_points_override, area.overflow_allowance_points) AS overflowPoints FROM item_areas area LEFT JOIN dropoff_day_area_overrides override ON override.item_area_id = area.id AND override.dropoff_day_id = ? WHERE area.active = 1`).bind(eventId),
    db.prepare(`SELECT COALESCE(SUM(type.capacity_points), 0) AS usedPoints FROM appointments appointment JOIN dropoff_types type ON type.id = appointment.dropoff_type_id WHERE appointment.appointment_date = ? AND appointment.status = 'scheduled'`).bind(eventDate), db.prepare(`SELECT allocation.item_area_id AS itemAreaId, COALESCE(SUM(allocation.capacity_points), 0) AS usedPoints FROM appointment_area_allocations allocation JOIN appointments appointment ON appointment.id = allocation.appointment_id WHERE appointment.appointment_date = ? AND appointment.status = 'scheduled' GROUP BY allocation.item_area_id`).bind(eventDate), db.prepare(`SELECT allocation.item_area_id AS itemAreaId, COALESCE(SUM(allocation.capacity_points), 0) AS usedPoints FROM appointment_area_allocations allocation JOIN appointments appointment ON appointment.id = allocation.appointment_id WHERE appointment.appointment_date = ? AND appointment.status = 'waitlisted' GROUP BY allocation.item_area_id`).bind(eventDate),
  ]);
  const eventRow = event.results[0] as { capacityPoints: number | null; dailyCapacityOverride: number | null } | undefined; const totalCapacity = eventRow?.dailyCapacityOverride ?? eventRow?.capacityPoints ?? Number((settingsResult.results[0] as { value?: string } | undefined)?.value); const usedDaily = Number((dailyUsage.results[0] as { usedPoints?: number } | undefined)?.usedPoints ?? 0); const remainingDaily = Math.max(0, totalCapacity - usedDaily);
  const usedByArea = new Map((confirmedAreaUsage.results as Array<{ itemAreaId: number; usedPoints: number }>).map((usage) => [usage.itemAreaId, usage.usedPoints])); const waitlistedByArea = new Map((waitlistAreaUsage.results as Array<{ itemAreaId: number; usedPoints: number }>).map((usage) => [usage.itemAreaId, usage.usedPoints])); const areas = areasResult.results as Array<{ id: number; capacityPoints: number; overflowPoints: number }>; const types = typesResult.results as Array<{ capacityPoints: number }>;
  const normalRemaining = areas.map((area) => Math.max(0, area.capacityPoints - (usedByArea.get(area.id) ?? 0))); const waitlistRemaining = areas.map((area) => Math.max(0, area.overflowPoints - (waitlistedByArea.get(area.id) ?? 0)));
  const normalBookable = Number.isFinite(totalCapacity) && types.some((type) => type.capacityPoints <= remainingDaily && normalRemaining.some((capacity) => type.capacityPoints <= capacity));
  const waitlistBookable = Number.isFinite(totalCapacity) && types.some((type) => waitlistRemaining.some((capacity) => type.capacityPoints <= capacity)); const dailyRatio = totalCapacity > 0 ? remainingDaily / totalCapacity : 0; const bestAreaRatio = Math.max(0, ...areas.map((area, index) => area.capacityPoints > 0 ? normalRemaining[index] / area.capacityPoints : 0)); return { bookable: normalBookable || waitlistBookable, waitlistOnly: !normalBookable && waitlistBookable, remainingRatio: Math.min(dailyRatio, bestAreaRatio) };
}
function today(now: Date) { return calendarDateInTimezone(now); }
