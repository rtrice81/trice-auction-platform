import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scheduleDetail = await readFile(new URL("../app/routes/admin.schedule.detail.tsx", import.meta.url), "utf8");
const schedule = await readFile(new URL("../app/routes/admin.schedule.tsx", import.meta.url), "utf8");
const labels = await readFile(new URL("../app/lib/appointment-status.ts", import.meta.url), "utf8");

test("schedule status filters retain scroll position while preserving their query-string navigation", () => {
  assert.match(scheduleDetail, /to=\{`\/admin\/schedule\/\$\{event\.id\}\?status=\$\{status\}`\} preventScrollReset/);
  assert.match(scheduleDetail, /APPOINTMENT_STATUS_FILTERS\.map/);
  assert.doesNotMatch(scheduleDetail, /replace\s*=/);
  assert.match(schedule, /visibility=public" preventScrollReset/);
});

test("appointment status labels are title-cased without changing their internal values", () => {
  assert.match(labels, /checked_in: "Checked In"/);
  assert.match(labels, /no_show: "No Show"/);
  assert.match(labels, /last_minute_cancelled: "Last-Minute Cancelled"/);
  assert.match(labels, /formatAppointmentStatusLabel/);
});
