import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../app/routes/admin.booking-events.tsx", import.meta.url), "utf8");

test("Booking Event card totals aggregate child dates while excluding cancelled appointments in SQL", () => {
  assert.match(route, /COALESCE\(SUM\(\(SELECT COUNT\(\*\) FROM appointments appointment WHERE appointment\.appointment_date = day\.dropoff_date AND appointment\.status <> 'cancelled'\)\), 0\) AS appointmentCount/);
  assert.match(route, /GROUP BY event\.id/);
  assert.match(route, /event\.appointmentCount\} appointment/);
});

test("a fresh Booking Events loader reflects cancellation and restoration without mutating appointment records", () => {
  assert.match(route, /appointment\.status <> 'cancelled'/);
  assert.doesNotMatch(route, /UPDATE appointments SET status/);
  assert.doesNotMatch(route, /DELETE FROM appointments/);
});
