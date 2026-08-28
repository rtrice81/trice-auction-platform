import { betterAuth } from "better-auth";
import { redirect } from "react-router";

export const ROLES = ["customer", "employee", "manager", "admin"] as const;
export type Role = (typeof ROLES)[number];

const ROLE_PERMISSIONS = {
  customer: ["appointment:create", "appointment:read-own", "appointment:edit-own"],
  employee: ["appointment:read-scheduled", "appointment:check-in", "appointment:add-notes"],
  manager: ["appointment:modify", "availability:manage", "report:read"],
  admin: ["capacity:manage", "user:manage", "appointment:manage-all", "admin:access"],
} as const;

export type ApplicationUser = { id: number; authUserId: string; email: string; name: string; role: Role; active: boolean };

type AuthEnvironment = { AUTH_SECRET?: string; BETTER_AUTH_URL?: string };

export function getAuth(db: D1Database, authEnv: AuthEnvironment = {}) {
  if (!authEnv.AUTH_SECRET) throw new Error("AUTH_SECRET must be configured.");
  return betterAuth({
    database: db,
    secret: authEnv.AUTH_SECRET,
    baseURL: authEnv.BETTER_AUTH_URL,
    emailAndPassword: { enabled: true },
    advanced: { useSecureCookies: import.meta.env.PROD },
  });
}

export async function getCurrentUser(request: Request, db: D1Database, authEnv: AuthEnvironment) {
  if (!authEnv.AUTH_SECRET) return null;
  const auth = getAuth(db, authEnv);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const user = await db.prepare(
    `SELECT id, auth_user_id AS authUserId, email,
            COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS name,
            role, active
     FROM users WHERE auth_user_id = ?`,
  ).bind(session.user.id).first<ApplicationUser>();
  return user && user.active ? user : null;
}

export async function requireUser(request: Request, db: D1Database, authEnv: AuthEnvironment) {
  const user = await getCurrentUser(request, db, authEnv);
  if (!user) throw redirect("/login");
  return user;
}

export async function requireAnyRole(request: Request, db: D1Database, authEnv: AuthEnvironment, roles: Role[]) {
  const user = await requireUser(request, db, authEnv);
  if (!roles.includes(user.role)) throw new Response("Forbidden", { status: 403 });
  return user;
}

export async function requireRole(request: Request, db: D1Database, authEnv: AuthEnvironment, role: Role) {
  return requireAnyRole(request, db, authEnv, [role]);
}

export function hasPermission(user: ApplicationUser, permission: string) {
  const inheritedRoles: Record<Role, Role[]> = {
    customer: ["customer"], employee: ["employee"], manager: ["employee", "manager"], admin: ["customer", "employee", "manager", "admin"],
  };
  return inheritedRoles[user.role].some((role) => (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission));
}

export function requirePermission(user: ApplicationUser, permission: string) {
  if (!hasPermission(user, permission)) throw new Response("Forbidden", { status: 403 });
  return user;
}

export function requireOwnership(user: ApplicationUser, ownerUserId: number) {
  if (user.id !== ownerUserId && !hasPermission(user, "appointment:manage-all")) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export async function syncApplicationUser(db: D1Database, identity: { id: string; email: string; name?: string | null }) {
  const existing = await db.prepare("SELECT id FROM users WHERE auth_user_id = ? OR email = ?").bind(identity.id, identity.email).first<{ id: number }>();
  if (existing) {
    await db.prepare("UPDATE users SET auth_user_id = ? WHERE id = ?").bind(identity.id, existing.id).run();
    return existing.id;
  }
  const names = (identity.name ?? "").trim().split(/\s+/, 2);
  const result = await db.prepare("INSERT INTO users (email, first_name, last_name, role, auth_user_id, active) VALUES (?, ?, ?, 'customer', ?, 1)").bind(identity.email, names[0] || null, names[1] || null, identity.id).run();
  return Number(result.meta.last_row_id);
}
