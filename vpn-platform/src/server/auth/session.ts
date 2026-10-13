import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "@/server/db";
import { adminSessions, admins, type Admin, type AdminSession } from "@/server/db/schema";
import { randomToken, sha256Hex } from "@/server/crypto/hashing";
import { env } from "@/server/env";

/**
 * Database-backed admin sessions. The browser holds an opaque random token; the database stores
 * only its SHA-256. Sessions have an idle timeout (sliding) and an absolute lifetime, and are
 * invalidated when the administrator's password changes or the account is deactivated.
 */
export interface SessionWithAdmin {
  session: AdminSession;
  admin: Admin;
}

const SLIDE_THROTTLE_MS = 60_000;

export async function createSession(opts: {
  adminId: string;
  mfaVerified: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ token: string; session: AdminSession }> {
  const token = randomToken(32);
  const now = Date.now();
  const [session] = await db()
    .insert(adminSessions)
    .values({
      adminId: opts.adminId,
      tokenHash: sha256Hex(token),
      mfaVerified: opts.mfaVerified,
      ip: opts.ip,
      userAgent: opts.userAgent,
      idleExpiresAt: new Date(now + env().SESSION_IDLE_MINUTES * 60_000),
      expiresAt: new Date(now + env().SESSION_ABSOLUTE_HOURS * 3_600_000),
    })
    .returning();
  return { token, session: session! };
}

/** Validate a raw cookie token. Returns null for unknown, expired, revoked or stale sessions. */
export async function validateSessionToken(token: string | undefined | null): Promise<SessionWithAdmin | null> {
  if (!token || token.length < 32 || token.length > 128) return null;
  const now = new Date();
  const [row] = await db()
    .select({ session: adminSessions, admin: admins })
    .from(adminSessions)
    .innerJoin(admins, eq(admins.id, adminSessions.adminId))
    .where(
      and(
        eq(adminSessions.tokenHash, sha256Hex(token)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, now),
        gt(adminSessions.idleExpiresAt, now),
      ),
    )
    .limit(1);
  if (!row) return null;
  if (!row.admin.isActive || row.admin.passwordChangedAt > row.session.createdAt) {
    await revokeSession(row.session.id);
    return null;
  }
  if (now.getTime() - row.session.lastSeenAt.getTime() > SLIDE_THROTTLE_MS) {
    const idleExpiresAt = new Date(Math.min(now.getTime() + env().SESSION_IDLE_MINUTES * 60_000, row.session.expiresAt.getTime()));
    await db().update(adminSessions).set({ lastSeenAt: now, idleExpiresAt }).where(eq(adminSessions.id, row.session.id));
    row.session.lastSeenAt = now;
    row.session.idleExpiresAt = idleExpiresAt;
  }
  return row;
}

export async function markSessionMfaVerified(sessionId: string) {
  await db().update(adminSessions).set({ mfaVerified: true }).where(eq(adminSessions.id, sessionId));
}

export async function revokeSession(sessionId: string) {
  await db().update(adminSessions).set({ revokedAt: new Date() }).where(eq(adminSessions.id, sessionId));
}

export async function revokeAllSessions(adminId: string, exceptSessionId?: string) {
  const conds = [eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt)];
  const rows = await db().select({ id: adminSessions.id }).from(adminSessions).where(and(...conds));
  for (const r of rows) if (r.id !== exceptSessionId) await revokeSession(r.id);
}

/** Housekeeping: delete sessions that expired more than a day ago. */
export async function purgeExpiredSessions() {
  const cutoff = new Date(Date.now() - 86_400_000);
  await db()
    .delete(adminSessions)
    .where(or(lt(adminSessions.expiresAt, cutoff), lt(adminSessions.idleExpiresAt, cutoff), lt(adminSessions.revokedAt, cutoff)));
}
