import type { getAuth } from "./auth.server";
import { REGISTRATION_PASSWORD_MIN_LENGTH } from "../lib/registration-password-validation.js";

type PasswordResetResult = { ok: true; message: string } | { ok: false; errors: string[] };

export async function resetManagedUserPassword(
  db: D1Database,
  auth: ReturnType<typeof getAuth>,
  input: {
    actorUserId: number;
    targetUserId: number;
    newPassword: string;
    confirmNewPassword: string;
    requirePasswordChange: boolean;
    currentActorSessionToken?: string;
    requestUrl: string;
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

  try {
    const authContext = await auth.$context;
    // Better Auth resolves this to the same local credential account used by sign-in.
    const credential = await authContext.internalAdapter.findCredentialAccount(target.authUserId);
    if (!credential?.password) return failure("This user does not have a password login to reset.");

    const passwordHash = await authContext.password.hash(input.newPassword);
    await authContext.internalAdapter.updatePassword(target.authUserId, passwordHash);
    const updatedCredential = await authContext.internalAdapter.findCredentialAccount(target.authUserId);
    if (!updatedCredential?.password || !await authContext.password.verify({ hash: updatedCredential.password, password: input.newPassword })) {
      return failure("Password reset could not be completed. Please try again.");
    }
    // Exercise Better Auth's actual email/password sign-in path before reporting success.
    const signInVerification = await auth.handler(new Request(new URL("/api/auth/sign-in/email", input.requestUrl), {
      method: "POST",
      headers: { "content-type": "application/json", origin: new URL(input.requestUrl).origin },
      body: JSON.stringify({ email: target.email, password: input.newPassword }),
    }));
    if (!signInVerification.ok) return failure("Password reset could not be completed. Please try again.");

    if (input.actorUserId === target.id && input.currentActorSessionToken) {
      const sessions = await authContext.internalAdapter.listSessions(target.authUserId);
      await Promise.all(sessions.filter((session) => session.token !== input.currentActorSessionToken).map((session) => authContext.internalAdapter.deleteSession(session.token)));
    } else {
      await authContext.internalAdapter.deleteUserSessions(target.authUserId);
    }

    await db.batch([
      db.prepare("UPDATE users SET must_change_password = ? WHERE id = ?").bind(input.requirePasswordChange ? 1 : 0, target.id),
      db.prepare("INSERT INTO user_password_reset_audits (target_user_id, actor_user_id, action_type) VALUES (?, ?, 'user_password_reset')")
        .bind(target.id, input.actorUserId),
    ]);
  } catch {
    return failure("Password reset could not be completed. Please try again.");
  }

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
