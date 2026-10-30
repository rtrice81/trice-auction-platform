export type DropoffHierarchy = { id: number; date: string; bookingEventId: number | null; bookingEventName: string | null };

// The association is stored on the date, so this also works for direct links and refreshes.
export async function getDropoffHierarchy(db: D1Database, lookup: { id: number } | { date: string }): Promise<DropoffHierarchy | null> {
  const condition = "id" in lookup ? "day.id = ?" : "day.dropoff_date = ?";
  return db.prepare(`SELECT day.id, day.dropoff_date AS date, event.id AS bookingEventId, event.name AS bookingEventName
    FROM dropoff_days day LEFT JOIN booking_event_dropoff_dates link ON link.dropoff_day_id=day.id
    LEFT JOIN booking_events event ON event.id=link.booking_event_id WHERE ${condition}`)
    .bind("id" in lookup ? lookup.id : lookup.date).first<DropoffHierarchy>();
}
