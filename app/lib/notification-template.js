import { CUSTOMER_PICKUP_TEMPLATE_TYPES } from "./customer-pickup-template.js";
export const TEMPLATE_PLACEHOLDERS = ["first_name", "last_name", "appointment_date", "appointment_link", "event_name", "load_type", "business_name", "business_phone", "business_address", "customerName", "consignorNumber", "pickupTitle", "pickupDate", "pickupTime", "pickupAddress", "contactName", "contactPhone", "estimatedLoad", "estimatedSmalls", "estimatedLargeFurniture", "estimatedOutdoor", "pickupUrl", "adminPickupUrl", "customerAppointmentsUrl", "previousPickupDate", "previousPickupTime", "actorName", "completedAt"];
export const TEMPLATE_TYPES = ["confirmation", "rescheduled", "cancelled", "waitlisted", "waitlist_confirmed", "waitlist_cancelled", "reminder_1", "reminder_2", "pickup_created", "pickup_rescheduled", "pickup_cancelled", "pickup_completed", ...CUSTOMER_PICKUP_TEMPLATE_TYPES];

/** @param {string} value */
export function formatNotificationLabel(value) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** @param {string} value */
export function unknownTemplatePlaceholders(value) {
  return [...value.matchAll(/{{\s*([^{}\s]+)\s*}}/g)].map(match => match[1]).filter(name => !TEMPLATE_PLACEHOLDERS.includes(name));
}

/**
 * Older saved messages sometimes prefix a full-URL placeholder with an origin.
 * Remove only that redundant origin; retain the surrounding custom message.
 * All approved *_link and *Url variables represent complete usable URLs.
 * @param {string} value
 */
export function normalizeTemplateLinks(value) {
  return value.replace(/https?:\/\/[a-z0-9.-]+(?::\d+)?\/({{\s*([^{}\s]+)\s*}})/gi, (match, placeholder, name) =>
    TEMPLATE_PLACEHOLDERS.includes(name) && (name.endsWith("_link") || name.endsWith("Url")) ? placeholder : match);
}

/** @param {string} value @param {Record<string, string>} context */
export function renderTemplateText(value, context) {
  return normalizeTemplateLinks(value).replace(/{{\s*([^{}\s]+)\s*}}/g, (_match, name) => context[name] ?? "").replace(/\\n/g, "\n");
}
