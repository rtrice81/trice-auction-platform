export type InternalAppointmentEvent = "created" | "updated" | "cancelled";

export type InternalRecipient = {
  id: number;
  label: string;
  email: string;
  active: number;
  receiveCreated: number;
  receiveUpdated: number;
  receiveCancelled: number;
};

export type AppointmentActivitySnapshot = {
  id: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string | null;
  date: string;
  loadType: string;
  description: string | null;
  allocations: Array<{ name: string; percentage: number }>;
  version: string;
};

export async function listInternalAppointmentRecipients(db: D1Database) {
  const { results } = await db.prepare(`SELECT id, label, email, active,
    receive_created AS receiveCreated, receive_updated AS receiveUpdated,
    receive_cancelled AS receiveCancelled
    FROM appointment_notification_recipients ORDER BY active DESC, label ASC, id ASC`).all<InternalRecipient>();
  return results;
}

export async function saveInternalAppointmentRecipient(db: D1Database, input: Omit<InternalRecipient, "id"> & { id?: number }) {
  const label = input.label.trim();
  const email = input.email.trim().toLowerCase();
  if (!label) return { ok: false as const, error: "Recipient label is required." };
  if (!/^\S+@\S+\.\S+$/.test(email)) return { ok: false as const, error: "Enter a valid recipient email address." };
  try {
    if (input.id) await db.prepare(`UPDATE appointment_notification_recipients SET label=?,email=?,active=?,receive_created=?,receive_updated=?,receive_cancelled=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(label, email, input.active, input.receiveCreated, input.receiveUpdated, input.receiveCancelled, input.id).run();
    else await db.prepare(`INSERT INTO appointment_notification_recipients(label,email,active,receive_created,receive_updated,receive_cancelled) VALUES(?,?,?,?,?,?)`).bind(label, email, input.active, input.receiveCreated, input.receiveUpdated, input.receiveCancelled).run();
  } catch (error) {
    if (error instanceof Error && /unique/i.test(error.message)) return { ok: false as const, error: "That recipient email already exists." };
    throw error;
  }
  return { ok: true as const };
}

export async function deleteInternalAppointmentRecipient(db: D1Database, id: number) {
  const recipient = await db.prepare("SELECT email FROM appointment_notification_recipients WHERE id=?").bind(id).first<{ email: string }>();
  if (!recipient) return { ok: false as const, error: "Recipient not found." };
  const history = await db.prepare("SELECT COUNT(*) AS count FROM notification_jobs WHERE recipient=? AND notification_type LIKE 'internal_%'").bind(recipient.email).first<{ count: number }>();
  if (history?.count) return { ok: false as const, error: "This recipient has delivery history. Deactivate it instead." };
  await db.prepare("DELETE FROM appointment_notification_recipients WHERE id=?").bind(id).run();
  return { ok: true as const };
}

export async function getInternalAppointmentSnapshot(db: D1Database, appointmentId: number): Promise<AppointmentActivitySnapshot | null> {
  const appointment = await db.prepare(`SELECT a.id, COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS customerName,
    u.email AS customerEmail, u.phone AS customerPhone, a.appointment_date AS date,
    t.name AS loadType, a.description, COALESCE(a.updated_at, a.created_at) AS version
    FROM appointments a JOIN users u ON u.id=a.user_id JOIN dropoff_types t ON t.id=a.dropoff_type_id WHERE a.id=?`).bind(appointmentId).first<Omit<AppointmentActivitySnapshot, "allocations">>();
  if (!appointment) return null;
  const { results } = await db.prepare(`SELECT area.name, allocation.allocation_percent AS percentage
    FROM appointment_area_allocations allocation JOIN item_areas area ON area.id=allocation.item_area_id
    WHERE allocation.appointment_id=? ORDER BY area.display_order, area.id`).bind(appointmentId).all<{ name: string; percentage: number }>();
  return { ...appointment, allocations: results };
}

export function internalAppointmentDetailsChanged(previous: AppointmentActivitySnapshot | null, current: AppointmentActivitySnapshot | null) {
  if (!previous || !current) return false;
  return JSON.stringify({ date: previous.date, loadType: previous.loadType, description: previous.description, allocations: previous.allocations }) !== JSON.stringify({ date: current.date, loadType: current.loadType, description: current.description, allocations: current.allocations });
}

export async function queueInternalAppointmentActivity(db: D1Database, input: { appointmentId: number; event: InternalAppointmentEvent; previous?: AppointmentActivitySnapshot | null; actorName?: string | null }) {
  const current = await getInternalAppointmentSnapshot(db, input.appointmentId);
  if (!current) return;
  const subscription = input.event === "created" ? "receive_created" : input.event === "updated" ? "receive_updated" : "receive_cancelled";
  const { results } = await db.prepare(`SELECT label,email FROM appointment_notification_recipients WHERE active=1 AND ${subscription}=1`).all<{ label: string; email: string }>();
  const eventVersion = `${current.version}:${input.event}:${JSON.stringify(input.previous ?? null)}`;
  const payload = { event: input.event, current, previous: input.previous ?? null, actorName: input.actorName || null, occurredAt: new Date().toISOString() };
  await db.batch(results.map((recipient) => db.prepare(`INSERT INTO notification_jobs(idempotency_key,appointment_id,notification_type,channel,recipient,payload_json,scheduled_at)
    VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(idempotency_key) DO NOTHING`).bind(
      `internal:${input.appointmentId}:${input.event}:${recipient.email}:${eventVersion}`,
      input.appointmentId,
      `internal_${input.event}`,
      "email",
      recipient.email,
      JSON.stringify({ ...payload, recipientLabel: recipient.label }),
    )));
}
