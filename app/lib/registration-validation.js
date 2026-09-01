import { validateRegistrationPasswords } from "./registration-password-validation.js";

/** @param {string} value */
export function normalizePhoneNumber(value) {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

/** @param {FormData} form */
export function registrationInputFromForm(form) {
  return {
    firstName: String(form.get("firstName") ?? "").trim(),
    lastName: String(form.get("lastName") ?? "").trim(),
    email: String(form.get("email") ?? "").trim().toLowerCase(),
    phone: String(form.get("phone") ?? "").trim(),
    password: String(form.get("password") ?? ""),
    confirmPassword: String(form.get("confirmPassword") ?? ""),
  };
}

/** @param {ReturnType<typeof registrationInputFromForm>} input */
export function validateRegistrationInput(input) {
  const errors = [];
  if (!input.firstName) errors.push("First Name is required.");
  if (!input.lastName) errors.push("Last Name is required.");
  if (!/^\S+@\S+\.\S+$/.test(input.email)) errors.push("Enter a valid email address.");
  if (!normalizePhoneNumber(input.phone)) errors.push("Enter a valid phone number.");
  const passwordError = validateRegistrationPasswords(input.password, input.confirmPassword);
  if (passwordError) errors.push(passwordError);
  return errors;
}
