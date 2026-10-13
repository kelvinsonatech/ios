import { and, asc, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { adminRole, adminSessions, admins, type Admin } from "@/server/db/schema";
import { audit, type AuditActor } from "@/server/audit";
import { decryptSecret, encryptSecret, EncryptionContext } from "@/server/crypto/encryption";
import { UserFacingError } from "@/server/errors";
import { hashPassword, passwordPolicyErrors, verifyPassword } from "@/server/auth/password";
import { generateMfaSecret, generateRecoveryCodes, totpFor, verifyTotp } from "@/server/auth/mfa";
import { revokeAllSessions, revokeSession } from "@/server/auth/session";
import { siteConfig } from "@/lib/site";

export async function listAdmins() {
  return db()
    .select({
      id: admins.id,
      email: admins.email,
      name: admins.name,
      role: admins.role,
      isActive: admins.isActive,
      mfaEnabled: admins.mfaEnabled,
      lastLoginAt: admins.lastLoginAt,
      lockedUntil: admins.lockedUntil,
      createdAt: admins.createdAt,
    })
    .from(admins)
    .orderBy(asc(admins.createdAt));
}

export const createAdminSchema = z.object({
  email: z.email("Enter a valid email").transform((e) => e.toLowerCase()),
  name: z.string().trim().min(2).max(64),
  role: z.enum(adminRole.enumValues),
  password: z.string().min(1).max(256),
});

async function countActiveSuperAdmins(exceptId?: string) {
  const [{ count }] = (await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(admins)
    .where(and(eq(admins.role, "super_admin"), eq(admins.isActive, true), exceptId ? ne(admins.id, exceptId) : sql`true`))) as [
    { count: number },
  ];
  return count;
}

export async function createAdmin(input: z.infer<typeof createAdminSchema>, actor: AuditActor) {
  const problems = passwordPolicyErrors(input.password, input.email);
  if (problems.length) throw new UserFacingError(`Password: ${problems.join(" ")}`);
  const [exists] = await db().select({ id: admins.id }).from(admins).where(sql`lower(${admins.email}) = ${input.email}`).limit(1);
  if (exists) throw new UserFacingError("An administrator with this email already exists.");
  const [row] = await db()
    .insert(admins)
    .values({ email: input.email, name: input.name, role: input.role, passwordHash: await hashPassword(input.password) })
    .returning({ id: admins.id });
  await audit(actor, "admin.create", { targetType: "admin", targetId: row!.id, details: { email: input.email, role: input.role } });
  return row!.id;
}

export async function updateAdminRole(id: string, role: Admin["role"], actor: AuditActor) {
  if (id === actor.adminId) throw new UserFacingError("You cannot change your own role.");
  const [target] = await db().select().from(admins).where(eq(admins.id, id)).limit(1);
  if (!target) throw new UserFacingError("Administrator not found.");
  if (target.role === "super_admin" && role !== "super_admin" && (await countActiveSuperAdmins(id)) === 0) {
    throw new UserFacingError("There must always be at least one active Super Admin.");
  }
  await db().update(admins).set({ role }).where(eq(admins.id, id));
  await revokeAllSessions(id);
  await audit(actor, "admin.role_change", { targetType: "admin", targetId: id, details: { from: target.role, to: role } });
}

export async function setAdminActive(id: string, active: boolean, actor: AuditActor) {
  if (id === actor.adminId) throw new UserFacingError("You cannot deactivate yourself.");
  const [target] = await db().select().from(admins).where(eq(admins.id, id)).limit(1);
  if (!target) throw new UserFacingError("Administrator not found.");
  if (!active && target.role === "super_admin" && (await countActiveSuperAdmins(id)) === 0) {
    throw new UserFacingError("There must always be at least one active Super Admin.");
  }
  await db().update(admins).set({ isActive: active, lockedUntil: null, failedLoginCount: 0 }).where(eq(admins.id, id));
  if (!active) await revokeAllSessions(id);
  await audit(actor, active ? "admin.activate" : "admin.deactivate", { targetType: "admin", targetId: id });
}

export async function resetAdminMfa(id: string, actor: AuditActor) {
  if (id === actor.adminId) throw new UserFacingError("Manage your own 2FA from My account.");
  await db()
    .update(admins)
    .set({ mfaEnabled: false, mfaSecretEncrypted: null, mfaRecoveryCodeHashes: [], mfaLastUsedStep: null })
    .where(eq(admins.id, id));
  await revokeAllSessions(id);
  await audit(actor, "admin.mfa_reset", { targetType: "admin", targetId: id });
}

export async function adminSetPassword(id: string, password: string, actor: AuditActor) {
  const [target] = await db().select().from(admins).where(eq(admins.id, id)).limit(1);
  if (!target) throw new UserFacingError("Administrator not found.");
  const problems = passwordPolicyErrors(password, target.email);
  if (problems.length) throw new UserFacingError(`Password: ${problems.join(" ")}`);
  await db()
    .update(admins)
    .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
    .where(eq(admins.id, id));
  await audit(actor, "admin.password_reset", { targetType: "admin", targetId: id });
}

// ---- self-service -------------------------------------------------------------

export async function changeOwnPassword(admin: Admin, sessionId: string, current: string, next: string, actor: AuditActor) {
  if (!(await verifyPassword(admin.passwordHash, current))) {
    await audit(actor, "account.password_change", { success: false });
    throw new UserFacingError("Your current password is incorrect.");
  }
  const problems = passwordPolicyErrors(next, admin.email);
  if (problems.length) throw new UserFacingError(problems.join(" "));
  // Every older session becomes invalid (passwordChangedAt > session.createdAt). Keep this one alive
  // by moving its creation time forward.
  const now = new Date();
  await db().update(admins).set({ passwordHash: await hashPassword(next), passwordChangedAt: now }).where(eq(admins.id, admin.id));
  await db().update(adminSessions).set({ createdAt: new Date(now.getTime() + 1) }).where(eq(adminSessions.id, sessionId));
  await audit(actor, "account.password_change");
}

/** Step 1: create a pending secret (not active until confirmed with a valid code). */
export async function beginMfaSetup(admin: Admin) {
  if (admin.mfaEnabled) throw new UserFacingError("Two-factor authentication is already enabled.");
  const secret = generateMfaSecret();
  await db()
    .update(admins)
    .set({ mfaSecretEncrypted: encryptSecret(secret, EncryptionContext.mfaSecret(admin.id)) })
    .where(eq(admins.id, admin.id));
  const uri = totpFor(secret, admin.email, siteConfig.name).toString();
  return { secret, uri };
}

/** Step 2: verify the first code, enable MFA and return single-use recovery codes (shown once). */
export async function confirmMfaSetup(admin: Admin, code: string, actor: AuditActor) {
  if (admin.mfaEnabled) throw new UserFacingError("Two-factor authentication is already enabled.");
  if (!admin.mfaSecretEncrypted) throw new UserFacingError("Start the setup again.");
  const secret = decryptSecret(admin.mfaSecretEncrypted, EncryptionContext.mfaSecret(admin.id));
  const step = verifyTotp(secret, code);
  if (step === null) throw new UserFacingError("That code is not valid. Check your device's clock and try again.");
  const { codes, hashes } = generateRecoveryCodes();
  await db()
    .update(admins)
    .set({ mfaEnabled: true, mfaLastUsedStep: step, mfaRecoveryCodeHashes: hashes })
    .where(eq(admins.id, admin.id));
  await audit(actor, "account.mfa_enable");
  return codes;
}

export async function disableOwnMfa(admin: Admin, password: string, actor: AuditActor) {
  if (!(await verifyPassword(admin.passwordHash, password))) throw new UserFacingError("Your password is incorrect.");
  await db()
    .update(admins)
    .set({ mfaEnabled: false, mfaSecretEncrypted: null, mfaRecoveryCodeHashes: [], mfaLastUsedStep: null })
    .where(eq(admins.id, admin.id));
  await audit(actor, "account.mfa_disable");
}

export async function regenerateRecoveryCodes(admin: Admin, password: string, actor: AuditActor) {
  if (!admin.mfaEnabled) throw new UserFacingError("Enable two-factor authentication first.");
  if (!(await verifyPassword(admin.passwordHash, password))) throw new UserFacingError("Your password is incorrect.");
  const { codes, hashes } = generateRecoveryCodes();
  await db().update(admins).set({ mfaRecoveryCodeHashes: hashes }).where(eq(admins.id, admin.id));
  await audit(actor, "account.mfa_recovery_regenerate");
  return codes;
}

export async function listOwnSessions(adminId: string) {
  return db()
    .select({
      id: adminSessions.id,
      ip: adminSessions.ip,
      userAgent: adminSessions.userAgent,
      createdAt: adminSessions.createdAt,
      lastSeenAt: adminSessions.lastSeenAt,
    })
    .from(adminSessions)
    .where(and(eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, new Date()), gt(adminSessions.idleExpiresAt, new Date())))
    .orderBy(desc(adminSessions.lastSeenAt));
}

export async function revokeOwnSession(adminId: string, sessionId: string, actor: AuditActor) {
  const [s] = await db()
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(and(eq(adminSessions.id, sessionId), eq(adminSessions.adminId, adminId)))
    .limit(1);
  if (!s) throw new UserFacingError("Session not found.");
  await revokeSession(sessionId);
  await audit(actor, "account.session_revoke", { targetType: "session", targetId: sessionId });
}
