type DeleteAppointmentResult =
  | { ok: true; appointmentDate: string }
  | { ok: false; error: string };

type AppointmentForDeletion = {
  id: number;
  userId: number;
  customerName: string;
  appointmentDate: string;
  dropoffDayId: number | null;
  bookingHoldId: string | null;
};

export async function permanentlyDeleteAppointment(
  db: D1Database,
  input: { appointmentId: number; actorUserId: number },
): Promise<DeleteAppointmentResult> {
  if (!isPositiveInteger(input.appointmentId) || !isPositiveInteger(input.actorUserId)) {
    return { ok: false, error: "Appointment could not be deleted." };
  }

  const appointment = await db.prepare(
    `SELECT appointment.id,
            appointment.user_id AS userId,
            COALESCE(NULLIF(TRIM(user.first_name || ' ' || user.last_name), ''), user.email) AS customerName,
            appointment.appointment_date AS appointmentDate,
            day.id AS dropoffDayId,
            appointment.booking_hold_id AS bookingHoldId
     FROM appointments appointment
     JOIN users user ON user.id = appointment.user_id
     LEFT JOIN dropoff_days day ON day.dropoff_date = appointment.appointment_date
     WHERE appointment.id = ?`,
  ).bind(input.appointmentId).first<AppointmentForDeletion>();
  if (!appointment) return { ok: false, error: "Appointment was not found." };

  try {
    await db.batch([
      // Keep a minimal administrative record after the appointment-scoped rows are gone.
      db.prepare(
        `INSERT INTO appointment_deletion_audits
           (appointment_id, customer_id, customer_name, dropoff_day_id, dropoff_date, actor_user_id, action_type)
         VALUES (?, ?, ?, ?, ?, ?, 'appointment_deleted')`,
      ).bind(appointment.id, appointment.userId, appointment.customerName, appointment.dropoffDayId, appointment.appointmentDate, input.actorUserId),
      // This history is meaningful only while its appointment exists; it has no cascade in the legacy schema.
      db.prepare("DELETE FROM appointment_status_history WHERE appointment_id = ?").bind(appointment.id),
      // Retain delivery history, but cancel work that could otherwise try to render a removed appointment.
      db.prepare(
        `UPDATE notification_jobs
         SET appointment_id = NULL,
             status = CASE WHEN status IN ('pending', 'processing') THEN 'cancelled' ELSE status END,
             updated_at = CURRENT_TIMESTAMP
         WHERE appointment_id = ?`,
      ).bind(appointment.id),
      // Allocations, override audits, and booking success flashes use foreign-key cascades from appointments.
      db.prepare("DELETE FROM appointments WHERE id = ?").bind(appointment.id),
      // A converted hold belongs only to this appointment and must not survive as an orphaned reservation.
      ...(appointment.bookingHoldId ? [db.prepare("DELETE FROM booking_holds WHERE id = ?").bind(appointment.bookingHoldId)] : []),
    ]);
  } catch {
    return { ok: false, error: "Appointment could not be deleted. Please try again." };
  }

  return { ok: true, appointmentDate: appointment.appointmentDate };
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}
