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

export type EditableManagedUser = ManagedUser & {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  authUserId: string | null;
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

export async function getManagedUser(db: D1Database, userId: number): Promise<EditableManagedUser | null> {
  if (!isPositiveInteger(userId)) return null;
  const user = await db.prepare(
    `SELECT id, first_name AS firstName, last_name AS lastName, phone, auth_user_id AS authUserId,
      COALESCE(NULLIF(TRIM(first_name || ' ' || last_name), ''), email) AS name,
      email, role, active, created_at AS createdAt
     FROM users WHERE id = ?`,
  ).bind(userId).first<Omit<EditableManagedUser, "active"> & { active: number }>();
  return user ? { ...user, active: user.active === 1 } : null;
}

export async function updateManagedUser(
  db: D1Database,
  input: {
    actorUserId: number;
    targetUserId: number;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    role: string;
    active?: boolean;
  },
): Promise<UserManagementResult> {
  if (!isPositiveInteger(input.actorUserId) || !isPositiveInteger(input.targetUserId)) return failure("Choose a valid user.");
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  if (!firstName) return failure("First name is required.");
  if (!lastName) return failure("Last name is required.");
  if (!/^\S+@\S+\.\S+$/.test(email)) return failure("Enter a valid email address.");
  const target = await getManagedUser(db, input.targetUserId);
  if (!target) return failure("User was not found.");
  const active = input.active ?? target.active;
  if (!isRole(input.role)) return failure("Choose a supported role.");
  if (input.actorUserId === input.targetUserId && input.role !== target.role) {
    return failure("You cannot change your own role through user management.");
  }
  if (target.role === "admin" && target.active && (input.role !== "admin" || !active)) {
    const activeAdmins = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND active = 1").first<{ count: number }>();
    if ((activeAdmins?.count ?? 0) <= 1) return failure("At least one active admin account must remain.");
  }

  const duplicateApplicationUser = await db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?").bind(email, target.id).first<{ id: number }>();
  if (duplicateApplicationUser) return failure("That email address is already used by another account.");

  const identityName = `${firstName} ${lastName}`;
  const statements: D1PreparedStatement[] = [
    db.prepare(
      `UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, role = ?, active = ? WHERE id = ?`,
    ).bind(firstName, lastName, email, phone || null, input.role, active ? 1 : 0, target.id),
  ];

  if (target.authUserId) {
    const identity = await db.prepare("SELECT id FROM \"user\" WHERE id = ?").bind(target.authUserId).first<{ id: string }>();
    if (!identity) return failure("The linked Better Auth identity is missing; the email cannot be changed safely.");
    const duplicateIdentity = await db.prepare("SELECT id FROM \"user\" WHERE LOWER(email) = LOWER(?) AND id != ?").bind(email, target.authUserId).first<{ id: string }>();
    if (duplicateIdentity) return failure("That email address is already used by another account.");
    statements.push(db.prepare(
      `UPDATE \"user\" SET name = ?, email = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
    ).bind(identityName, email, target.authUserId));
  } else if (email !== target.email.toLowerCase()) {
    return failure("This user is not linked to a Better Auth identity; the email cannot be changed safely.");
  }

  // D1 batches are atomic, keeping the linked application and Better Auth emails in sync.
  await db.batch(statements);
  return { ok: true, message: "User details saved." };
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
