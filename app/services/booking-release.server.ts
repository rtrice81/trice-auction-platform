export type BookingReleaseStatus = "upcoming" | "open" | "closed" | "inactive" | "unassigned";

export async function getBookableReleaseForDate(db: D1Database, date: string, now = new Date()) {
  const row = await db.prepare(`SELECT release.id, release.name, release.opens_at AS opensAt, release.closes_at AS closesAt, release.timezone, release.active FROM dropoff_days day LEFT JOIN booking_release_events link ON link.dropoff_day_id = day.id LEFT JOIN booking_releases release ON release.id = link.booking_release_id WHERE day.dropoff_date = ?`).bind(date).first<{ id: number | null; name: string | null; opensAt: string | null; closesAt: string | null; timezone: string | null; active: number | null }>();
  if (!row?.id || row.active !== 1 || !row.opensAt) return { eligible: false, status: row?.id ? "inactive" as const : "unassigned" as const, release: row };
  const nowTime = now.getTime(); const opensAt = Date.parse(row.opensAt); const closesAt = row.closesAt ? Date.parse(row.closesAt) : null;
  if (nowTime < opensAt) return { eligible: false, status: "upcoming" as const, release: row };
  if (closesAt !== null && nowTime >= closesAt) return { eligible: false, status: "closed" as const, release: row };
  return { eligible: true, status: "open" as const, release: row };
}

export async function getReleaseSummariesForDates(db: D1Database, dates: string[], now = new Date()) {
  return Promise.all(dates.map(async (date) => ({ date, ...(await getBookableReleaseForDate(db, date, now)) })));
}

export async function getUpcomingBookingReleases(db: D1Database, now = new Date()) {
  const { results } = await db.prepare(`SELECT release.id, release.name, release.opens_at AS opensAt, release.timezone, day.dropoff_date AS eventDate FROM booking_releases release JOIN booking_release_events link ON link.booking_release_id = release.id JOIN dropoff_days day ON day.id = link.dropoff_day_id WHERE release.active = 1 AND day.is_open = 1 ORDER BY release.opens_at, day.dropoff_date`).all<{ id: number; name: string; opensAt: string; timezone: string; eventDate: string }>();
  return results.filter((release) => Date.parse(release.opensAt) > now.getTime());
}
