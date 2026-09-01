import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = await Promise.all([
  "app/services/booking.server.ts",
  "app/components/customer-booking-form.tsx",
  "app/routes/my-appointments.detail.tsx",
  "app/routes/admin.appointments.new.tsx",
  "app/routes/manager.detail.tsx",
  "app/routes/employee.tsx",
  "app/routes/employee.detail.tsx",
  "app/routes/admin.appointments.tsx",
  "app/routes/admin.appointments.detail.tsx",
  "app/services/schedule-management.server.ts",
  "app/services/notification.server.ts",
].map((file) => readFile(new URL(`../${file}`, import.meta.url), "utf8")));

test("active appointment workflows neither request nor persist appointment times", () => {
  for (const source of files) {
    assert.doesNotMatch(source, /appointment_time|appointmentTime|Time TBD/);
  }
});

test("booking continues to validate capacity and public signup availability", () => {
  const bookingService = files[0];
  assert.match(bookingService, /getBookableBookingEventForDate/);
  assert.match(bookingService, /getEffectiveDateCapacity/);
  assert.match(bookingService, /monthlyBookingLimit/);
});
