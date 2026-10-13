import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { admins, type Admin } from "@/server/db/schema";
import { env } from "@/server/env";
import { audit } from "@/server/audit";
import { decryptSecret, EncryptionContext } from "@/server/crypto/encryption";
import { verifyDummy, verifyPassword } from "./password";
import { rateLimit } from "./rate-limit";
import { createSession, markSessionMfaVerified } from "./session";
import { consumeRecoveryCode, verifyTotp } from "./mfa";

const GENERIC_ERROR = "Invalid email or password.";
const THROTTLED_ERROR = "Too many sign-in attempts. Please wait a few minutes and try again.";

export type LoginResult =
  | { ok: true; token: string; mfaRequired: boolean; admin: Admin }
  | { ok: false; error: string };

export async function findAdminByEmail(email: string): Promise<Admin | null> {
  const [row] = await db()
    .select()
    .from(admins)
    .where(sql`lower(${admins.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return row ?? null;
}

/**
 * Password step of the admin login.
 * Defences: per-IP and per-email rate limits (Redis), per-account lockout (DB), constant-ish timing
 * for unknown accounts, generic error messages, and an audit entry for every attempt.
 */
export async function attemptLogin(opts: {
  email: string;
  password: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<LoginResult> {
  const email = opts.email.trim().toLowerCase().slice(0, 254);
  const actor = { adminId: null, email, ip: opts.ip, userAgent: opts.userAgent };

  const [byIp, byEmail] = await Promise.all([
    rateLimit(`login:ip:${opts.ip ?? "unknown"}`, 20, 900, "open"),
    rateLimit(`login:email:${email}`, 10, 900, "open"),
  ]);
  if (!byIp.allowed || !byEmail.allowed) {
    await audit(actor, "auth.login", { success: false, details: { reason: "rate_limited" } });
    return { ok: false, error: THROTTLED_ERROR };
  }

  const admin = await findAdminByEmail(email);
  if (!admin) {
    await verifyDummy(opts.password);
    await audit(actor, "auth.login", { success: false, details: { reason: "unknown_account" } });
    return { ok: false, error: GENERIC_ERROR };
  }

  const fullActor = { ...actor, adminId: admin.id };
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    await verifyDummy(opts.password);
    await audit(fullActor, "auth.login", { success: false, details: { reason: "locked" } });
    return { ok: false, error: THROTTLED_ERROR };
  }

  const valid = await verifyPassword(admin.passwordHash, opts.password);
  if (!valid || !admin.isActive) {
    if (!valid) {
      const failures = admin.failedLoginCount + 1;
      const lock = failures >= env().LOGIN_MAX_FAILURES;
      await db()
        .update(admins)
        .set({
          failedLoginCount: lock ? 0 : failures,
          lockedUntil: lock ? new Date(Date.now() + env().LOGIN_LOCKOUT_MINUTES * 60_000) : admin.lockedUntil,
        })
        .where(eq(admins.id, admin.id));
      await audit(fullActor, lock ? "auth.lockout" : "auth.login", {
        success: false,
        details: { reason: "bad_password", failures },
      });
    } else {
      await audit(fullActor, "auth.login", { success: false, details: { reason: "inactive" } });
    }
    return { ok: false, error: GENERIC_ERROR };
  }

  await db()
    .update(admins)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date(), lastLoginIp: opts.ip })
    .where(eq(admins.id, admin.id));
  const { token } = await createSession({
    adminId: admin.id,
    mfaVerified: !admin.mfaEnabled,
    ip: opts.ip,
    userAgent: opts.userAgent,
  });
  await audit(fullActor, "auth.login", { success: true, details: { mfaPending: admin.mfaEnabled } });
  return { ok: true, token, mfaRequired: admin.mfaEnabled, admin };
}

/** Second factor: TOTP code or a single-use recovery code. */
export async function completeMfa(opts: {
  admin: Admin;
  sessionId: string;
  code: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = { adminId: opts.admin.id, email: opts.admin.email, ip: opts.ip, userAgent: opts.userAgent };
  const limit = await rateLimit(`mfa:${opts.admin.id}`, 10, 900, "open");
  if (!limit.allowed) return { ok: false, error: THROTTLED_ERROR };
  if (!opts.admin.mfaEnabled || !opts.admin.mfaSecretEncrypted) return { ok: false, error: "MFA is not enabled." };

  const code = opts.code.trim();
  if (/^\d{6}$/.test(code.replace(/\s/g, ""))) {
    const secret = decryptSecret(opts.admin.mfaSecretEncrypted, EncryptionContext.mfaSecret(opts.admin.id));
    const step = verifyTotp(secret, code);
    if (step === null || (opts.admin.mfaLastUsedStep !== null && step <= opts.admin.mfaLastUsedStep)) {
      await audit(actor, "auth.mfa", { success: false, details: { method: "totp" } });
      return { ok: false, error: "Invalid or already used code." };
    }
    await db().update(admins).set({ mfaLastUsedStep: step }).where(eq(admins.id, opts.admin.id));
    await markSessionMfaVerified(opts.sessionId);
    await audit(actor, "auth.mfa", { success: true, details: { method: "totp" } });
    return { ok: true };
  }

  const remaining = consumeRecoveryCode(opts.admin.mfaRecoveryCodeHashes, code);
  if (!remaining) {
    await audit(actor, "auth.mfa", { success: false, details: { method: "recovery_code" } });
    return { ok: false, error: "Invalid or already used code." };
  }
  await db().update(admins).set({ mfaRecoveryCodeHashes: remaining }).where(eq(admins.id, opts.admin.id));
  await markSessionMfaVerified(opts.sessionId);
  await audit(actor, "auth.mfa", { success: true, details: { method: "recovery_code", remaining: remaining.length } });
  return { ok: true };
}
