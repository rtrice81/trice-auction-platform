import { safelyQueuePickupNotifications, type PickupSchedule } from "./internal-pickup-notifications.server";
import { PICKUP_STATUSES, type PickupStatus } from "../lib/consignment-pickup-status";
export { PICKUP_STATUSES, type PickupStatus } from "../lib/consignment-pickup-status";

export type PickupInput = {
  customerId: number; title: string; pickupDate: string; arrivalTime: string; estimatedDurationMinutes: string; status: PickupStatus;
  contactName: string; contactPhone: string; addressLine1: string; addressLine2: string; city: string; state: string; postalCode: string;
  accessInstructions: string; estateDescription: string; estimatedLoadSize: string; estimatedSmallsPercent: string; estimatedLargePercent: string; estimatedOutdoorPercent: string; internalNotes: string; assignedUserIds: number[];
};

export function pickupInputFromForm(form: FormData): PickupInput {
  const status = String(form.get("status") || "planned");
  return { customerId: Number(form.get("customerId")), title: text(form, "title"), pickupDate: text(form, "pickupDate"), arrivalTime: text(form, "arrivalTime"), estimatedDurationMinutes: text(form, "estimatedDurationMinutes"), status: PICKUP_STATUSES.includes(status as PickupStatus) ? status as PickupStatus : "planned", contactName: text(form, "contactName"), contactPhone: text(form, "contactPhone"), addressLine1: text(form, "addressLine1"), addressLine2: text(form, "addressLine2"), city: text(form, "city"), state: text(form, "state"), postalCode: text(form, "postalCode"), accessInstructions: text(form, "accessInstructions"), estateDescription: text(form, "estateDescription"), estimatedLoadSize: text(form, "estimatedLoadSize"), estimatedSmallsPercent: text(form, "estimatedSmallsPercent"), estimatedLargePercent: text(form, "estimatedLargePercent"), estimatedOutdoorPercent: text(form, "estimatedOutdoorPercent"), internalNotes: text(form, "internalNotes"), assignedUserIds: [...new Set(form.getAll("assignedUserIds").map(Number).filter((id) => Number.isInteger(id) && id > 0))] };
}

export function validatePickup(input: PickupInput) {
  const errors: string[] = [];
  if (!Number.isInteger(input.customerId) || input.customerId < 1) errors.push("Choose an existing customer.");
  if (!input.title) errors.push("Pickup title is required.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.pickupDate)) errors.push("Choose a valid pickup date.");
  if (input.arrivalTime && !/^\d{2}:\d{2}$/.test(input.arrivalTime)) errors.push("Choose a valid arrival time.");
  if (input.estimatedDurationMinutes && (!/^\d+$/.test(input.estimatedDurationMinutes) || Number(input.estimatedDurationMinutes) < 1)) errors.push("Estimated duration must be a positive number of minutes.");
  if (!input.contactName) errors.push("Contact name is required.");
  if (!input.contactPhone) errors.push("Contact phone is required.");
  if (!input.addressLine1 || !input.city || !input.state || !input.postalCode) errors.push("Pickup address, city, state, and ZIP are required.");
  const percentages = [input.estimatedSmallsPercent, input.estimatedLargePercent, input.estimatedOutdoorPercent];
  if (percentages.some((value) => !/^\d+$/.test(value) || Number(value) > 100)) errors.push("Load percentages must be whole numbers from 0 to 100.");
  else if (percentages.reduce((sum, value) => sum + Number(value), 0) !== 100) errors.push("Smalls, Large/Furniture, and Outdoor estimates must total 100%.");
  return errors;
}

export async function getAssignablePickupStaff(db: D1Database) {
  const { results } = await db.prepare(`SELECT DISTINCT u.id, COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS name, u.email
    FROM users u JOIN user_roles r ON r.user_id = u.id WHERE u.active = 1 AND r.role IN ('employee', 'manager', 'admin') ORDER BY name COLLATE NOCASE`).all<{ id: number; name: string; email: string }>();
  return results;
}

export async function validatePickupAssignments(db: D1Database, assignedUserIds: number[]) {
  if (!assignedUserIds.length) return [];
  const staff = await getAssignablePickupStaff(db);
  const allowed = new Set(staff.map((member) => member.id));
  return assignedUserIds.some((id) => !allowed.has(id)) ? ["Assigned staff must be active internal employees, managers, or administrators."] : [];
}

export async function savePickup(db: D1Database, input: PickupInput, createdByUserId: number, pickupId?: number) {
  const previous = pickupId ? await db.prepare("SELECT pickup_date AS pickupDate, arrival_time AS arrivalTime, status, notification_revision AS notificationRevision FROM consignment_pickups WHERE id=?").bind(pickupId).first<PickupSchedule>() : null;
  if (pickupId && !previous) throw new Response("Not Found", { status: 404 });
  const values = [input.customerId, input.title, input.pickupDate, input.arrivalTime || null, input.estimatedDurationMinutes ? Number(input.estimatedDurationMinutes) : null, input.status, input.contactName, input.contactPhone, input.addressLine1, input.addressLine2 || null, input.city, input.state, input.postalCode, input.accessInstructions || null, input.estateDescription || null, input.estimatedLoadSize || null, Number(input.estimatedSmallsPercent), Number(input.estimatedLargePercent), Number(input.estimatedOutdoorPercent), input.internalNotes || null] as const;
  let id = pickupId;
  if (id) { const result = await db.prepare(`UPDATE consignment_pickups SET user_id=?, title=?, pickup_date=?, arrival_time=?, estimated_duration_minutes=?, status=?, contact_name=?, contact_phone=?, address_line1=?, address_line2=?, city=?, state=?, postal_code=?, access_instructions=?, estate_description=?, estimated_load_size=?, estimated_smalls_percent=?, estimated_large_percent=?, estimated_outdoor_percent=?, internal_notes=?, updated_at=CURRENT_TIMESTAMP, notification_revision=notification_revision+1 WHERE id=? AND notification_revision=?`).bind(...values, id, previous!.notificationRevision).run();
    if (!result.meta.changes) throw new Response("Pickup changed. Reload and try again.", { status: 409 });
  }
  else { const result = await db.prepare(`INSERT INTO consignment_pickups (user_id,title,pickup_date,arrival_time,estimated_duration_minutes,status,contact_name,contact_phone,address_line1,address_line2,city,state,postal_code,access_instructions,estate_description,estimated_load_size,estimated_smalls_percent,estimated_large_percent,estimated_outdoor_percent,internal_notes,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values, createdByUserId).run(); id = Number(result.meta.last_row_id); }
  await db.batch([db.prepare("DELETE FROM consignment_pickup_assignments WHERE pickup_id = ?").bind(id), ...input.assignedUserIds.map((userId) => db.prepare("INSERT INTO consignment_pickup_assignments (pickup_id, user_id, assigned_by_user_id) VALUES (?, ?, ?)").bind(id, userId, createdByUserId))]);
  await safelyQueuePickupNotifications(db, id!, input, previous, createdByUserId);
  return id!;
}
function text(form: FormData, name: string) { return String(form.get(name) ?? "").trim(); }
