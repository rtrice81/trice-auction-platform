import assert from "node:assert/strict";
import test from "node:test";
import { validateRegistrationPasswords } from "../app/lib/registration-password-validation.js";

test("matching valid passwords pass validation", () => {
  assert.equal(validateRegistrationPasswords("password8", "password8"), null);
});

test("mismatched passwords fail validation", () => {
  assert.equal(validateRegistrationPasswords("password8", "different8"), "Passwords do not match.");
});

test("passwords shorter than 8 characters fail validation", () => {
  assert.equal(validateRegistrationPasswords("short7!", "short7!"), "Passwords must each be at least 8 characters.");
});

test("an 8-character password passes validation", () => {
  assert.equal(validateRegistrationPasswords("12345678", "12345678"), null);
});
