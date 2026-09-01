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
    label: "Consignments",
    displayOrder: 10,
    items: [
      { label: "Booking Events", path: "/admin/booking-events", module: "Consignments", group: "Consignments", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 10 },
      { label: "Schedule", path: "/admin/schedule", module: "Consignments", group: "Consignments", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 20 },
      { label: "Appointments", path: "/admin/appointments", module: "Consignments", group: "Consignments", allowedRoles: ["admin"], requiredPermission: "appointment:manage-all", displayOrder: 30 },
      { label: "New Appointment", path: "/admin/appointments/new", module: "Consignments", group: "Consignments", allowedRoles: ["admin"], requiredPermission: "appointment:manage-all", displayOrder: 40 },
      { label: "Capacity Settings", path: "/admin/capacity", module: "Consignments", group: "Consignments", allowedRoles: ["admin"], requiredPermission: "capacity:manage", displayOrder: 50 },
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
    label: "Notifications",
    displayOrder: 30,
    items: [
      { label: "Notifications / Overview", path: "/admin/notifications", module: "Notifications", group: "Notifications", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 10 },
      { label: "Internal Recipients", path: "/admin/notification-recipients", module: "Notifications", group: "Notifications", allowedRoles: ["admin"], requiredPermission: "admin:access", displayOrder: 20 },
    ],
  },
  {
    label: "System",
    displayOrder: 40,
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
