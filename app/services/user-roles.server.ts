import type { Role } from "../lib/roles";

/**
 * Adds a role without changing any other role memberships. The database's
 * `(user_id, role)` primary key makes this safe to call after every booking.
 */
export async function ensureUserRole(db: D1Database, userId: number, role: Role) {
  await db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, ?)").bind(userId, role).run();
}
