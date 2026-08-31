export type BookingReleaseStatus = "upcoming" | "open" | "closed" | "inactive" | "unassigned";
export type CustomerAvailability = "Available" | "Limited Availability" | "Nearly Full" | "Full" | "Signup Not Open Yet" | "Closed";

export type CustomerDropoffEvent = { eventId: number; eventDate: string; eventName: string | null; isOpen: boolean; bookable: boolean; availability: CustomerAvailability };
export type CustomerBookingRelease = { id: number; name: string; opensAt: string; closesAt: string | null; timezone: string; status: BookingReleaseStatus; events: CustomerDropoffEvent[] };
type ReleaseRow = { releaseId: number; name: string; opensAt: string; closesAt: string | null; timezone: string; eventId: number; eventDate: string; eventName: string | null; eventOpen: number };

export async function getBookableReleaseForDate(db: D1Database, date: string, now = new Date()) {
  const row = await db.prepare(`SELECT release.id, release.name, release.opens_at AS opensAt, release.closes_at AS closesAt, release.timezone, release.active FROM dropoff_days day LEFT JOIN booking_release_events link ON link.dropoff_day_id = day.id LEFT JOIN booking_releases release ON release.id = link.booking_release_id WHERE day.dropoff_date = ?`).bind(date).first<{ id: number | null; name: string | null; opensAt: string | null; closesAt: string | null; timezone: string | null; active: number | null }>();
  if (!row?.id || row.active !== 1 || !row.opensAt) return { eligible: false, status: row?.id ? "inactive" as const : "unassigned" as const, release: row };
  const nowTime = now.getTime(); const opensAt = Date.parse(row.opensAt); const closesAt = row.closesAt ? Date.parse(row.closesAt) : null;
  if (nowTime < opensAt) return { eligible: false, status: "upcoming" as const, release: row };
  if (closesAt !== null && nowTime >= closesAt) return { eligible: false, status: "closed" as const, release: row };
  return { eligible: true, status: "open" as const, release: row };
}

export async function getReleaseSummariesForDates(db: D1Database, dates: string[], now = new Date()) { return Promise.all(dates.map(async (date) => ({ date, ...(await getBookableReleaseForDate(db, date, now)) }))); }
export async function getUpcomingBookingReleases(db: D1Database, now = new Date()) { const { results } = await db.prepare(`SELECT release.id, release.name, release.opens_at AS opensAt, release.timezone, day.dropoff_date AS eventDate FROM booking_releases release JOIN booking_release_events link ON link.booking_release_id = release.id JOIN dropoff_days day ON day.id = link.dropoff_day_id WHERE release.active = 1 AND day.is_open = 1 ORDER BY release.opens_at, day.dropoff_date`).all<{ id: number; name: string; opensAt: string; timezone: string; eventDate: string }>(); return results.filter((release) => Date.parse(release.opensAt) > now.getTime()); }

export async function getCustomerBookingReleases(db: D1Database, now = new Date()): Promise<CustomerBookingRelease[]> {
  const { results } = await db.prepare(`SELECT release.id AS releaseId, release.name, release.opens_at AS opensAt, release.closes_at AS closesAt, release.timezone, day.id AS eventId, day.dropoff_date AS eventDate, day.event_name AS eventName, day.is_open AS eventOpen FROM booking_releases release JOIN booking_release_events link ON link.booking_release_id = release.id JOIN dropoff_days day ON day.id = link.dropoff_day_id WHERE release.active = 1 AND day.dropoff_date >= ? ORDER BY release.opens_at ASC, day.dropoff_date ASC`).bind(today(now)).all<ReleaseRow>();
  return groupCustomerReleaseRows(db, results, now);
}

export async function getCustomerDropoffEventById(db: D1Database, eventId: number, now = new Date()) {
  const row = await db.prepare(`SELECT release.id AS releaseId, release.name, release.opens_at AS opensAt, release.closes_at AS closesAt, release.timezone, day.id AS eventId, day.dropoff_date AS eventDate, day.event_name AS eventName, day.is_open AS eventOpen FROM booking_releases release JOIN booking_release_events link ON link.booking_release_id = release.id JOIN dropoff_days day ON day.id = link.dropoff_day_id WHERE release.active = 1 AND day.id = ? AND day.dropoff_date >= ?`).bind(eventId, today(now)).first<ReleaseRow>();
  if (!row) return null;
  const [release] = await groupCustomerReleaseRows(db, [row], now);
  return release ? { release, event: release.events[0] } : null;
}

export async function getCustomerDropoffEventForDate(db: D1Database, date: string, now = new Date()) {
  const releases = await getCustomerBookingReleases(db, now);
  for (const release of releases) { const event = release.events.find((candidate) => candidate.eventDate === date); if (event) return { release, event }; }
  return null;
}

