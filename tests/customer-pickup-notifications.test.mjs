import assert from "node:assert/strict";
import test from "node:test";
import { fixture, moduleUrl } from "./helpers/booking-fixture.mjs";
import { CUSTOMER_PICKUP_TEMPLATE_TYPES, validateCustomerPickupTemplate } from "../app/lib/customer-pickup-template.js";
import { renderTemplateText } from "../app/lib/notification-template.js";

const pickups = await import(await moduleUrl(new URL("../app/services/consignment-pickups.server.ts", import.meta.url)));
const notifications = await import(await moduleUrl(new URL("../app/services/notification.server.ts", import.meta.url)));
const customer = await import(await moduleUrl(new URL("../app/services/customer-pickup-notifications.server.ts", import.meta.url)));
const internal = await import(await moduleUrl(new URL("../app/services/internal-pickup-notifications.server.ts", import.meta.url)));
const environment = { APP_BASE_URL: "https://consign.bidtrice.com", BETTER_AUTH_URL: "https://worker.example.test", RESEND_API_KEY: "test-key", RESEND_FROM_EMAIL: "test@example.test" };
const url = "https://consign.bidtrice.com/my-appointments";
const input = { customerId: 2, title: "Estate pickup", pickupDate: "2026-11-04", arrivalTime: "09:30", estimatedDurationMinutes: "60", status: "scheduled", contactName: "Alex", contactPhone: "5555550123", addressLine1: "123 Main Street", addressLine2: "", city: "Denton", state: "MD", postalCode: "21629", accessInstructions: "SECRET ACCESS", estateDescription: "Household items", estimatedLoadSize: "SECRET TRUCK", estimatedSmallsPercent: "40", estimatedLargePercent: "50", estimatedOutdoorPercent: "10", internalNotes: "SECRET NOTES", assignedUserIds: [5] };
function setup(t) {
  const state = fixture(t);
  state.sqlite.exec("INSERT INTO appointment_notification_recipients(label,email,receive_pickup_created,receive_pickup_rescheduled,receive_pickup_cancelled,receive_pickup_completed) VALUES('Office','office@example.test',1,1,1,1)");
  const sent = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => { sent.push(JSON.parse(options.body)); return Response.json({ id: "sent" }); });
  return { ...state, sent, jobs: () => state.sqlite.prepare("SELECT * FROM notification_jobs ORDER BY id").all() };
}
function assertCustomer(message) {
  assert.ok(message, "Customer email was delivered");
  assert.ok(message.text.includes(`View your appointment: ${url}`));
  assert.doesNotMatch(message.text + message.subject, /\/admin\/|SECRET|{{|actorName|estimatedLoad|assignedStaff|audit/i);
}

for (const event of ["created", "rescheduled", "cancelled", "completed"]) {
  test(`${event} sends a separate customer-safe email and keeps staff admin links`, async t => {
    const { db, sqlite, sent, jobs } = setup(t);
    const id = await pickups.savePickup(db, input, 1);
    if (event !== "created") {
      sqlite.exec("UPDATE notification_jobs SET status='sent'");
      await pickups.savePickup(db, event === "rescheduled" ? { ...input, pickupDate: "2026-11-05" } : { ...input, status: event }, 1, id);
    }
    const job = jobs().find(job => job.notification_type === `customer_pickup_${event}`);
    assert.equal(job.user_id, 2);
    assert.doesNotMatch(job.payload_json, /SECRET|accessInstructions|internalNotes|assignedUserIds|estimatedLoad|actorName|occurredAt/);
    await notifications.processDueNotificationJobs(db, environment);
    assert.equal(sent.length, 2);
    const message = sent.find(message => message.to === "customer@example.test");
    assertCustomer(message);
    assert.ok(sent.find(message => message.to === "office@example.test").text.includes(`https://consign.bidtrice.com/admin/pickups/${id}`));
    assert.doesNotMatch(sent.map(message => message.text).join(""), /{{/);
    if (event === "rescheduled") assert.match(message.text, /November 4, 2026[\s\S]*9:30 AM/);
    const count = sent.length;
    await notifications.processDueNotificationJobs(db, environment);
    assert.equal(sent.length, count);
  });
}

test("an assigned customer on the internal recipient list receives only one safe email", async t => {
  const { db, sqlite, sent } = setup(t);
  sqlite.exec("UPDATE appointment_notification_recipients SET email='CUSTOMER@example.test'");
  await pickups.savePickup(db, input, 1);
  await notifications.processDueNotificationJobs(db, environment);
  assert.equal(sent.length, 1);
  assertCustomer(sent[0]);
});

test("legacy queued internal email to the customer uses separate customer templates", async t => {
  const { db, sqlite, sent } = setup(t);
  const id = await pickups.savePickup(db, input, 1);
  sqlite.exec("UPDATE notification_jobs SET status='sent'");
  const payload = { pickupId: id, current: input, previous: null, customerName: "Alex", actorName: "SECRET ADMIN", occurredAt: "2026-11-04T12:00:00Z" };
  sqlite.prepare("INSERT INTO notification_jobs(idempotency_key,notification_type,channel,recipient,payload_json,scheduled_at) VALUES ('legacy','pickup_created','email','customer@example.test',?,CURRENT_TIMESTAMP)").run(JSON.stringify(payload));
  await notifications.processDueNotificationJobs(db, environment);
  assert.equal(sent.length, 1);
  assertCustomer(sent[0]);
});

for (const change of ["preference", "inactive", "email", "reassigned", "disabled"]) {
  test(`delivery suppresses a stale customer pickup email after ${change} changes`, async t => {
    const { db, sqlite, sent, jobs } = setup(t);
    const id = await pickups.savePickup(db, input, 1);
    if (change === "preference") sqlite.exec("INSERT INTO user_notification_preferences(user_id,appointment_email_enabled) VALUES (2,0)");
    if (change === "inactive") sqlite.exec("UPDATE users SET active=0 WHERE id=2");
    if (change === "email") sqlite.exec("UPDATE users SET email='changed@example.test' WHERE id=2");
    if (change === "reassigned") sqlite.prepare("UPDATE consignment_pickups SET user_id=3 WHERE id=?").run(id);
    if (change === "disabled") sqlite.exec("UPDATE settings SET value='0' WHERE key='notifications.pickup_created_enabled'");
    await notifications.processDueNotificationJobs(db, environment);
    assert.equal(sent.filter(message => message.to === "customer@example.test").length, 0);
    assert.equal(jobs().find(job => job.notification_type === "customer_pickup_created").status, "cancelled");
  });
}

test("customer opt-out prevents queueing while subscribed staff still receive emails", async t => {
  const { db, sqlite, jobs, sent } = setup(t);
  sqlite.exec("INSERT INTO user_notification_preferences(user_id,appointment_email_enabled) VALUES (2,0)");
  await pickups.savePickup(db, input, 1);
  assert.deepEqual(jobs().map(job => job.notification_type), ["pickup_created"]);
  await notifications.processDueNotificationJobs(db, environment);
  assert.equal(sent.length, 1);
  assert.match(sent[0].text, /\/admin\/pickups\//);
});

test("customer template editor rejects internal fields and URLs and all defaults render safely", async t => {
  const { db, sent } = setup(t);
  for (const body of ["{{adminPickupUrl}}", "{{pickupUrl}}", "{{actorName}}", "{{internalNotes}}", "https://consign.bidtrice.com/admin/pickups/123"]) {
    assert.ok(validateCustomerPickupTemplate(body));
    assert.equal((await notifications.saveNotificationTemplate(db, { notificationType: "customer_pickup_created", channel: "email", body })).ok, false);
  }
  const sample = notifications.sampleTemplateContext(environment);
  assert.equal(sample.customerAppointmentsUrl, url);
  assert.equal(sample.adminPickupUrl, "https://consign.bidtrice.com/admin/pickups/123");
  for (const type of CUSTOMER_PICKUP_TEMPLATE_TYPES) {
    await notifications.sendTestNotification(db, environment, { channel: "email", destination: "customer@example.test", notificationType: type });
    assertCustomer(sent.at(-1));
  }
  assert.equal((await notifications.saveNotificationTemplate(db, { notificationType: "customer_pickup_created", channel: "sms", body: "{{customerAppointmentsUrl}}" })).ok, false);
  assert.equal((await notifications.saveNotificationTemplate(db, { notificationType: "customer_pickup_created", channel: "email", body: "Hello {{customerName}}" })).ok, true);
  await notifications.sendTestNotification(db, environment, { channel: "email", destination: "customer@example.test", notificationType: "customer_pickup_created" });
  assertCustomer(sent.at(-1));
});

test("customer URL uses configured production/local origins without leaking admin fields into context", () => {
  const payload = { pickupId: 1, customerId: 2, customerName: "Alex", pickupTitle: "Pickup", pickupDate: "2026-11-04", pickupTime: "09:30", pickupAddress: "Main Street", contactName: "Alex", contactPhone: "555", previousPickupDate: null, previousPickupTime: null };
  const context = customer.customerPickupTemplateContext(payload, { BETTER_AUTH_URL: "http://localhost:5173" });
  assert.equal(context.customerAppointmentsUrl, "http://localhost:5173/my-appointments");
  assert.equal(context.pickupUrl, undefined);
  assert.equal(context.adminPickupUrl, undefined);
  assert.equal(context.actorName, undefined);
  assert.equal(renderTemplateText("https://consign.bidtrice.com/{{customerAppointmentsUrl}}", context), context.customerAppointmentsUrl);
  const legacy = { pickupId: 1, current: input, previous: null, customerName: "Alex", consignorNumber: null, actorName: "Admin", occurredAt: "2026-11-04T12:00:00Z" };
  assert.equal(internal.pickupTemplateContext(legacy, environment.APP_BASE_URL).adminPickupUrl, "https://consign.bidtrice.com/admin/pickups/1");
});


test("an internal pickup test template sent to a customer address also uses safe customer content", async t => {
  const { db, sent } = setup(t);
  await notifications.sendTestNotification(db, environment, { channel: "email", destination: "customer@example.test", notificationType: "pickup_created" });
  assertCustomer(sent[0]);
});

test("repeated customer queue calls use idempotent revision keys and ordinary edits send nothing", async t => {
  const { db, jobs } = setup(t);
  const id = await pickups.savePickup(db, input, 1);
  await customer.safelyQueueCustomerPickupNotifications(db, id, input, null);
  await pickups.savePickup(db, { ...input, internalNotes: "New internal note" }, 1, id);
  assert.equal(jobs().filter(job => job.notification_type === "customer_pickup_created").length, 1);
  assert.equal(jobs().filter(job => job.notification_type === "customer_pickup_rescheduled").length, 0);
});

test("missing customer templates have ready-to-use defaults in the editor and delivery without writing on read", async t => {
  const { db, sqlite, sent } = setup(t);
  sqlite.exec("DELETE FROM notification_templates WHERE notification_type LIKE 'customer_pickup_%'");
  const templates = (await notifications.getNotificationTemplates(db)).filter(template => template.notificationType.startsWith("customer_pickup_"));
  assert.equal(templates.length, 4);
  for (const template of templates) {
    assert.ok(template.subject);
    assert.match(template.body, /Hello {{customerName}}/);
    assert.match(template.body, /{{customerAppointmentsUrl}}/);
    assert.equal(validateCustomerPickupTemplate(`${template.subject}\n${template.body}`), null);
    await notifications.sendTestNotification(db, environment, { channel: "email", destination: "customer@example.test", notificationType: template.notificationType });
    assertCustomer(sent.at(-1));
  }
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM notification_templates WHERE notification_type LIKE 'customer_pickup_%'").get().count, 0);
});

test("blank customer template fields use defaults while saved custom wording remains intact", async t => {
  const { db, sqlite, sent } = setup(t);
  sqlite.exec("UPDATE notification_templates SET subject='   ', body='   ' WHERE notification_type='customer_pickup_created'");
  const template = (await notifications.getNotificationTemplates(db)).find(template => template.notificationType === "customer_pickup_created");
  assert.equal(template.subject, "Your consignment pickup is scheduled");
  assert.match(template.body, /We've scheduled your consignment pickup with Trice Auctions/);
  await notifications.sendTestNotification(db, environment, { channel: "email", destination: "customer@example.test", notificationType: "customer_pickup_created" });
  assertCustomer(sent.at(-1));
  await notifications.saveNotificationTemplate(db, { notificationType: "customer_pickup_created", channel: "email", subject: "A note from Trice", body: "Custom greeting for {{customerName}}. View your appointment: {{customerAppointmentsUrl}}" });
  const custom = (await notifications.getNotificationTemplates(db)).find(template => template.notificationType === "customer_pickup_created");
  assert.equal(custom.subject, "A note from Trice");
  assert.equal(custom.body, "Custom greeting for {{customerName}}. View your appointment: {{customerAppointmentsUrl}}");
});
