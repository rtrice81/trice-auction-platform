export const TEMPLATE_PLACEHOLDERS = ["first_name", "last_name", "appointment_date", "appointment_time", "appointment_link", "event_name", "load_type", "business_name", "business_phone", "business_address"];
export const TEMPLATE_TYPES = ["confirmation", "rescheduled", "cancelled", "reminder_1", "reminder_2"];

/** @param {string} value */
export function unknownTemplatePlaceholders(value) {
  return [...value.matchAll(/{{\s*([^{}\s]+)\s*}}/g)].map(match => match[1]).filter(name => !TEMPLATE_PLACEHOLDERS.includes(name));
}

/** @param {string} value @param {Record<string, string>} context */
export function renderTemplateText(value, context) {
  return value.replace(/{{\s*([^{}\s]+)\s*}}/g, (_match, name) => context[name] ?? "").replace(/\\n/g, "\n");
}
