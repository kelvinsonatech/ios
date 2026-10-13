import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { adminSessions, admins, auditLogs } from "@/server/db/schema";
import { redis } from "@/server/redis";
import { hashPassword } from "@/server/auth/password";
import { attemptLogin, completeMfa } from "@/server/auth/login";
import { revokeSession, validateSessionToken } from "@/server/auth/session";
import { totpFor } from "@/server/auth/mfa";
import { beginMfaSetup, changeOwnPassword, confirmMfaSetup, setAdminActive, updateAdminRole } from "@/server/admins/service";
import { resetDatabase, teardown } from "../helpers";

const PASSWORD = "Correct-Horse-Battery-9";
const ctx = { ip: "203.0.113.50", userAgent: "vitest" };

async function makeAdmin(email: string, role: "super_admin" | "support" = "super_admin") {
  const [a] = await db().insert(admins).values({ email, name: "Test Admin", role, passwordHash: await hashPassword(PASSWORD) }).returning();
  return a!;
}

describe("admin authentication", () => {
  beforeAll(resetDatabase);
  afterAll(teardown);

  it("logs in with generic errors and audits every attempt", async () => {
    await makeAdmin("ops@example.com");
    expect(await attemptLogin({ email: "nobody@example.com", password: PASSWORD, ...ctx })).toEqual({ ok: false, error: "Invalid email or password." });
    expect(await attemptLogin({ email: "ops@example.com", password: "nope", ...ctx })).toEqual({ ok: false, error: "Invalid email or password." });
    const ok = await attemptLogin({ email: "OPS@example.com", password: PASSWORD, ...ctx });
    expect(ok.ok).toBe(true);
    const session = await validateSessionToken(ok.ok ? ok.token : "");
    expect(session?.admin.email).toBe("ops@example.com");
    const [stored] = await db().select().from(adminSessions).where(eq(adminSessions.id, session!.session.id));
    expect(stored!.tokenHash).not.toBe(ok.ok ? ok.token : ""); // only the hash is stored
    const audits = await db().select().from(auditLogs);
    expect(audits.filter((a) => a.action === "auth.login")).toHaveLength(3);
  });

  it("locks the account after repeated failures", async () => {
    await redis().flushdb();
    await makeAdmin("lock@example.com");
    for (let i = 0; i < 3; i++) await attemptLogin({ email: "lock@example.com", password: "bad", ...ctx });
    const r = await attemptLogin({ email: "lock@example.com", password: PASSWORD, ...ctx });
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/Too many/) });
  });

  it("rejects revoked sessions and sessions older than a password change", async () => {
    await redis().flushdb();
    const a = await makeAdmin("rotate@example.com");
    const one = await attemptLogin({ email: a.email, password: PASSWORD, ...ctx });
    const two = await attemptLogin({ email: a.email, password: PASSWORD, ...ctx });
    if (!one.ok || !two.ok) throw new Error("login failed");
    const s1 = (await validateSessionToken(one.token))!;
    const s2 = (await validateSessionToken(two.token))!;
    await revokeSession(s1.session.id);
    expect(await validateSessionToken(one.token)).toBeNull();

    await changeOwnPassword(s2.admin, s2.session.id, PASSWORD, "Another-Strong-Pass-7", { adminId: a.id, email: a.email, ...ctx });
    expect(await validateSessionToken(two.token)).not.toBeNull(); // the session that changed it survives
    const three = await attemptLogin({ email: a.email, password: PASSWORD, ...ctx });
    expect(three.ok).toBe(false);
  });

  it("deactivation and role changes sign the admin out", async () => {
    await redis().flushdb();
    const boss = await makeAdmin("boss@example.com");
    const staff = await makeAdmin("staff@example.com", "support");
    const r = await attemptLogin({ email: staff.email, password: PASSWORD, ...ctx });
    if (!r.ok) throw new Error("login failed");
    const actor = { adminId: boss.id, email: boss.email, ...ctx };
    await updateAdminRole(staff.id, "administrator", actor);
    expect(await validateSessionToken(r.token)).toBeNull();
    await setAdminActive(staff.id, false, actor);
    expect((await attemptLogin({ email: staff.email, password: PASSWORD, ...ctx })).ok).toBe(false);
    await expect(setAdminActive(boss.id, false, actor)).rejects.toThrow(/yourself/);
  });

  it("requires a TOTP code after the password when MFA is enabled, and blocks code replay", async () => {
    await redis().flushdb();
    const a = await makeAdmin("mfa@example.com");
    const actor = { adminId: a.id, email: a.email, ...ctx };
    const { secret } = await beginMfaSetup(a);
    const fresh = (await db().select().from(admins).where(eq(admins.id, a.id)))[0]!;
    const setupCode = totpFor(secret, "x", "y").generate({ timestamp: Date.now() - 30_000 });
    const recovery = await confirmMfaSetup(fresh, setupCode, actor);
    expect(recovery).toHaveLength(10);

    const login = await attemptLogin({ email: a.email, password: PASSWORD, ...ctx });
    if (!login.ok) throw new Error("login failed");
    expect(login.mfaRequired).toBe(true);
    const pending = (await validateSessionToken(login.token))!;
    expect(pending.session.mfaVerified).toBe(false);

    const code = totpFor(secret, "x", "y").generate();
    const enabled = (await db().select().from(admins).where(eq(admins.id, a.id)))[0]!;
    expect(await completeMfa({ admin: enabled, sessionId: pending.session.id, code, ...ctx })).toEqual({ ok: true });
    expect((await validateSessionToken(login.token))!.session.mfaVerified).toBe(true);

    // Same code again on another session → rejected (replay)
    const again = await attemptLogin({ email: a.email, password: PASSWORD, ...ctx });
    if (!again.ok) throw new Error("login failed");
    const s2 = (await validateSessionToken(again.token))!;
    const after = (await db().select().from(admins).where(eq(admins.id, a.id)))[0]!;
    expect((await completeMfa({ admin: after, sessionId: s2.session.id, code, ...ctx })).ok).toBe(false);
    // A recovery code works exactly once
    expect((await completeMfa({ admin: after, sessionId: s2.session.id, code: recovery[0]!, ...ctx })).ok).toBe(true);
    const latest = (await db().select().from(admins).where(eq(admins.id, a.id)))[0]!;
    expect(latest.mfaRecoveryCodeHashes).toHaveLength(9);
  });
});
