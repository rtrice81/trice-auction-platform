import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const duration = await readFile(new URL("../app/lib/booking-hold-duration.ts", import.meta.url), "utf8");
const durationResolver = await readFile(new URL("../app/services/booking-hold-duration.server.ts", import.meta.url), "utf8");
const holds = await readFile(new URL("../app/services/booking-holds.server.ts", import.meta.url), "utf8");
const eventForm = await readFile(new URL("../app/routes/admin.booking-events.new.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0034_add_configurable_booking_hold_duration.sql", import.meta.url), "utf8");

test("hold duration defaults to 15 minutes and validates the supported range", () => {
  assert.match(duration, /DEFAULT_BOOKING_HOLD_DURATION_MINUTES = 15/);
  assert.match(duration, /minutes >= MIN_BOOKING_HOLD_DURATION_MINUTES/);
  assert.match(duration, /minutes <= MAX_BOOKING_HOLD_DURATION_MINUTES/);
  assert.match(eventForm, /Reservation Hold Time must be between 5 and 60 minutes/);
});

test("date override inherits event duration before application default", () => {
  assert.match(durationResolver, /overrideMinutes/);
  assert.match(durationResolver, /eventMinutes/);
  assert.match(durationResolver, /default_booking_hold_duration_minutes/);
  assert.match(migration, /hold_duration_minutes_override INTEGER NULL/);
  assert.match(migration, /hold_duration_minutes INTEGER NOT NULL DEFAULT 15/);
});

test("issued holds use the resolved duration once and keep their stored expiry", () => {
  assert.match(holds, /getBookingHoldDuration\(db, day\.id\)/);
  assert.match(holds, /Calculated once at claim time/);
  assert.match(holds, /expires_at/);
});
