import type { PickupInput } from "./consignment-pickups.server";
import { pickupNotificationEvents, type PickupSchedule, type PickupNotificationPayload } from "./internal-pickup-notifications.server";
import { customerPickupTemplateWithDefaults, CUSTOMER_PICKUP_TEMPLATE_TYPES, validateCustomerPickupTemplate } from "../lib/customer-pickup-template.js";
import { renderTemplateText } from "../lib/notification-template.js";
import { getNotificationBaseUrl } from "../lib/notification-url.js";

type CustomerPickupPayload = {
  pickupId: number; customerId: number; customerName: string;
  pickupTitle: string; pickupDate: string; pickupTime: string | null; pickupAddress: string;
  contactName: string; contactPhone: string; previousPickupDate: string | null; previousPickupTime: string | null;
};

function customerPayload(pickupId: number, p: PickupInput, previous: PickupSchedule | null, customerName: string): CustomerPickupPayload {
  return { pickupId, customerId: p.customerId, customerName, pickupTitle: p.title, pickupDate: p.pickupDate, pickupTime: p.arrivalTime || null,
    pickupAddress: [p.addressLine1, p.addressLine2, `${p.city}, ${p.state} ${p.postalCode}`].filter(Boolean).join(", "),
    contactName: p.contactName, contactPhone: p.contactPhone, previousPickupDate: previous?.pickupDate ?? null, previousPickupTime: previous?.arrivalTime ?? null };
}

export async function safelyQueueCustomerPickupNotifications(db: D1Database, pickupId: number, current: PickupInput, previous: PickupSchedule | null) {
  const events = pickupNotificationEvents(previous, current);
  if (!events.length) return;
  try {
    const customer = await db.prepare(`SELECT u.email, COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), u.email) AS name,
      COALESCE(p.appointment_email_enabled, 1) AS emailEnabled FROM users u
      LEFT JOIN user_notification_preferences p ON p.user_id=u.id WHERE u.id=? AND u.active=1`)
      .bind(current.customerId).first<{ email: string; name: string; emailEnabled: number }>();
    if (!customer?.email || !customer.emailEnabled) return;
    const { results } = await db.prepare("SELECT key,value FROM settings WHERE key LIKE 'notifications.%'").all<{ key: string; value: string }>();
    const settings = Object.fromEntries(results.map(row => [row.key, row.value]));
    if (settings["notifications.email_enabled"] === "0") return;
    const payload = customerPayload(pickupId, current, previous, customer.name);
    const revision = previous ? previous.notificationRevision + 1 : 0;
    const statements = events.filter(event => settings[`notifications.${event}_enabled`] !== "0").map(event => db.prepare(
      `INSERT INTO notification_jobs(idempotency_key,user_id,notification_type,channel,recipient,payload_json,scheduled_at)
       VALUES(?,?,?,'email',?,?,CURRENT_TIMESTAMP) ON CONFLICT(idempotency_key) DO NOTHING`,
    ).bind(`customer_${event}:${pickupId}:${revision}:${customer.email}`, current.customerId, `customer_${event}`, customer.email, JSON.stringify(payload)));
    if (statements.length) await db.batch(statements);
  } catch {
    console.error("Customer pickup notification queue failed", { pickupId, events });
  }
}

export function customerPickupTemplateContext(payload: CustomerPickupPayload, env: { APP_BASE_URL?: string; BETTER_AUTH_URL?: string }, requestUrl?: string): Record<string, string> {
  const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "long" }).format(new Date(`${value}T12:00:00Z`)) : "";
  const time = (value: string | null) => {
    if (!value) return "To be arranged";
    const [hour, minute] = value.split(":").map(Number);
    return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"} (Eastern time)`;
  };
  return { customerName: payload.customerName, pickupTitle: payload.pickupTitle, pickupDate: date(payload.pickupDate), pickupTime: time(payload.pickupTime),
    pickupAddress: payload.pickupAddress, contactName: payload.contactName, contactPhone: payload.contactPhone,
    previousPickupDate: date(payload.previousPickupDate), previousPickupTime: time(payload.previousPickupTime),
    customerAppointmentsUrl: new URL("/my-appointments", getNotificationBaseUrl(env, requestUrl)).href };
}

export async function renderCustomerPickupEmail(db: D1Database, type: string, context: Record<string, string>) {
  if (!CUSTOMER_PICKUP_TEMPLATE_TYPES.includes(type)) throw new Error("Unsupported customer pickup notification.");
  const saved = await db.prepare("SELECT subject,body FROM notification_templates WHERE notification_type=? AND channel='email'").bind(type).first<{ subject: string | null; body: string }>();
  const template = customerPickupTemplateWithDefaults(type, saved);
  // An unsafe saved/legacy template must never turn into a customer email.
  if (!template || validateCustomerPickupTemplate(`${template.subject ?? ""}\n${template.body}`)) throw new Error("Customer pickup template is unavailable or unsafe.");
  const url = context.customerAppointmentsUrl;
  const safe = (text: string) => renderTemplateText(text, context).replace(/(?:https?:\/\/[^\s<>]*?)?\/admin\/[^\s<>]*/gi, url);
  const text = safe(template.body);
  return { subject: safe(template.subject || "Consignment Pickup"), text: text.includes(url) ? text : `${text}\n\nView your appointment: ${url}` };
}

// Also protects internal jobs queued before customer templates were introduced.
export async function renderQueuedPickupEmail(db: D1Database, job: { notification_type: string; recipient: string; user_id?: number | null }, payload: CustomerPickupPayload | PickupNotificationPayload, env: { APP_BASE_URL?: string; BETTER_AUTH_URL?: string }) {
  const customerJob = job.notification_type.startsWith("customer_pickup_");
  const customerId = customerJob ? (payload as CustomerPickupPayload).customerId : (payload as PickupNotificationPayload).current.customerId;
  const owner = await db.prepare(`SELECT p.user_id AS userId, u.email, u.active, COALESCE(pref.appointment_email_enabled,1) AS emailEnabled
    FROM consignment_pickups p JOIN users u ON u.id=p.user_id LEFT JOIN user_notification_preferences pref ON pref.user_id=u.id WHERE p.id=?`)
    .bind(payload.pickupId).first<{ userId: number; email: string; active: number; emailEnabled: number }>();
  const sameEmail = (email: string) => email.trim().toLowerCase() === job.recipient.trim().toLowerCase();
  const legacyCustomer = !customerJob && owner && sameEmail(owner.email);
  if (customerJob || legacyCustomer) {
    if (!owner || owner.userId !== customerId || !sameEmail(owner.email) || !owner.active || !owner.emailEnabled) return null;
    const safePayload = customerJob ? payload as CustomerPickupPayload : customerPayload(payload.pickupId, (payload as PickupNotificationPayload).current, (payload as PickupNotificationPayload).previous, (payload as PickupNotificationPayload).customerName);
    return renderCustomerPickupEmail(db, customerJob ? job.notification_type : `customer_${job.notification_type}`, customerPickupTemplateContext(safePayload, env));
  }
  // A configured recipient who is a different customer must not receive another
  // customer's pickup details. Explicit external internal recipients still work.
  const recipient = await db.prepare(`SELECT u.id FROM users u WHERE lower(trim(u.email))=lower(trim(?))
    AND NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id=u.id AND r.role IN ('admin','manager','employee'))`).bind(job.recipient).first();
  if (recipient) return null;
  return undefined; // Authorized internal recipient: use the internal template.
}
