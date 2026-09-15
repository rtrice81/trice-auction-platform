export type DailyDropoffScheduleAppointment = {
  id: number;
  customer: string;
  consignorId: string | null;
  phone: string | null;
  loadType: string;
  allocationSummary: string;
  description: string | null;
  adminNotes: string | null;
  status: string;
  checkedInAt: string | null;
};

export type DailyDropoffScheduleReport = {
  date: string;
  eventName: string | null;
  capacity: { normal: number; confirmed: number; waitlist: number } | null;
  totals: { scheduled: number; checkedIn: number; completed: number; noShow: number; lastMinuteCancelled: number; waitlisted: number };
  appointments: DailyDropoffScheduleAppointment[];
};

/** Operational report data excludes private customer notes. */
export async function getDailyDropoffScheduleReport(db: D1Database, date: string, includeCancelled = false): Promise<DailyDropoffScheduleReport> {
  const statuses = includeCancelled
    ? ["scheduled", "checked_in", "completed", "no_show", "last_minute_cancelled", "waitlisted", "cancelled"]
    : ["scheduled", "checked_in", "completed", "no_show", "last_minute_cancelled", "waitlisted"];
  const placeholders = statuses.map(() => "?").join(", ");
  const [day, totals, appointments] = await Promise.all([
    db.prepare(`SELECT day.event_name AS eventName, COALESCE(day.daily_capacity_override, day.capacity_points) AS normalCapacity FROM dropoff_days day WHERE day.dropoff_date = ?`).bind(date).first<{ eventName: string | null; normalCapacity: number }>(),
    db.prepare(`SELECT COALESCE(SUM(CASE WHEN status IN ('scheduled', 'checked_in', 'completed') THEN 1 ELSE 0 END), 0) AS scheduled, COALESCE(SUM(CASE WHEN status = 'checked_in' THEN 1 ELSE 0 END), 0) AS checkedIn, COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0) AS completed, COALESCE(SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END), 0) AS noShow, COALESCE(SUM(CASE WHEN status = 'last_minute_cancelled' THEN 1 ELSE 0 END), 0) AS lastMinuteCancelled, COALESCE(SUM(CASE WHEN status = 'waitlisted' THEN 1 ELSE 0 END), 0) AS waitlisted FROM appointments WHERE appointment_date = ?`).bind(date).first<DailyDropoffScheduleReport["totals"]>(),
    db.prepare(`SELECT appointment.id, COALESCE(NULLIF(TRIM(user.first_name || ' ' || user.last_name), ''), user.email) AS customer, user.consignor_id AS consignorId, user.phone, type.name AS loadType, appointment.description, appointment.admin_notes AS adminNotes, appointment.status, appointment.checked_in_at AS checkedInAt, COALESCE(GROUP_CONCAT(area.name || ': ' || allocation.allocation_percent || '%', ' / '), '') AS allocationSummary FROM appointments appointment JOIN users user ON user.id = appointment.user_id JOIN dropoff_types type ON type.id = appointment.dropoff_type_id LEFT JOIN appointment_area_allocations allocation ON allocation.appointment_id = appointment.id LEFT JOIN item_areas area ON area.id = allocation.item_area_id WHERE appointment.appointment_date = ? AND appointment.status IN (${placeholders}) GROUP BY appointment.id ORDER BY CASE WHEN appointment.appointment_time IS NULL OR TRIM(appointment.appointment_time) = '' THEN 1 ELSE 0 END, appointment.appointment_time ASC, appointment.created_at ASC, appointment.id ASC`).bind(date, ...statuses).all<DailyDropoffScheduleAppointment>(),
  ]);
  const confirmed = totals?.scheduled ?? 0;
  return { date, eventName: day?.eventName ?? null, capacity: day ? { normal: day.normalCapacity, confirmed, waitlist: totals?.waitlisted ?? 0 } : null, totals: totals ?? { scheduled: 0, checkedIn: 0, completed: 0, noShow: 0, lastMinuteCancelled: 0, waitlisted: 0 }, appointments: appointments.results };
}
