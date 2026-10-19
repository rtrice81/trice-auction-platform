import { dropoffDateStatus } from "../lib/booking-event-archive.js";
import { customerPickupStatusLabel } from "../lib/consignment-pickup-status";

type DropoffRow = { id: number; appointmentDate: string; status: string; loadType: string; eventName: string | null; visibility: "public" | "private" | null };
type PickupRow = {
  id: number; appointmentDate: string; title: string; arrivalTime: string | null; status: string;
  addressLine1: string; addressLine2: string | null; city: string; state: string; postalCode: string;
  contactName: string; contactPhone: string; description: string | null;
};

// Explicit customer projection: never select staff assignments, access instructions,
// internal notes, load estimates, audit data or other operational metadata.
const customerPickupColumns = `id, pickup_date AS appointmentDate, title, arrival_time AS arrivalTime, status,
  address_line1 AS addressLine1, address_line2 AS addressLine2, city, state, postal_code AS postalCode,
  contact_name AS contactName, contact_phone AS contactPhone, estate_description AS description`;

export type CustomerAppointment =
  | (DropoffRow & { kind: "dropoff"; dateStatus: "upcoming" | "past" })
  | (PickupRow & { kind: "pickup"; dateStatus: "upcoming" | "past" });

export async function getCustomerAppointments(db: D1Database, userId: number, view: "upcoming" | "past", now = new Date()): Promise<CustomerAppointment[]> {
  const [dropoffs, pickups] = await Promise.all([
    db.prepare(`SELECT a.id, a.appointment_date AS appointmentDate, a.status, d.name AS loadType,
      day.event_name AS eventName, day.visibility FROM appointments a JOIN dropoff_types d ON d.id=a.dropoff_type_id
      LEFT JOIN dropoff_days day ON day.dropoff_date=a.appointment_date WHERE a.user_id=?`).bind(userId).all<DropoffRow>(),
    db.prepare(`SELECT ${customerPickupColumns} FROM consignment_pickups WHERE user_id=?`).bind(userId).all<PickupRow>(),
  ]);
  const appointments: CustomerAppointment[] = [
    ...dropoffs.results.map(appointment => ({ ...appointment, kind: "dropoff" as const, dateStatus: dropoffDateStatus(appointment.appointmentDate, now) })),
    ...pickups.results.map(appointment => ({ ...appointment, status: customerPickupStatusLabel(appointment.status), kind: "pickup" as const, dateStatus: dropoffDateStatus(appointment.appointmentDate, now) })),
  ];
  return appointments.filter(appointment => appointment.dateStatus === view).sort((left, right) => {
    const comparison = left.appointmentDate.localeCompare(right.appointmentDate) || left.id - right.id || left.kind.localeCompare(right.kind);
    return view === "past" ? -comparison : comparison;
  });
}

export async function getCustomerPickup(db: D1Database, userId: number, pickupId: number) {
  if (!Number.isSafeInteger(pickupId) || pickupId < 1) return null;
  // Ownership is part of the query, including for staff using this customer route.
  const pickup = await db.prepare(`SELECT ${customerPickupColumns} FROM consignment_pickups WHERE id=? AND user_id=?`)
    .bind(pickupId, userId).first<PickupRow>();
  return pickup ? { ...pickup, status: customerPickupStatusLabel(pickup.status) } : null;
}
