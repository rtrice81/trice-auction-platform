export const CUSTOMER_PICKUP_TEMPLATE_TYPES = ["customer_pickup_created", "customer_pickup_rescheduled", "customer_pickup_cancelled", "customer_pickup_completed"];
export const CUSTOMER_PICKUP_PLACEHOLDERS = ["customerName", "pickupTitle", "pickupDate", "pickupTime", "pickupAddress", "contactName", "contactPhone", "previousPickupDate", "previousPickupTime", "customerAppointmentsUrl"];

/** @param {string} value */
export function validateCustomerPickupTemplate(value) {
  const names = [...value.matchAll(/{{\s*([^{}\s]+)\s*}}/g)].map(match => match[1]);
  if (names.some(name => !CUSTOMER_PICKUP_PLACEHOLDERS.includes(name)) || /\/admin(?:\/|\b)/i.test(value)) {
    return "Customer pickup templates must use customer-safe fields and {{customerAppointmentsUrl}}; admin links and internal fields are not allowed.";
  }
  return null;
}

/** @type {Array<{notificationType: string, channel: "email", subject: string, body: string}>} */
export const CUSTOMER_PICKUP_DEFAULT_TEMPLATES = [
  {
    notificationType: "customer_pickup_created", channel: "email",
    subject: "Your consignment pickup is scheduled",
    body: "Hello {{customerName}},\n\nWe've scheduled your consignment pickup with Trice Auctions. Please review the details below.\n\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\nArrival time: {{pickupTime}}\nPickup address: {{pickupAddress}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nPickup appointments are scheduled and managed by Trice Auctions. Please contact us if any changes are needed.\n\nThank you,\nTrice Auctions",
  },
  {
    notificationType: "customer_pickup_rescheduled", channel: "email",
    subject: "Your consignment pickup has been rescheduled",
    body: "Hello {{customerName}},\n\nThe date or arrival time for your consignment pickup has changed. Please review your updated appointment details.\n\nPickup: {{pickupTitle}}\nNew date: {{pickupDate}}\nNew arrival time: {{pickupTime}}\nPickup address: {{pickupAddress}}\n\nPrevious date: {{previousPickupDate}}\nPrevious arrival time: {{previousPickupTime}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nPickup appointments are scheduled and managed by Trice Auctions. Please contact us if you have questions or need further changes.\n\nThank you,\nTrice Auctions",
  },
  {
    notificationType: "customer_pickup_cancelled", channel: "email",
    subject: "Your consignment pickup has been cancelled",
    body: "Hello {{customerName}},\n\nYour consignment pickup has been cancelled.\n\nPickup: {{pickupTitle}}\nPreviously scheduled date: {{pickupDate}}\nPreviously scheduled arrival time: {{pickupTime}}\nPickup address: {{pickupAddress}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nIf you have questions or would like to discuss scheduling another pickup, please contact Trice Auctions.\n\nThank you,\nTrice Auctions",
  },
  {
    notificationType: "customer_pickup_completed", channel: "email",
    subject: "Your consignment pickup is complete",
    body: "Hello {{customerName}},\n\nYour consignment pickup is complete. Thank you for choosing Trice Auctions.\n\nPickup: {{pickupTitle}}\nDate: {{pickupDate}}\n\nView your appointment: {{customerAppointmentsUrl}}\n\nPlease contact us if you have any questions about your pickup.\n\nThank you,\nTrice Auctions",
  },
];

/** @param {string} type @param {{subject: string | null, body: string} | null | undefined} saved */
export function customerPickupTemplateWithDefaults(type, saved) {
  const defaults = CUSTOMER_PICKUP_DEFAULT_TEMPLATES.find(template => template.notificationType === type);
  if (!defaults) return saved;
  return { subject: saved?.subject?.trim() ? saved.subject : defaults.subject, body: saved?.body?.trim() ? saved.body : defaults.body };
}
