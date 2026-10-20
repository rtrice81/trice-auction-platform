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
