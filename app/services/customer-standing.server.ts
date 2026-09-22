import type { ApplicationUser } from "./auth.server";

export type CustomerStanding = {
  dropoffBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  bannedByName: string | null;
};

export type CustomerPrivateNote = {
  id: number;
  noteText: string;
  createdAt: string;
  authorName: string;
};

export async function getCustomerStanding(db: D1Database, customerUserId: number): Promise<CustomerStanding | null> {
  const row = await db.prepare(
    `SELECT customer.dropoff_banned AS dropoffBanned, customer.dropoff_ban_reason AS banReason,
            customer.dropoff_banned_at AS bannedAt,
            COALESCE(NULLIF(TRIM(actor.first_name || ' ' || actor.last_name), ''), actor.email) AS bannedByName
     FROM users customer
     LEFT JOIN users actor ON actor.id = customer.dropoff_banned_by_user_id
     WHERE customer.id = ? AND customer.role = 'customer'`,
  ).bind(customerUserId).first<Omit<CustomerStanding, "dropoffBanned"> & { dropoffBanned: number }>();
  return row ? { ...row, dropoffBanned: row.dropoffBanned === 1 } : null;
}

export async function getCustomerPrivateNotes(db: D1Database, customerUserId: number): Promise<CustomerPrivateNote[]> {
  const { results } = await db.prepare(
    `SELECT note.id, note.note_text AS noteText, note.created_at AS createdAt,
            COALESCE(NULLIF(TRIM(author.first_name || ' ' || author.last_name), ''), author.email) AS authorName
     FROM customer_private_notes note
     JOIN users author ON author.id = note.author_user_id
     WHERE note.customer_user_id = ?
     ORDER BY note.created_at ASC, note.id ASC`,
  ).bind(customerUserId).all<CustomerPrivateNote>();
  return results;
}

export async function getCustomerAppointmentHistory(db: D1Database, customerUserId: number) {
  const { results } = await db.prepare(
    `SELECT appointment.id, appointment.appointment_date AS appointmentDate,
            appointment.status, type.name AS loadType
     FROM appointments appointment
     JOIN dropoff_types type ON type.id = appointment.dropoff_type_id
     WHERE appointment.user_id = ?
     ORDER BY appointment.appointment_date DESC, appointment.id DESC`,
  ).bind(customerUserId).all<{ id: number; appointmentDate: string; status: string; loadType: string }>();
  return results;
}

export type CustomerAppointment = {
  id: number;
  appointmentDate: string;
  appointmentTime: string | null;
  createdAt: string;
  status: string;
  loadType: string;
  description: string | null;
  allocationSummary: string;
};

/**
 * Returns the existing appointments for one user, organized for the admin
 * user record. Appointments are date-only in the current booking workflow;
 * the nullable legacy time is retained for any older records.
 */
export async function getCustomerAppointmentsByTiming(db: D1Database, customerUserId: number) {
  const select = `SELECT appointment.id, appointment.appointment_date AS appointmentDate,
            appointment.appointment_time AS appointmentTime, appointment.created_at AS createdAt,
            appointment.status, type.name AS loadType, appointment.description,
            COALESCE(GROUP_CONCAT(area.name || ': ' || allocation.allocation_percent || '%', ' · '), '') AS allocationSummary
     FROM appointments appointment
     JOIN dropoff_types type ON type.id = appointment.dropoff_type_id
     LEFT JOIN appointment_area_allocations allocation ON allocation.appointment_id = appointment.id
     LEFT JOIN item_areas area ON area.id = allocation.item_area_id`;
  const [upcomingResult, pastResult] = await Promise.all([
    db.prepare(`${select}
      WHERE appointment.user_id = ?
        AND appointment.appointment_date >= date('now')
        AND (appointment.appointment_date > date('now')
          OR appointment.appointment_time IS NULL
          OR TRIM(appointment.appointment_time) = ''
          OR appointment.appointment_time >= time('now'))
        AND appointment.status NOT IN ('cancelled', 'last_minute_cancelled')
      GROUP BY appointment.id
      ORDER BY appointment.appointment_date ASC,
        CASE WHEN appointment.appointment_time IS NULL OR TRIM(appointment.appointment_time) = '' THEN 1 ELSE 0 END,
        appointment.appointment_time ASC, appointment.id ASC`).bind(customerUserId).all<CustomerAppointment>(),
    db.prepare(`${select}
      WHERE appointment.user_id = ?
        AND (appointment.appointment_date < date('now')
          OR (appointment.appointment_date = date('now')
            AND appointment.appointment_time IS NOT NULL
            AND TRIM(appointment.appointment_time) != ''
            AND appointment.appointment_time < time('now'))
          OR appointment.status IN ('cancelled', 'last_minute_cancelled'))
      GROUP BY appointment.id
      ORDER BY appointment.appointment_date DESC,
        appointment.appointment_time DESC, appointment.id DESC`).bind(customerUserId).all<CustomerAppointment>(),
  ]);
  return { upcoming: upcomingResult.results, past: pastResult.results };
}

export async function setCustomerDropoffBan(db: D1Database, input: { customerUserId: number; actor: ApplicationUser; reason: string }) {
  const reason = input.reason.trim();
  if (!reason) return { ok: false as const, errors: ["A ban reason is required."] };
  const result = await db.prepare(
    `UPDATE users
     SET dropoff_banned = 1, dropoff_ban_reason = ?, dropoff_banned_at = CURRENT_TIMESTAMP,
         dropoff_banned_by_user_id = ?
     WHERE id = ? AND role = 'customer'`,
  ).bind(reason, input.actor.id, input.customerUserId).run();
  return result.meta.changes === 1
    ? { ok: true as const, message: "Customer is now banned from scheduling drop-offs." }
    : { ok: false as const, errors: ["Customer was not found."] };
}

export async function removeCustomerDropoffBan(db: D1Database, customerUserId: number) {
  const result = await db.prepare(
    `UPDATE users
     SET dropoff_banned = 0, dropoff_ban_reason = NULL, dropoff_banned_at = NULL,
         dropoff_banned_by_user_id = NULL
     WHERE id = ? AND role = 'customer'`,
  ).bind(customerUserId).run();
  return result.meta.changes === 1
    ? { ok: true as const, message: "Customer may schedule drop-offs again." }
    : { ok: false as const, errors: ["Customer was not found."] };
}

export async function addCustomerPrivateNote(db: D1Database, input: { customerUserId: number; actor: ApplicationUser; noteText: string }) {
  const noteText = input.noteText.trim();
  if (!noteText) return { ok: false as const, errors: ["Enter a private note before saving."] };
  const customer = await getCustomerStanding(db, input.customerUserId);
  if (!customer) return { ok: false as const, errors: ["Customer was not found."] };
  await db.prepare(
    "INSERT INTO customer_private_notes (customer_user_id, author_user_id, note_text) VALUES (?, ?, ?)",
  ).bind(input.customerUserId, input.actor.id, noteText).run();
  return { ok: true as const, message: "Private customer note added." };
}
