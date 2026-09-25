export const DEFAULT_BOOKING_HOLD_DURATION_MINUTES = 15;
export const MIN_BOOKING_HOLD_DURATION_MINUTES = 5;
export const MAX_BOOKING_HOLD_DURATION_MINUTES = 60;
export const BOOKING_HOLD_DURATION_OPTIONS = [5, 10, 15, 20, 30, 60] as const;

export function isBookingHoldDurationOption(value: number) {
  return (BOOKING_HOLD_DURATION_OPTIONS as readonly number[]).includes(value);
}

export function validateBookingHoldDuration(value: unknown): number | null {
  const minutes = Number(value);
  return Number.isInteger(minutes) && minutes >= MIN_BOOKING_HOLD_DURATION_MINUTES && minutes <= MAX_BOOKING_HOLD_DURATION_MINUTES ? minutes : null;
}
