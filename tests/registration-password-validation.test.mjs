import assert from "node:assert/strict";
import test from "node:test";
import { registrationInputFromForm, validateRegistrationInput } from "../app/lib/registration-validation.js";

function registrationForm(values) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("successful registration with all fields accepts common phone formatting", () => {
  const input = registrationInputFromForm(registrationForm({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "(410) 555-1234", password: "password8", confirmPassword: "password8" }));
  assert.deepEqual(validateRegistrationInput(input), []);
});

test("missing first name fails validation", () => {
  assert.deepEqual(validateRegistrationInput({ firstName: "", lastName: "Lovelace", email: "ada@example.com", phone: "4105551234", password: "password8", confirmPassword: "password8" }), ["First Name is required."]);
});

test("missing last name fails validation", () => {
  assert.deepEqual(validateRegistrationInput({ firstName: "Ada", lastName: "", email: "ada@example.com", phone: "4105551234", password: "password8", confirmPassword: "password8" }), ["Last Name is required."]);
});

test("missing or invalid phone fails validation", () => {
  assert.deepEqual(validateRegistrationInput({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "123", password: "password8", confirmPassword: "password8" }), ["Enter a valid phone number."]);
});

test("mismatched passwords fail validation", () => {
  assert.deepEqual(validateRegistrationInput({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "4105551234", password: "password8", confirmPassword: "different8" }), ["Passwords do not match."]);
});

test("an 8-character password is accepted", () => {
  assert.deepEqual(validateRegistrationInput({ firstName: "Ada", lastName: "Lovelace", email: "ada@example.com", phone: "4105551234", password: "12345678", confirmPassword: "12345678" }), []);
});
