import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("my-appointments", "routes/my-appointments.tsx"),
  route("register", "routes/register.tsx"), route("login", "routes/login.tsx"), route("logout", "routes/logout.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("admin/capacity", "routes/admin.capacity.tsx"),
] satisfies RouteConfig;
