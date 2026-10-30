/** Convert confirmed storage capacity into a customer-safe availability indicator. */
export function customerStorageAvailability(id: number, name: string, used: number, capacity: number) {
  const full = capacity <= 0 || used >= capacity;
  // A nonzero remainder must never display as 0% while the booking form allows it.
  const remainingPercent = full ? 0 : Math.max(1, Math.min(100, Math.floor((capacity - Math.max(0, used)) / capacity * 100)));
  return { id, name, full, remainingPercent };
}
