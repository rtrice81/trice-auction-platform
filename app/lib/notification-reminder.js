/** @type {Record<string, number>} */
export const REMINDER_UNITS = { minutes: 1, hours: 60, days: 1440 };

/** @param {FormDataEntryValue | number | string | null} amount @param {string} unit */
export function reminderOffsetMinutes(amount, unit) {
  return Math.max(0, Math.floor(Number(amount) || 0)) * (REMINDER_UNITS[unit] || 1);
}

/** @param {number} minutes */
export function reminderParts(minutes) {
  const value = Math.max(0, Math.floor(Number(minutes) || 0));
  if (value > 0 && value % REMINDER_UNITS.days === 0) return { amount: value / REMINDER_UNITS.days, unit: "days" };
  if (value > 0 && value % REMINDER_UNITS.hours === 0) return { amount: value / REMINDER_UNITS.hours, unit: "hours" };
  return { amount: value, unit: "minutes" };
}
