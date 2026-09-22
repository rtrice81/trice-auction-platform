import { ROLES, type Role } from "../lib/roles";
import { displayUserName } from "../lib/user-display-name";

export const MANAGED_ROLES = ROLES;
export type ManagedUser = { id: number; name: string; email: string; roles: Role[]; active: boolean; createdAt: string; consignorNumber: string | null };
export type EditableManagedUser = ManagedUser & { firstName: string | null; lastName: string | null; phone: string | null; authUserId: string | null };
export type UserManagementResult = { ok: true; message: string } | { ok: false; errors: string[] };
type UserRow = Omit<EditableManagedUser, "name" | "roles" | "active"> & { active: number; legacyName: string | null };

export async function listManagedUsers(db: D1Database, search = ""): Promise<ManagedUser[]> {
  const query = search.trim(), pattern = `%${query}%`;
  const { results } = await db.prepare(`SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, ai.name AS legacyName, u.email, u.active, u.created_at AS createdAt, u.consignor_id AS consignorNumber FROM users u LEFT JOIN "user" ai ON ai.id = u.auth_user_id WHERE ? = '' OR LOWER(u.email) LIKE LOWER(?) OR LOWER(COALESCE(NULLIF(TRIM(u.first_name || ' ' || u.last_name), ''), ai.name, u.email)) LIKE LOWER(?) OR u.phone LIKE ? OR LOWER(COALESCE(u.consignor_id, '')) LIKE LOWER(?) ORDER BY u.active DESC, u.email COLLATE NOCASE ASC, u.id ASC`).bind(query, pattern, pattern, pattern, pattern).all<UserRow>();
  return (await withRoles(db, results)).map(toManagedUser);
}

export async function getManagedUser(db: D1Database, userId: number): Promise<EditableManagedUser | null> {
  if (!isPositiveInteger(userId)) return null;
  const row = await db.prepare(`SELECT u.id, u.first_name AS firstName, u.last_name AS lastName, u.phone, u.auth_user_id AS authUserId, ai.name AS legacyName, u.email, u.active, u.created_at AS createdAt, u.consignor_id AS consignorNumber FROM users u LEFT JOIN "user" ai ON ai.id = u.auth_user_id WHERE u.id = ?`).bind(userId).first<UserRow>();
  if (!row) return null;
  return toManagedUser((await withRoles(db, [row]))[0]);
}

export async function updateManagedUser(db: D1Database, input: { actorUserId: number; targetUserId: number; firstName: string; lastName: string; email: string; phone: string; consignorNumber: string; roles: readonly string[]; active?: boolean }): Promise<UserManagementResult> {
  if (!isPositiveInteger(input.actorUserId) || !isPositiveInteger(input.targetUserId)) return failure("Choose a valid user.");
  const firstName = input.firstName.trim(), lastName = input.lastName.trim(), email = input.email.trim().toLowerCase(), phone = input.phone.trim(), consignorNumber = input.consignorNumber.trim();
  if (!firstName) return failure("First name is required."); if (!lastName) return failure("Last name is required."); if (!/^\S+@\S+\.\S+$/.test(email)) return failure("Enter a valid email address.");
  const roles = [...new Set(input.roles)];
  if (!roles.length || !roles.every(isRole)) return failure("Choose at least one supported role.");
  const target = await getManagedUser(db, input.targetUserId);
  if (!target) return failure("User was not found.");
  const active = input.active ?? target.active;
  if (input.actorUserId === input.targetUserId && target.roles.includes("admin") && !roles.includes("admin")) return failure("You cannot remove your own admin role through user management.");
  if (target.roles.includes("admin") && target.active && (!roles.includes("admin") || !active) && await isFinalActiveAdmin(db, target.id)) return failure("At least one active admin account must remain.");
  if (await db.prepare("SELECT id FROM users WHERE LOWER(email) = LOWER(?) AND id != ?").bind(email, target.id).first<{ id: number }>()) return failure("That email address is already used by another account.");
  const statements: D1PreparedStatement[] = [db.prepare("UPDATE users SET first_name = ?, last_name = ?, email = ?, phone = ?, consignor_id = ?, active = ? WHERE id = ?").bind(firstName, lastName, email, phone || null, consignorNumber || null, active ? 1 : 0, target.id), db.prepare(`DELETE FROM user_roles WHERE user_id = ? AND role NOT IN (${roles.map(() => "?").join(", ")})`).bind(target.id, ...roles), ...roles.map((role) => db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role, created_by) VALUES (?, ?, ?)").bind(target.id, role, input.actorUserId))];
  if (target.authUserId) {
    if (!await db.prepare("SELECT id FROM \"user\" WHERE id = ?").bind(target.authUserId).first<{ id: string }>()) return failure("The linked Better Auth identity is missing; the email cannot be changed safely.");
    if (await db.prepare("SELECT id FROM \"user\" WHERE LOWER(email) = LOWER(?) AND id != ?").bind(email, target.authUserId).first<{ id: string }>()) return failure("That email address is already used by another account.");
    statements.push(db.prepare("UPDATE \"user\" SET name = ?, email = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?").bind(`${firstName} ${lastName}`, email, target.authUserId));
  } else if (email !== target.email.toLowerCase()) return failure("This user is not linked to a Better Auth identity; the email cannot be changed safely.");
  await db.batch(statements); return { ok: true, message: "User details saved." };
}

export async function setManagedUserActive(db: D1Database, input: { targetUserId: number; active: boolean }): Promise<UserManagementResult> {
  if (!isPositiveInteger(input.targetUserId)) return failure("Choose a valid user."); const target = await getManagedUser(db, input.targetUserId); if (!target) return failure("User was not found.");
  if (target.active === input.active) return { ok: true, message: `User is already ${input.active ? "active" : "inactive"}.` };
  if (target.active && target.roles.includes("admin") && !input.active && await isFinalActiveAdmin(db, target.id)) return failure("At least one active admin account must remain.");
  await db.prepare("UPDATE users SET active = ? WHERE id = ?").bind(input.active ? 1 : 0, target.id).run(); return { ok: true, message: `User ${input.active ? "activated" : "deactivated"}.` };
}

async function withRoles(db: D1Database, rows: UserRow[]) {
  if (!rows.length) return [] as Array<UserRow & { roles: Role[] }>;
  const { results } = await db.prepare(`SELECT user_id AS userId, role FROM user_roles WHERE user_id IN (${rows.map(() => "?").join(", ")})`).bind(...rows.map((row) => row.id)).all<{ userId: number; role: Role }>();
  const byUser = new Map<number, Role[]>(); for (const { userId, role } of results) byUser.set(userId, [...(byUser.get(userId) ?? []), role]);
  return rows.map((row) => ({ ...row, roles: byUser.get(row.id) ?? [] }));
}
function toManagedUser(user: UserRow & { roles: Role[] }): EditableManagedUser { return { ...user, name: displayUserName(user), active: user.active === 1 }; }
async function isFinalActiveAdmin(db: D1Database, userId: number) { const row = await db.prepare("SELECT COUNT(*) AS count FROM users u JOIN user_roles ur ON ur.user_id = u.id WHERE ur.role = 'admin' AND u.active = 1 AND u.id != ?").bind(userId).first<{ count: number }>(); return (row?.count ?? 0) === 0; }
function isRole(value: string): value is Role { return (MANAGED_ROLES as readonly string[]).includes(value); }
function isPositiveInteger(value: number) { return Number.isInteger(value) && value > 0; }
function failure(error: string): UserManagementResult { return { ok: false, errors: [error] }; }
