import assert from "node:assert/strict";
import test from "node:test";
import { TEMPLATE_PLACEHOLDERS, normalizeTemplateLinks, renderTemplateText, unknownTemplatePlaceholders } from "../app/lib/notification-template.js";
import { getAppointmentUrl, getNotificationBaseUrl } from "../app/lib/notification-url.js";

test("notification templates render only whitelisted appointment values", () => {
  assert.equal(renderTemplateText("Hi {{first_name}} — {{appointment_link}}", { first_name: "Alex", appointment_link: "https://example.test/my-appointments/7" }), "Hi Alex — https://example.test/my-appointments/7");
});

test("unknown notification template placeholders are detected", () => {
  assert.deepEqual(unknownTemplatePlaceholders("Hi {{first_name}} {{unsafe_code}}"), ["unsafe_code"]);
});

test("appointment time is no longer a supported notification placeholder", () => {
  assert.deepEqual(unknownTemplatePlaceholders("Scheduled {{appointment_date}} at {{appointment_time}}"), ["appointment_time"]);
});

const productionUrl = "https://consign.bidtrice.com/my-appointments/123";

test("appointment links are absolute and use the configured application URL", () => {
  assert.equal(getAppointmentUrl(123, { APP_BASE_URL: "https://consign.bidtrice.com/" }), productionUrl);
  assert.equal(getAppointmentUrl(123, { BETTER_AUTH_URL: "https://consign.bidtrice.com" }), productionUrl);
  assert.equal(getAppointmentUrl(123, { APP_BASE_URL: "https://consign.bidtrice.com", BETTER_AUTH_URL: "https://trice-auction-platform.auctioneer-80b.workers.dev" }, "https://trice-auction-platform.auctioneer-80b.workers.dev/admin/notifications"), productionUrl);
  assert.equal(renderTemplateText("{{appointment_link}}", { appointment_link: productionUrl }), productionUrl);
});

test("local previews use their application URL without an example.com fallback", () => {
  assert.equal(getAppointmentUrl(123, { BETTER_AUTH_URL: "http://127.0.0.1:5173" }), "http://127.0.0.1:5173/my-appointments/123");
  assert.equal(getAppointmentUrl(123, {}, "http://localhost:5173/admin/notifications"), "http://localhost:5173/my-appointments/123");
  assert.equal(getAppointmentUrl(123, { BETTER_AUTH_URL: "https://consign.bidtrice.com" }, "https://worker.example.test/admin/notifications"), productionUrl);
});

test("scheduled notifications require usable absolute URL configuration", () => {
  for (const env of [{}, { APP_BASE_URL: "/relative" }, { APP_BASE_URL: "javascript:alert(1)" }]) {
    assert.throws(() => getNotificationBaseUrl(env), /Configure APP_BASE_URL or BETTER_AUTH_URL/);
  }
});

test("legacy prefixed placeholders never duplicate the full appointment URL", () => {
  for (const prefix of ["https://consign.bidtrice.com/", "https://example.com/", "http://localhost:5173/"]) {
    const template = `Custom message: ${prefix}{{appointment_link}}\nThank you!`;
    assert.equal(normalizeTemplateLinks(template), "Custom message: {{appointment_link}}\nThank you!");
    assert.equal(renderTemplateText(template, { appointment_link: productionUrl }), `Custom message: ${productionUrl}\nThank you!`);
  }
  assert.equal(renderTemplateText("https://consign.bidtrice.com/{{ appointment_link }}", { appointment_link: productionUrl }), productionUrl);
});

test("normalization preserves unrelated custom text, URLs, and placeholders", () => {
  const template = "Visit https://consign.bidtrice.com/help. Hi {{first_name}}. View {{appointment_link}}. https://other.test/{{unsafe_link}}";
  assert.equal(normalizeTemplateLinks(template), template);
  assert.equal(normalizeTemplateLinks(normalizeTemplateLinks("https://consign.bidtrice.com/{{appointment_link}}")), "{{appointment_link}}");
});

test("every supported link variable has a full usable sample URL", () => {
  const links = TEMPLATE_PLACEHOLDERS.filter(name => name.endsWith("_link"));
  const context = { appointment_link: getAppointmentUrl(123, { BETTER_AUTH_URL: "https://consign.bidtrice.com" }) };
  for (const name of links) {
    assert.equal(new URL(context[name]).protocol, "https:");
    assert.equal(renderTemplateText(`{{${name}}}`, context), context[name]);
  }
});
