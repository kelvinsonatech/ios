import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { protocols, serverProtocols, servers, vpnAccounts } from "@/server/db/schema";
import { redis } from "@/server/redis";
import { expireAccounts } from "@/server/provisioning/expiry";
import { quotaWindow } from "@/server/provisioning/quota";
import { executeCreate, getRequestStatus, ProvisioningError, requestAccount, revokeAccount } from "@/server/provisioning/service";
import { publishServer, updateServerProtocols } from "@/server/servers/service";
import { syncServer } from "@/server/servers/sync";
import { getSiteSettings } from "@/server/settings/service";
import { actor, createServer, listedServers, resetDatabase, setSettings, startNode, teardown } from "../helpers";

let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;
const sshInput = (username: string) => ({ username, password: "S3cure-pass", duration: "7" });

describe("creation quota", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  let serverId: string;
  let sshId: string;

  const row = async () => {
    const [r] = await db()
      .select()
      .from(serverProtocols)
      .where(and(eq(serverProtocols.serverId, serverId), eq(serverProtocols.protocolId, sshId)));
    return r!;
  };
  const request = (username: string) =>
    requestAccount({ serverId, protocolSlug: "ssh", input: sshInput(username), idempotencyKey: randomUUID(), clientIp: nextIp() });
  const window = async () => {
    const s = await getSiteSettings();
    return quotaWindow(new Date(), s.quota.resetTimes, s.quota.timezone);
  };

  beforeAll(async () => {
    await resetDatabase();
    // Default quota for newly detected protocols comes from the settings.
    await setSettings({ quota: { resetTimes: ["00:00", "12:00"], timezone: "Asia/Bangkok", defaultLimit: 50 } });
    node = await startNode();
    const s = await createServer(node.port, { name: "Quota DE", countryCode: "DE", maxAccounts: 100 });
    await syncServer(s.id);
    await publishServer(s.id, actor);
    serverId = s.id;
    sshId = (await db().select().from(protocols).where(eq(protocols.slug, "ssh")))[0]!.id;
  });
  beforeEach(async () => {
    node.state.failNextCreates = 0;
    await redis().flushdb();
  });
  afterAll(async () => {
    await node.close();
    await teardown();
  });

  it("sync applies settings.quota.defaultLimit to newly detected protocols", async () => {
    const rows = await db().select().from(serverProtocols).where(eq(serverProtocols.serverId, serverId));
    expect(rows.length).toBeGreaterThan(5);
    expect(rows.every((r) => r.quotaLimit === 50)).toBe(true);
  });

  it("refuses with QUOTA_REACHED (409) once the window's quota is used, saying when it resets", async () => {
    await updateServerProtocols(serverId, [{ protocolId: sshId, enabled: true, maxAccounts: null, quotaLimit: 2 }], actor);
    await request("quota_a");
    await request("quota_b");
    const err = await request("quota_c").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ProvisioningError);
    const w = await window();
    expect(err).toMatchObject({ code: "QUOTA_REACHED", httpStatus: 409 });
    expect((err as ProvisioningError).resetsAt?.toISOString()).toBe(w.end.toISOString());
    expect((err as ProvisioningError).message).toMatch(/New slots open at (00|12):00 \(Asia\/Bangkok\)/);
    const r = await row();
    expect(r.quotaUsed).toBe(2);
    expect(r.quotaWindowStart?.toISOString()).toBe(w.start.toISOString());
    // The refused request left nothing behind.
    expect(await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "quota_c"))).toHaveLength(0);
    const card = (await listedServers("ssh")).find((s) => s.id === serverId)!;
    expect(card).toMatchObject({ availability: "full", capacity: { remaining: 0, limit: 2, quotaResetsAt: w.end.toISOString() } });
    // Accounts record the window they were counted in.
    const [a] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "quota_a"));
    expect(a!.quotaWindowStart?.toISOString()).toBe(w.start.toISOString());
  });

  it("resets lazily when a new window starts", async () => {
    const w = await window();
    await db()
      .update(serverProtocols)
      .set({ quotaUsed: 2, quotaWindowStart: new Date(w.start.getTime() - 12 * 3_600_000) })
      .where(eq(serverProtocols.id, (await row()).id));
    await request("quota_new_window");
    const r = await row();
    expect(r.quotaUsed).toBe(1);
    expect(r.quotaWindowStart?.toISOString()).toBe(w.start.toISOString());
  });

  it("never moves the window backwards when a request computed an older window", async () => {
    const w = await window();
    const newer = new Date(w.start.getTime() + 12 * 3_600_000);
    await db().update(serverProtocols).set({ quotaLimit: 2, quotaUsed: 2, quotaWindowStart: newer }).where(eq(serverProtocols.id, (await row()).id));
    // The stored (newer) window is full: a request that computes the current, older window is refused.
    await expect(request("quota_late_full")).rejects.toMatchObject({ code: "QUOTA_REACHED" });
    expect((await row()).quotaWindowStart?.toISOString()).toBe(newer.toISOString());
    await db().update(serverProtocols).set({ quotaUsed: 1 }).where(eq(serverProtocols.id, (await row()).id));
    await request("quota_late_ok");
    const r = await row();
    expect(r).toMatchObject({ quotaUsed: 2 });
    expect(r.quotaWindowStart?.toISOString()).toBe(newer.toISOString());
    const [a] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "quota_late_ok"));
    expect(a!.quotaWindowStart?.toISOString()).toBe(newer.toISOString());
    await db().update(serverProtocols).set({ quotaLimit: 50, quotaUsed: 0, quotaWindowStart: w.start }).where(eq(serverProtocols.id, r.id));
  });

  it("refused attempts do not use up the visitor's daily limit", async () => {
    const ip = "198.51.100.250";
    const [ssh] = await db().select().from(protocols).where(eq(protocols.id, sshId));
    const limit = ssh!.maxAccountsPerIpPerDay;
    const as = (username: string) =>
      requestAccount({ serverId, protocolSlug: "ssh", input: sshInput(username), idempotencyKey: randomUUID(), clientIp: ip });
    await updateServerProtocols(serverId, [{ protocolId: sshId, enabled: true, maxAccounts: null, quotaLimit: 1 }], actor);
    await db().update(serverProtocols).set({ quotaUsed: 1, quotaWindowStart: (await window()).start }).where(eq(serverProtocols.id, (await row()).id));
    await expect(as("daily_refused_1")).rejects.toMatchObject({ code: "QUOTA_REACHED" });
    await expect(as("daily_refused_2")).rejects.toMatchObject({ code: "QUOTA_REACHED" });
    await updateServerProtocols(serverId, [{ protocolId: sshId, enabled: true, maxAccounts: null, quotaLimit: 100 }], actor);
    const clearBurst = async () => {
      for (const k of await redis().keys("rl:prov:burst:*")) await redis().del(k);
    };
    for (let i = 0; i < limit; i++) {
      await clearBurst(); // only the short burst limit; the daily count stays
      await as(`daily_ok_${i}`);
    }
    await clearBurst();
    const err = (await as("daily_over").catch((e: unknown) => e)) as ProvisioningError;
    expect(err).toMatchObject({ code: "RATE_LIMITED", httpStatus: 429 });
    expect(err.limitScope).toBe("daily");
    expect(err.message).toMatch(new RegExp(`limit of ${limit} SSH`));
  });

  it("gives the slot back only for definite provisioning failures in the same window", async () => {
    await db().update(serverProtocols).set({ quotaLimit: 10, quotaUsed: 0 }).where(eq(serverProtocols.id, (await row()).id));
    const before = (await row()).quotaUsed;

    // Definite failure → refund.
    const failed = await request("quota_fail");
    expect((await row()).quotaUsed).toBe(before + 1);
    node.state.failNextCreates = 1;
    await executeCreate(failed.requestId);
    expect((await getRequestStatus(failed.requestId, failed.claimToken))?.status).toBe("failed");
    expect((await row()).quotaUsed).toBe(before);

    // Failure of an account counted in an earlier window → no refund for the current window.
    const old = await request("quota_old_window");
    const w = await window();
    await db()
      .update(vpnAccounts)
      .set({ quotaWindowStart: new Date(w.start.getTime() - 12 * 3_600_000) })
      .where(eq(vpnAccounts.username, "quota_old_window"));
    node.state.failNextCreates = 1;
    await executeCreate(old.requestId);
    expect((await row()).quotaUsed).toBe(before + 1);

    // Revoke frees the active slot but not the creation quota.
    const ok = await request("quota_revoke");
    await executeCreate(ok.requestId);
    const used = (await row()).quotaUsed;
    const current = (await row()).currentAccounts;
    const [acc] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "quota_revoke"));
    await revokeAccount(acc!.id, actor);
    expect((await row()).quotaUsed).toBe(used);
    expect((await row()).currentAccounts).toBe(current - 1);

    // Expiry likewise.
    const exp = await request("quota_expire");
    await executeCreate(exp.requestId);
    const usedBefore = (await row()).quotaUsed;
    await db().update(vpnAccounts).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(vpnAccounts.username, "quota_expire"));
    await expireAccounts();
    expect((await row()).quotaUsed).toBe(usedBefore);
  });

  it("never exceeds the quota under concurrency", async () => {
    await db().update(serverProtocols).set({ quotaLimit: 3, quotaUsed: 0 }).where(eq(serverProtocols.id, (await row()).id));
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => request(`quota_conc_${i}`)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    const reasons = results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => (r.reason as ProvisioningError).code);
    expect(new Set(reasons)).toEqual(new Set(["QUOTA_REACHED"]));
    expect((await row()).quotaUsed).toBe(3);
  });

  it("distinguishes protocol-full and server-full refusals", async () => {
    await db().update(serverProtocols).set({ quotaLimit: null, maxAccounts: 1, currentAccounts: 1 }).where(eq(serverProtocols.id, (await row()).id));
    await expect(request("quota_protocol_full")).rejects.toMatchObject({ code: "CAPACITY_REACHED", message: expect.stringMatching(/SSH is full on this server/) });

    await db().update(serverProtocols).set({ maxAccounts: null }).where(eq(serverProtocols.id, (await row()).id));
    const [s] = await db().select().from(servers).where(eq(servers.id, serverId));
    await db().update(servers).set({ maxAccounts: s!.currentAccounts }).where(eq(servers.id, serverId));
    await expect(request("quota_server_full")).rejects.toMatchObject({ code: "CAPACITY_REACHED", message: "This server is full. Please choose another server." });
    await db().update(servers).set({ maxAccounts: 100 }).where(eq(servers.id, serverId));
  });
});
