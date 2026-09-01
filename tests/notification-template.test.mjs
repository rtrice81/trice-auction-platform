import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplateText, unknownTemplatePlaceholders } from "../app/lib/notification-template.js";

test("notification templates render only whitelisted appointment values", () => {
  assert.equal(renderTemplateText("Hi {{first_name}} — {{appointment_link}}", { first_name: "Alex", appointment_link: "https://example.test/my-appointments/7" }), "Hi Alex — https://example.test/my-appointments/7");
});

test("unknown notification template placeholders are detected", () => {
  assert.deepEqual(unknownTemplatePlaceholders("Hi {{first_name}} {{unsafe_code}}"), ["unsafe_code"]);
});

test("appointment time is no longer a supported notification placeholder", () => {
  assert.deepEqual(unknownTemplatePlaceholders("Scheduled {{appointment_date}} at {{appointment_time}}"), ["appointment_time"]);
});
