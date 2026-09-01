/** @param {{ firstName?: string | null; lastName?: string | null; legacyName?: string | null; email: string }} user */
export function displayUserName(user) {
  const fullName = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return fullName || user.legacyName?.trim() || user.email;
}
