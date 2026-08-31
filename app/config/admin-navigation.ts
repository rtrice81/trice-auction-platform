import type { ApplicationUser, Role } from "../services/auth.server";

export type AdminNavigationItem = {
  label: string;
  path: string;
  module: string;
  group?: string;
  allowedRoles?: readonly Role[];
  requiredPermission?: string;
  displayOrder: number;
};

export type AdminNavigationModule = {
  label: string;
  displayOrder: number;
  items: readonly AdminNavigationItem[];
};

export type VisibleAdminNavigation = Array<{
  label: string;
  displayOrder: number;
  items: AdminNavigationItem[];
}>;

// Add future modules here; the shared admin layout will render them automatically.
export const ADMIN_NAVIGATION: readonly AdminNavigationModule[] = [
  {
    label: "Drop-Offs",
    displayOrder: 10,
    items: [
      { label: "Schedule", path: "/admin/schedule", module: "Drop-Offs", group: "Drop-Offs", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 10 },
      { label: "Booking Events", path: "/admin/booking-events", module: "Drop-Offs", group: "Drop-Offs", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 15 },
      { label: "New Drop-Off Date", path: "/admin/schedule/new", module: "Drop-Offs", group: "Drop-Offs", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 20 },
      { label: "Appointments", path: "/admin/appointments", module: "Drop-Offs", group: "Drop-Offs", allowedRoles: ["admin"], requiredPermission: "appointment:manage-all", displayOrder: 30 },
      { label: "New Appointment", path: "/admin/appointments/new", module: "Drop-Offs", group: "Drop-Offs", allowedRoles: ["admin"], requiredPermission: "appointment:manage-all", displayOrder: 40 },
      { label: "Capacity Settings", path: "/admin/capacity", module: "Drop-Offs", group: "Drop-Offs", allowedRoles: ["admin"], requiredPermission: "capacity:manage", displayOrder: 50 },
    ],
  },
  {
    label: "Users",
    displayOrder: 20,
    items: [
      { label: "User Management", path: "/admin/users", module: "Users", group: "Users", allowedRoles: ["admin"], requiredPermission: "user:manage", displayOrder: 10 },
      { label: "New Customer", path: "/admin/customers/new", module: "Users", group: "Users", allowedRoles: ["admin"], requiredPermission: "user:manage", displayOrder: 20 },
    ],
  },
  {
    label: "System",
    displayOrder: 30,
    items: [
      { label: "Branding", path: "/admin/branding", module: "System", group: "System", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 10 },
    ],
  },
];

type PermissionCheck = (user: ApplicationUser, permission: string) => boolean;

export function getVisibleAdminNavigation(user: ApplicationUser, hasPermission: PermissionCheck): VisibleAdminNavigation {
  return ADMIN_NAVIGATION
    .map((module) => ({
      ...module,
      items: [...module.items]
        .filter((item) => (!item.allowedRoles || item.allowedRoles.includes(user.role))
          && (!item.requiredPermission || hasPermission(user, item.requiredPermission)))
        .sort((left, right) => left.displayOrder - right.displayOrder),
    }))
    .filter((module) => module.items.length > 0)
    .sort((left, right) => left.displayOrder - right.displayOrder);
}
