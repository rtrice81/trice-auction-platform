import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(new URL("../app/components/public-form-protection.tsx", import.meta.url), "utf8");
const protection = await readFile(new URL("../app/services/public-form-protection.server.ts", import.meta.url), "utf8");
const bookingForm = await readFile(new URL("../app/components/customer-booking-form.tsx", import.meta.url), "utf8");
const registrationRoute = await readFile(new URL("../app/routes/register.tsx", import.meta.url), "utf8");

test("Turnstile configuration errors stop instead of resetting in a loop", () => {
  assert.match(component, /"error-callback": clearTokenAfterError/);
  assert.match(component, /retry: "never"/);
  assert.doesNotMatch(component, /"error-callback": clearTokenAndReset/);
  assert.match(component, /Retry security check/);
});

test("public forms submit the standard Turnstile response field and server validates it", () => {
  assert.match(bookingForm, /formData\.set\("cf-turnstile-response", turnstileTokenRef\.current\)/);
  assert.match(registrationRoute, /formData\.set\("cf-turnstile-response", turnstileTokenRef\.current\)/);
  assert.match(protection, /input\.formData\.get\("cf-turnstile-response"\)/);
  assert.match(protection, /https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/siteverify/);
});

test("Turnstile client code does not log response metadata", () => {
  assert.doesNotMatch(bookingForm, /turnstile-submit-check/);
  assert.doesNotMatch(registrationRoute, /turnstile-submit-check/);
});
