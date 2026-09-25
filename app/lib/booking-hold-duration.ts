export const DEFAULT_BOOKING_HOLD_DURATION_MINUTES = 15;
export const MIN_BOOKING_HOLD_DURATION_MINUTES = 5;
export const MAX_BOOKING_HOLD_DURATION_MINUTES = 60;

export function validateBookingHoldDuration(value: unknown): number | null {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= MIN_BOOKING_HOLD_DURATION_MINUTES && minutes <= MAX_BOOKING_HOLD_DURATION_MINUTES ? minutes : null;
}
