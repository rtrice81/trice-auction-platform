import assert from "node:assert/strict";
import test from "node:test";
import { reminderOffsetMinutes, reminderParts } from "../app/lib/notification-reminder.js";

test("reminder settings save unit selections as scheduler minute offsets", () => {
  assert.equal(reminderOffsetMinutes(3, "days"), 4320);
  assert.equal(reminderOffsetMinutes(12, "hours"), 720);
  assert.equal(reminderOffsetMinutes(15, "minutes"), 15);
});

test("reminder card presents saved minute offsets in a readable unit", () => {
  assert.deepEqual(reminderParts(10080), { amount: 7, unit: "days" });
  assert.deepEqual(reminderParts(1440), { amount: 1, unit: "days" });
  assert.deepEqual(reminderParts(90), { amount: 90, unit: "minutes" });
});