async function groupCustomerReleaseRows(db: D1Database, rows: ReleaseRow[], now: Date): Promise<CustomerBookingRelease[]> {
  const eventDetails = await Promise.all(rows.map(async (row) => ({ row, availability: await getEventAvailability(db, row, now) })));
  const grouped = new Map<number, CustomerBookingRelease>();
  for (const { row, availability } of eventDetails) {
    let release = grouped.get(row.releaseId);
    if (!release) { release = { id: row.releaseId, name: row.name, opensAt: row.opensAt, closesAt: row.closesAt, timezone: row.timezone, status: getReleaseStatus(row, now), events: [] }; grouped.set(row.releaseId, release); }
    release.events.push({ eventId: row.eventId, eventDate: row.eventDate, eventName: row.eventName, isOpen: row.eventOpen === 1, ...availability });
  }
  return [...grouped.values()];
}

function getReleaseStatus(row: Pick<ReleaseRow, "opensAt" | "closesAt">, now: Date): BookingReleaseStatus { if (now.getTime() < Date.parse(row.opensAt)) return "upcoming"; if (row.closesAt && now.getTime() >= Date.parse(row.closesAt)) return "closed"; return "open"; }
async function getEventAvailability(db: D1Database, row: ReleaseRow, now: Date): Promise<Pick<CustomerDropoffEvent, "bookable" | "availability">> {
  const releaseStatus = getReleaseStatus(row, now);
  if (releaseStatus === "upcoming") return { bookable: false, availability: "Signup Not Open Yet" };
  if (releaseStatus !== "open" || row.eventOpen !== 1) return { bookable: false, availability: "Closed" };
  const capacity = await getEventCapacitySnapshot(db, row.eventId, row.eventDate);
  if (!capacity.bookable) return { bookable: false, availability: "Full" };
  if (capacity.remainingRatio <= 0.1) return { bookable: true, availability: "Nearly Full" };
  if (capacity.remainingRatio <= 0.35) return { bookable: true, availability: "Limited Availability" };
  return { bookable: true, availability: "Available" };
}

async function getEventCapacitySnapshot(db: D1Database, eventId: number, eventDate: string) {
  const [event, settingsResult, typesResult, areasResult, dailyUsage, areaUsage] = await db.batch([
    db.prepare("SELECT capacity_points AS capacityPoints, daily_capacity_override AS dailyCapacityOverride FROM dropoff_days WHERE id = ?").bind(eventId), db.prepare("SELECT value FROM settings WHERE key = 'default_daily_intake_capacity'"), db.prepare("SELECT capacity_points AS capacityPoints FROM dropoff_types WHERE active = 1"),
    db.prepare(`SELECT area.id, COALESCE(override.capacity_points_override, area.normal_capacity_points) AS capacityPoints, COALESCE(override.overflow_allowance_points_override, area.overflow_allowance_points) AS overflowPoints FROM item_areas area LEFT JOIN dropoff_day_area_overrides override ON override.item_area_id = area.id AND override.dropoff_day_id = ? WHERE area.active = 1`).bind(eventId),
    db.prepare(`SELECT COALESCE(SUM(type.capacity_points), 0) AS usedPoints FROM appointments appointment JOIN dropoff_types type ON type.id = appointment.dropoff_type_id WHERE appointment.appointment_date = ? AND appointment.status = 'scheduled'`).bind(eventDate), db.prepare(`SELECT allocation.item_area_id AS itemAreaId, COALESCE(SUM(allocation.capacity_points), 0) AS usedPoints FROM appointment_area_allocations allocation JOIN appointments appointment ON appointment.id = allocation.appointment_id WHERE appointment.appointment_date = ? AND appointment.status = 'scheduled' GROUP BY allocation.item_area_id`).bind(eventDate),
  ]);
  const eventRow = event.results[0] as { capacityPoints: number | null; dailyCapacityOverride: number | null } | undefined;
  const defaultCapacity = Number((settingsResult.results[0] as { value?: string } | undefined)?.value);
  const totalCapacity = eventRow?.dailyCapacityOverride ?? eventRow?.capacityPoints ?? defaultCapacity;
  const usedDaily = Number((dailyUsage.results[0] as { usedPoints?: number } | undefined)?.usedPoints ?? 0); const remainingDaily = Math.max(0, totalCapacity - usedDaily);
  const usedByArea = new Map((areaUsage.results as Array<{ itemAreaId: number; usedPoints: number }>).map((usage) => [usage.itemAreaId, usage.usedPoints]));
  const areas = areasResult.results as Array<{ id: number; capacityPoints: number; overflowPoints: number }>; const types = typesResult.results as Array<{ capacityPoints: number }>;
  const availableAreaCapacities = areas.map((area) => Math.max(0, area.capacityPoints + area.overflowPoints - (usedByArea.get(area.id) ?? 0)));
  const bookable = Number.isFinite(totalCapacity) && types.some((type) => type.capacityPoints <= remainingDaily && availableAreaCapacities.some((remaining) => type.capacityPoints <= remaining));
  const dailyRatio = totalCapacity > 0 ? remainingDaily / totalCapacity : 0; const bestAreaRatio = Math.max(0, ...areas.map((area, index) => area.capacityPoints + area.overflowPoints > 0 ? availableAreaCapacities[index] / (area.capacityPoints + area.overflowPoints) : 0));
  return { bookable, remainingRatio: Math.min(dailyRatio, bestAreaRatio) };
}
function today(now: Date) { return now.toISOString().slice(0, 10); }
