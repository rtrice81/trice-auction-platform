import type { PickupInput } from "./consignment-pickups.server";

import { PICKUP_NOTIFICATION_TYPES } from "../lib/pickup-notification-types";
export { PICKUP_NOTIFICATION_TYPES } from "../lib/pickup-notification-types";
export type PickupNotificationType = typeof PICKUP_NOTIFICATION_TYPES[number];
export type PickupSchedule = { pickupDate: string; arrivalTime: string | null; status: string; notificationRevision: number };
export type PickupNotificationPayload = {
  pickupId: number; current: PickupInput; previous: PickupSchedule | null;
  customerName: string; consignorNumber: string | null; actorName: string; occurredAt: string;
};

export function pickupNotificationEvents(previous: PickupSchedule | null, current: PickupInput): PickupNotificationType[] {
  if (!previous) return ["pickup_created"];
  const events: PickupNotificationType[] = [];
  if (current.status === "cancelled" && previous.status !== "cancelled") events.push("pickup_cancelled");
  if (current.status === "completed" && previous.status !== "completed") events.push("pickup_completed");
  if (previous.pickupDate !== current.pickupDate || (previous.arrivalTime || "") !== current.arrivalTime) events.push("pickup_rescheduled");
  return events;
}

// Called only after the primary write. No customer preferences or customer email
// are consulted: this audience is exclusively configured internal recipients.
export async function safelyQueuePickupNotifications(db: D1Database, pickupId: number, current: PickupInput, previous: PickupSchedule | null, actorId: number) {
  const events = pickupNotificationEvents(previous, current);
  if (!events.length) return;
  try {
    const { results: settings } = await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'notifications.%'").all<{ key: string; value: string }>();
    const enabled = Object.fromEntries(settings.map(item => [item.key, item.value]));
    if (enabled["notifications.email_enabled"] === "0") return;
    const customer = await db.prepare(`SELECT COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS customerName, consignor_id AS consignorNumber FROM users WHERE id=?`).bind(current.customerId).first<{ customerName: string; consignorNumber: string | null }>();
    const actor = await db.prepare("SELECT COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS name FROM users WHERE id=?").bind(actorId).first<{ name: string }>();
    if (!customer) throw new Error("Pickup customer unavailable");
    const payload: PickupNotificationPayload = { pickupId, current, previous, ...customer, actorName: actor?.name || "Administrator", occurredAt: new Date().toISOString() };
    const revision = previous ? previous.notificationRevision + 1 : 0;
    for (const event of events) {
      if (enabled[`notifications.${event}_enabled`] === "0") continue;
      // event is selected from the fixed allowlist above, never from user input.
      const subscription = `receive_${event}`;
      const { results } = await db.prepare(`SELECT label,email FROM appointment_notification_recipients WHERE active=1 AND ${subscription}=1`).all<{ label: string; email: string }>();
      if (!results.length) continue;
      await db.batch(results.map(recipient => db.prepare(`INSERT INTO notification_jobs(idempotency_key,notification_type,channel,recipient,payload_json,scheduled_at)
        VALUES(?,?,'email',?,?,CURRENT_TIMESTAMP) ON CONFLICT(idempotency_key) DO NOTHING`).bind(
          `${event}:${pickupId}:${revision}:${recipient.email}`, event, recipient.email, JSON.stringify({ ...payload, recipientLabel: recipient.label }),
        )));
    }
  } catch {
    // Provider/database errors can contain credentials or personal data.
    console.error("Pickup notification queue failed", { pickupId, events });
  }
}

export function pickupTemplateContext(payload: PickupNotificationPayload, baseUrl: string): Record<string, string> {
  const { current: p, previous } = payload;
  const date = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "long" }).format(new Date(`${value}T12:00:00Z`));
  // Pickup date/time fields are local wall-clock values in America/New_York.
  // Format the clock without parsing it in the host's timezone or shifting DST.
  const time = (value: string | null) => {
    if (!value) return "Not specified";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"} (America/New_York)`;
  };
  return {
    customerName: payload.customerName, consignorNumber: payload.consignorNumber || "Not provided",
    pickupTitle: p.title, pickupDate: date(p.pickupDate), pickupTime: time(p.arrivalTime),
    pickupAddress: [p.addressLine1, p.addressLine2, `${p.city}, ${p.state} ${p.postalCode}`].filter(Boolean).join(", "),
    contactName: p.contactName, contactPhone: p.contactPhone, estimatedLoad: p.estimatedLoadSize || "Not specified",
    estimatedSmalls: `${p.estimatedSmallsPercent}%`, estimatedLargeFurniture: `${p.estimatedLargePercent}%`, estimatedOutdoor: `${p.estimatedOutdoorPercent}%`,
    previousPickupDate: previous ? date(previous.pickupDate) : "", previousPickupTime: previous ? time(previous.arrivalTime) : "",
    actorName: payload.actorName,
    completedAt: new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "long", timeStyle: "long" }).format(new Date(payload.occurredAt)),
    pickupUrl: new URL(`/admin/pickups/${payload.pickupId}`, baseUrl).href,
  };
}
