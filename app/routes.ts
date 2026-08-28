import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("my-appointments", "routes/my-appointments.tsx"),
  route("my-appointments/:id", "routes/my-appointments.detail.tsx"),
  route("register", "routes/register.tsx"), route("login", "routes/login.tsx"), route("logout", "routes/logout.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("employee", "routes/employee.tsx"),
  route("employee/:id", "routes/employee.detail.tsx"),
  route("manager", "routes/manager.tsx"),
  route("manager/:id", "routes/manager.detail.tsx"),
  route("admin/capacity", "routes/admin.capacity.tsx"),
  route("admin/users", "routes/admin.users.tsx"),
  route("admin/schedule", "routes/admin.schedule.tsx"),
  route("admin/schedule/new", "routes/admin.schedule.new.tsx"),
  route("admin/schedule/:id", "routes/admin.schedule.detail.tsx"),
] satisfies RouteConfig;
