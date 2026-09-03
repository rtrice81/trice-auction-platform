export const ATTENDANCE_ACTIONS = ["check-in", "complete", "no-show", "last-minute-cancel"] as const;
export type AttendanceAction = (typeof ATTENDANCE_ACTIONS)[number];

const transitions: Record<AttendanceAction, { from: string; to: string; timestamp: string; message: string }> = {
  "check-in": { from: "scheduled", to: "checked_in", timestamp: "checked_in_at", message: "Appointment checked in." },
  complete: { from: "checked_in", to: "completed", timestamp: "completed_at", message: "Appointment marked completed." },
  "no-show": { from: "scheduled", to: "no_show", timestamp: "no_show_at", message: "Appointment marked no-show." },
  "last-minute-cancel": { from: "scheduled", to: "last_minute_cancelled", timestamp: "last_minute_cancelled_at", message: "Last-minute cancellation recorded." },
};

export function isAttendanceAction(value: string): value is AttendanceAction {
  return ATTENDANCE_ACTIONS.includes(value as AttendanceAction);
}

export async function recordAppointmentAttendance(
  db: D1Database,
  input: { appointmentId: number; actorUserId: number; action: AttendanceAction },
) {
  if (!Number.isInteger(input.appointmentId) || input.appointmentId < 1 || !Number.isInteger(input.actorUserId) || input.actorUserId < 1) {
    return { ok: false as const, error: "Choose a valid appointment." };
  }
  const transition = transitions[input.action];
  const result = await db.prepare(
    `UPDATE appointments SET status = ?, ${transition.timestamp} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ?`,
  ).bind(transition.to, input.appointmentId, transition.from).run();
  if (result.meta.changes !== 1) {
    const current = await db.prepare("SELECT status FROM appointments WHERE id = ?").bind(input.appointmentId).first<{ status: string }>();
    return { ok: false as const, error: current ? `This action is only available while the appointment is ${transition.from.replace("_", " ")}.` : "Appointment not found." };
  }
  await db.prepare(
    `INSERT INTO appointment_status_history (appointment_id, previous_status, status, actor_user_id)
     VALUES (?, ?, ?, ?)`,
  ).bind(input.appointmentId, transition.from, transition.to, input.actorUserId).run();
  return { ok: true as const, message: transition.message };
}

export async function getAppointmentStatusHistory(db: D1Database, appointmentId: number) {
  const { results } = await db.prepare(
    `SELECT history.id, history.previous_status AS previousStatus, history.status, history.occurred_at AS occurredAt,
            COALESCE(NULLIF(TRIM(actor.first_name || ' ' || actor.last_name), ''), actor.email) AS actorName
     FROM appointment_status_history history
     JOIN users actor ON actor.id = history.actor_user_id
     WHERE history.appointment_id = ? ORDER BY history.occurred_at DESC, history.id DESC`,
  ).bind(appointmentId).all<{ id: number; previousStatus: string; status: string; occurredAt: string; actorName: string }>();
  return results;
}
