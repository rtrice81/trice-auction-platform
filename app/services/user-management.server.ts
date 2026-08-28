import type { Role } from "./auth.server";

const MANAGED_ROLES: readonly Role[] = ["customer", "employee", "manager", "admin"];

export type ManagedUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
};

export type UserManagementResult =
  | { ok: true; message: string }
  | { ok: false; errors: string[] };

export async function listManagedUsers(db: D1Database, search = ""): Promise<ManagedUser[]> {
  const query = search.trim();
  const searchPattern = `%${query}%`;
  const { results } = await db
    .prepare(
      `SELECT
        id,
        COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS name,
        email,
        role,
        active,
        created_at AS createdAt
      FROM users
      WHERE ? = ''
         OR LOWER(email) LIKE LOWER(?)
         OR LOWER(COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email)) LIKE LOWER(?)
      ORDER BY active DESC, name COLLATE NOCASE ASC, id ASC`,
    )
    .bind(query, searchPattern, searchPattern)
    .all<Omit<ManagedUser, "active"> & { active: number }>();

  return results.map((user) => ({ ...user, active: user.active === 1 }));
}

export async function changeManagedUserRole(
  db: D1Database,
  input: { actorUserId: number; targetUserId: number; role: string },
): Promise<UserManagementResult> {
  if (!isPositiveInteger(input.actorUserId) || !isPositiveInteger(input.targetUserId)) {
    return failure("Choose a valid user.");
  }
  if (!isRole(input.role)) return failure("Choose a supported role.");
  if (input.actorUserId === input.targetUserId) {
    return failure("You cannot change your own role through user management.");
  }

  const target = await getUserState(db, input.targetUserId);
  if (!target) return failure("User was not found.");
  if (target.role === input.role) return { ok: true, message: "User role is already up to date." };

  const update = await db
    .prepare(
      `UPDATE users
       SET role = ?
       WHERE id = ?
         AND NOT (
           role = 'admin'
           AND active = 1
           AND ? != 'admin'
           AND (SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1) <= 1
         )`,
    )
    .bind(input.role, input.targetUserId, input.role)
    .run();

  if (update.meta.changes !== 1) {
    return failure("At least one active admin account must remain.");
  }
  return { ok: true, message: "User role updated." };
}

export async function setManagedUserActive(
  db: D1Database,
  input: { targetUserId: number; active: boolean },
): Promise<UserManagementResult> {
  if (!isPositiveInteger(input.targetUserId)) return failure("Choose a valid user.");

  const target = await getUserState(db, input.targetUserId);
  if (!target) return failure("User was not found.");
  if (target.active === (input.active ? 1 : 0)) {
    return { ok: true, message: `User is already ${input.active ? "active" : "inactive"}.` };
  }

  const update = await db
    .prepare(
      `UPDATE users
       SET active = ?
       WHERE id = ?
         AND NOT (
           role = 'admin'
           AND active = 1
           AND ? = 0
           AND (SELECT COUNT(*) FROM users WHERE role = 'admin' AND active = 1) <= 1
         )`,
    )
    .bind(input.active ? 1 : 0, input.targetUserId, input.active ? 1 : 0)
    .run();

  if (update.meta.changes !== 1) {
    return failure("At least one active admin account must remain.");
  }
  return { ok: true, message: `User ${input.active ? "activated" : "deactivated"}.` };
}

async function getUserState(db: D1Database, userId: number) {
  return db
    .prepare("SELECT id, role, active FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: number; role: Role; active: number }>();
}

function isRole(value: string): value is Role {
  return MANAGED_ROLES.includes(value as Role);
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function failure(error: string): UserManagementResult {
  return { ok: false, errors: [error] };
}
