import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const bookingEventForm = await readFile(new URL("../app/routes/admin.booking-events.new.tsx", import.meta.url), "utf8");
const bookingEventCard = await readFile(new URL("../app/components/booking-event-card.tsx", import.meta.url), "utf8");
const dropoffForm = await readFile(new URL("../app/components/dropoff-event-form.tsx", import.meta.url), "utf8");
const dropoffService = await readFile(new URL("../app/services/schedule-management.server.ts", import.meta.url), "utf8");
const bookingEventService = await readFile(new URL("../app/services/booking-event.server.ts", import.meta.url), "utf8");
const dropoffCard = await readFile(new URL("../app/components/dropoff-event-card.tsx", import.meta.url), "utf8");
const bookingPage = await readFile(new URL("../app/routes/dropoffs.book.tsx", import.meta.url), "utf8");
const migration = await readFile(new URL("../migrations/0027_add_customer_facing_dropoff_date_description.sql", import.meta.url), "utf8");

test("Booking Event descriptions are admin-editable and only render publicly when meaningful", () => {
  assert.match(bookingEventForm, /Description .*customer-facing/);
  assert.match(bookingEventForm, /textarea name="description"/);
  assert.match(bookingEventForm, /adminNotes/);
  assert.match(bookingEventCard, /bookingEvent\.description\?\.trim\(\)/);
  assert.match(bookingEventCard, /whitespace-pre-wrap/);
});

test("Drop-Off Date descriptions are stored separately from internal notes and shown on public date views", () => {
  assert.match(migration, /ALTER TABLE dropoff_days ADD COLUMN description TEXT/);
  assert.match(dropoffForm, /Description .*customer-facing/);
  assert.match(dropoffForm, /textarea name="description"/);
  assert.match(dropoffForm, /Admin note/);
  assert.match(dropoffService, /description: String\(form\.get\("description"\)/);
  assert.match(dropoffService, /description, visibility/);
  assert.match(dropoffService, /input\.description\.trim\(\) \|\| null/);
  assert.match(bookingEventService, /day\.description AS eventDescription/);
  assert.match(dropoffCard, /event\.description\?\.trim\(\)/);
  assert.match(bookingPage, /event\.description\?\.trim\(\)/);
});
