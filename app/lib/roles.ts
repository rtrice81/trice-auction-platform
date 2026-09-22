export const ROLES = ["consignor", "employee", "manager", "admin", "bidder"] as const;
export type Role = (typeof ROLES)[number];
export function hasRole(user: { roles: readonly Role[] }, role: Role) { return user.roles.includes(role); }
export function hasAnyRole(user: { roles: readonly Role[] }, roles: readonly Role[]) { return roles.some((role) => hasRole(user, role)); }
