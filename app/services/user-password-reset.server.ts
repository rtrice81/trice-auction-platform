import { hashPassword } from "better-auth/crypto";
import { REGISTRATION_PASSWORD_MIN_LENGTH } from "../lib/registration-password-validation.js";

type PasswordResetResult = { ok: true; message: string } | { ok: false; errors: string[] };

type CredentialAccount = {
  id: string;
  userId: string;
  password: string | null;
};

export async function resetManagedUserPassword(
  db: D1Database,
  input: {
    actorUserId: number;
    targetUserId: number;
    newPassword: string;
    confirmNewPassword: string;
    requirePasswordChange: boolean;
    currentActorSessionToken?: string;
  },
): Promise<PasswordResetResult> {
  if (!isPositiveInteger(input.actorUserId) || !isPositiveInteger(input.targetUserId)) return failure("Choose a valid user.");
  if (!input.newPassword || !input.confirmNewPassword) return failure("Enter and confirm the new password.");
  if (input.newPassword !== input.confirmNewPassword) return failure("The new passwords do not match.");
  if (input.newPassword.length < REGISTRATION_PASSWORD_MIN_LENGTH) return failure(`Passwords must each be at least ${REGISTRATION_PASSWORD_MIN_LENGTH} characters.`);

  const target = await db.prepare(
    "SELECT id, auth_user_id AS authUserId, first_name AS firstName, last_name AS lastName, email FROM users WHERE id = ?",
  ).bind(input.targetUserId).first<{ id: number; authUserId: string | null; firstName: string | null; lastName: string | null; email: string }>();
  if (!target?.authUserId) return failure("This user does not have a linked login account.");

  const identity = await db.prepare("SELECT id FROM \"user\" WHERE id = ?").bind(target.authUserId).first<{ id: string }>();
  if (!identity) return failure("The linked login account is unavailable.");

  // Only a pre-existing Better Auth credential account may be reset here.
  const credential = await db.prepare(
    "SELECT id, userId, password FROM account WHERE userId = ? AND providerId = 'credential' AND issuer = 'local:credential' AND accountId = ?",
  ).bind(target.authUserId, target.authUserId).first<CredentialAccount>();
  if (!credential?.password) return failure("This user does not have a password login to reset.");

  const passwordHash = await hashPassword(input.newPassword);
  const keepCurrentSession = input.actorUserId === target.id && input.currentActorSessionToken;
  const credentialStillMatches = "EXISTS (SELECT 1 FROM account WHERE id = ? AND userId = ? AND password = ?)";
  const resetSessions = keepCurrentSession
    ? db.prepare(`DELETE FROM session WHERE userId = ? AND token != ? AND ${credentialStillMatches}`).bind(credential.userId, input.currentActorSessionToken, credential.id, credential.userId, passwordHash)
    : db.prepare(`DELETE FROM session WHERE userId = ? AND ${credentialStillMatches}`).bind(credential.userId, credential.id, credential.userId, passwordHash);
  const results = await db.batch([
    db.prepare("UPDATE account SET password = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND userId = ? AND providerId = 'credential' AND issuer = 'local:credential' AND accountId = ? AND password IS NOT NULL")
      .bind(passwordHash, credential.id, credential.userId, credential.userId),
    resetSessions,
    db.prepare(`UPDATE users SET must_change_password = ? WHERE id = ? AND ${credentialStillMatches}`)
      .bind(input.requirePasswordChange ? 1 : 0, target.id, credential.id, credential.userId, passwordHash),
    db.prepare(`INSERT INTO user_password_reset_audits (target_user_id, actor_user_id, action_type)
      SELECT ?, ?, 'user_password_reset' WHERE ${credentialStillMatches}`)
      .bind(target.id, input.actorUserId, credential.id, credential.userId, passwordHash),
  ]);
  if (results[0].meta.changes !== 1) return failure("Password reset could not be completed. Please try again.");

  return { ok: true, message: `Password successfully reset for ${displayName(target)}.` };
}

function displayName(user: { firstName: string | null; lastName: string | null; email: string }) {
  return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;
}

function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

function failure(error: string): PasswordResetResult {
  return { ok: false, errors: [error] };
}
