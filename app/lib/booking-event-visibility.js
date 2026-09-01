export const CUSTOMER_BOOKING_TIMEZONE = "America/New_York";

/** @param {Date} date @param {string} [timezone] */
export function calendarDateInTimezone(date, timezone = CUSTOMER_BOOKING_TIMEZONE) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}

/**
 * Customer listings expire at New York midnight after the calendar day containing
 * signup close, or signup open when no close time exists.
 * @param {{ opensAt: Date; closesAt?: Date | null }} event
 * @param {Date} [now]
 */
export function isCustomerBookingEventVisible(event, now = new Date()) {
  const expirationDate = calendarDateInTimezone(event.closesAt ?? event.opensAt);
  return calendarDateInTimezone(now) <= expirationDate;
}

/** @param {{ opensAt: Date | null; closesAt?: Date | null; active?: boolean }} event @param {Date} [now] */
export function customerBookingEventSignupStatus(event, now = new Date()) {
  if (event.active === false || !event.opensAt) return "inactive";
  if (now < event.opensAt) return "upcoming";
  if (event.closesAt && now >= event.closesAt) return "closed";
  return "open";
}

/** @param {{ opensAt: Date | null; closesAt?: Date | null; active?: boolean }} event @param {Date} [now] */
export function isCustomerBookingEventBookable(event, now = new Date()) {
  return customerBookingEventSignupStatus(event, now) === "open";
}

/**
 * The public availability of a child Drop-Off Date is derived from its parent
 * Booking Event window. `operationallyEnabled` is the child's independent
 * staff-controlled closure switch; it is not a second signup-window switch.
 * Capacity and customer-specific eligibility are supplied by the callers that
 * have the relevant data.
 *
 * @param {{ opensAt: Date | null; closesAt?: Date | null; active?: boolean; visibility?: "public" | "private"; operationallyEnabled?: boolean; capacityAvailable?: boolean }} date
 * @param {Date} [now]
 */
export function getEffectivePublicDropoffDateAvailability(date, now = new Date()) {
  const bookingEventStatus = customerBookingEventSignupStatus(date, now);
  const isPublic = date.visibility === "public";
  const operationallyEnabled = date.operationallyEnabled !== false;
  const capacityAvailable = date.capacityAvailable !== false;
  return {
    bookingEventStatus,
    bookable:
      isPublic &&
      bookingEventStatus === "open" &&
      operationallyEnabled &&
      capacityAvailable,
  };
}
