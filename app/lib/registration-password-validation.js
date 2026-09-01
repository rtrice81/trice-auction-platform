export const REGISTRATION_PASSWORD_MIN_LENGTH = 8;

/**
 * @param {string} password
 * @param {string} confirmPassword
 */
export function validateRegistrationPasswords(password, confirmPassword) {
  if (password.length < REGISTRATION_PASSWORD_MIN_LENGTH || confirmPassword.length < REGISTRATION_PASSWORD_MIN_LENGTH) {
    return `Passwords must each be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password !== confirmPassword) return "Passwords do not match.";
  return null;
}
