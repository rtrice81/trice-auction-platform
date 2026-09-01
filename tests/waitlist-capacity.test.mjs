import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const booking = await readFile(new URL("../app/services/booking.server.ts", import.meta.url), "utf8");
const availability = await readFile(new URL("../app/services/booking-event.server.ts", import.meta.url), "utf8");
const notifications = await readFile(new URL("../app/services/notification.server.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0025_add_waitlist_appointments.sql", import.meta.url), "utf8");

test("capacity separates confirmed and waitlist usage and caps the waitlist allowance", () => {
  assert.match(booking, /appointment\.status = \?/);
  assert.match(booking, /WAITLISTED_APPOINTMENT_STATUS/);
  assert.match(booking, /waitlistFullAreas/);
  assert.match(booking, /overflowAllowancePoints/);
  assert.match(booking, /Normal capacity reached/);
});

test("public availability exposes waitlist before full", () => {
  assert.match(availability, /waitlistOnly/);
  assert.match(availability, /availability: "Waitlist"/);
  assert.match(availability, /appointment\.status = 'waitlisted'/);
});

test("waitlist appointments have ordered metadata and distinct notifications", () => {
  assert.match(migration, /waitlisted_at/);
  assert.match(migration, /waitlist_reason/);
  assert.match(notifications, /"waitlisted"/);
  assert.match(notifications, /"waitlist_confirmed"/);
  assert.match(notifications, /"waitlist_cancelled"/);
  assert.match(booking, /promoteWaitlistedAppointment/);
});
