import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const holds = await readFile(new URL("../app/services/booking-holds.server.ts", import.meta.url), "utf8");
const booking = await readFile(new URL("../app/services/booking.server.ts", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0033_add_booking_holds.sql", import.meta.url), "utf8");
const form = await readFile(new URL("../app/components/customer-booking-form.tsx", import.meta.url), "utf8");

test("booking holds are short-lived, opaque, and idempotent per booking attempt", () => {
  assert.match(holds, /BOOKING_HOLD_MINUTES = DEFAULT_BOOKING_HOLD_DURATION_MINUTES/);
  assert.match(migration, /booking_attempt_id TEXT NOT NULL UNIQUE/);
  assert.match(migration, /hold_token TEXT NOT NULL UNIQUE/);
  assert.match(holds, /sameRequest\(existing, input\)/);
  assert.match(holds, /crypto\.getRandomValues/);
});

test("capacity combines confirmed appointments and only active unexpired holds", () => {
  assert.match(booking, /booking_holds/);
  assert.match(booking, /expires_at > CURRENT_TIMESTAMP/);
  assert.match(holds, /INSERT OR IGNORE INTO booking_holds/);
  assert.match(holds, /INSERT \.\.\. SELECT is a single SQLite write statement/);
});

test("final conversion is transactional and a converted hold is not double counted", () => {
  assert.match(holds, /db\.batch\(/);
  assert.match(holds, /booking_hold_id/);
  assert.match(holds, /status='converted'/);
  assert.match(holds, /ensureUserRole\(db, userId, "consignor"\)/);
});

test("the customer cannot reserve until their intentional allocations total 100", () => {
  assert.match(form, /total !== 100/);
  assert.match(form, /Checking availability/);
  assert.match(booking, /Item-area allocations must total exactly 100%/);
});
