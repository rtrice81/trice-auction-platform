import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/auth/*", "routes/api.auth.ts"),
  route("admin/capacity", "routes/admin.capacity.tsx"),
] satisfies RouteConfig;
