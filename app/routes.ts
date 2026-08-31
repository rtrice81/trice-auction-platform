import { type RouteConfig, index, layout, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("my-appointments", "routes/my-appointments.tsx"),
  route("my-appointments/:id", "routes/my-appointments.detail.tsx"),
  route("profile", "routes/profile.tsx"),
  route("register", "routes/register.tsx"), route("login", "routes/login.tsx"), route("logout", "routes/logout.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("employee", "routes/employee.tsx"),
  route("employee/:id", "routes/employee.detail.tsx"),
  route("manager", "routes/manager.tsx"),
  route("manager/:id", "routes/manager.detail.tsx"),
  route("change-password", "routes/change-password.tsx"),
  layout("routes/admin.layout.tsx", [
    route("admin/branding", "routes/admin.branding.tsx"),
    route("admin/capacity", "routes/admin.capacity.tsx"),
    route("admin/users", "routes/admin.users.tsx"),
    route("admin/users/:id/edit", "routes/admin.users.edit.tsx"),
    route("admin/customers/new", "routes/admin.customers.new.tsx"),
    route("admin/appointments", "routes/admin.appointments.tsx"),
    route("admin/appointments/new", "routes/admin.appointments.new.tsx"),
    route("admin/appointments/:id", "routes/admin.appointments.detail.tsx"),
    route("admin/schedule", "routes/admin.schedule.tsx"),
    route("admin/schedule/new", "routes/admin.schedule.new.tsx"),
    route("admin/schedule/:id", "routes/admin.schedule.detail.tsx"),
  ]),
  route("branding/logo", "routes/branding.logo.ts"),
] satisfies RouteConfig;
