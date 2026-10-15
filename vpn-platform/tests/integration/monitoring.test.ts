import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { provisioningLogs, provisioningRequests, serverHealth, servers, vpnAccounts } from "@/server/db/schema";
import { redis } from "@/server/redis";
import { expireAccounts, processExpiredRevokes } from "@/server/provisioning/expiry";
import { executeCreate, reconcile, requestAccount } from "@/server/provisioning/service";
import { checkServerHealth, purgeHealthHistory, runDueHealthChecks } from "@/server/servers/health";
import { publishServer, updateServerConnection } from "@/server/servers/service";
import { syncServer, testConnection } from "@/server/servers/sync";
import { actor, createServer, resetDatabase, SECRET, setSettings, startNode, teardown } from "../helpers";

let ipCounter = 0;
const nextIp = () => `100.64.0.${++ipCounter}`;

const conn = (secret: string) => ({
  authMethod: "hmac_sha256" as const,
  keyId: "mock-key",
  apiSecret: secret,
  tlsMode: "insecure_http" as const,
  tlsServerName: null,
  caCertificatePem: null,
  pinnedFingerprintSha256: null,
  clientCertificatePem: null,
  clientKeyPem: null,
});

async function server(id: string) {
  return (await db().select().from(servers).where(eq(servers.id, id)))[0]!;
}

async function events(serverId: string, event: string) {
  return db()
    .select()
    .from(provisioningLogs)
    .where(and(eq(provisioningLogs.serverId, serverId), eq(provisioningLogs.event, event)));
}

describe("health monitor", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  let id: string;

  beforeAll(async () => {
    await resetDatabase();
    await setSettings({ health: { intervalSeconds: 60, failureThreshold: 3 } });
    node = await startNode({ protocols: ["ssh", "vless"], latencyMs: 40 });
    const s = await createServer(node.port, { name: "Health FR", countryCode: "FR" });
    await syncServer(s.id);
    await publishServer(s.id, actor);
    id = s.id;
  });
  afterAll(async () => {
    await node.close();
    await teardown();
  });

  it("a successful check stores latency, check time and a history row", async () => {
    const before = (await db().select().from(serverHealth).where(eq(serverHealth.serverId, id))).length;
    const r = await checkServerHealth(id);
    expect(r).toMatchObject({ ok: true, healthStatus: "online", consecutiveFailures: 0 });
    expect(r.latencyMs).toBeGreaterThanOrEqual(25); // mock latency ±20 %
    const s = await server(id);
    expect(s.lastLatencyMs).toBe(r.latencyMs);
    expect(Date.now() - s.lastHealthCheckAt!.getTime()).toBeLessThan(5_000);
    expect((await db().select().from(serverHealth).where(eq(serverHealth.serverId, id))).length).toBe(before + 1);
  });

  it("goes offline only after the failure threshold and logs each transition once", async () => {
    await updateServerConnection(id, conn("wrong-secret-0123456789abcdef"), actor);
    const latency = (await server(id)).lastLatencyMs;

    for (let i = 1; i <= 2; i++) {
      const r = await checkServerHealth(id);
      expect(r).toMatchObject({ ok: false, consecutiveFailures: i, healthStatus: "online" });
      const s = await server(id);
      expect(s.status).toBe("online");
      expect(s.lastLatencyMs).toBe(latency); // kept below the threshold
    }
    expect(await events(id, "server.offline")).toHaveLength(0);

    const third = await checkServerHealth(id);
    expect(third).toMatchObject({ ok: false, consecutiveFailures: 3, healthStatus: "offline", transition: { previous: "online", current: "offline" } });
    expect((await server(id)).status).toBe("offline");
    expect((await server(id)).lastLatencyMs).toBeNull();
    await checkServerHealth(id);
    expect(await events(id, "server.offline")).toHaveLength(1);
    // Routine failed checks are not logged as events.
    expect(await events(id, "server.connection_failed")).toHaveLength(0);

    await updateServerConnection(id, conn(SECRET), actor);
    const back = await checkServerHealth(id);
    expect(back).toMatchObject({ ok: true, consecutiveFailures: 0, transition: { previous: "offline", current: "online" } });
    await checkServerHealth(id);
    expect(await events(id, "server.restored")).toHaveLength(1);
    expect((await server(id)).status).toBe("online");
  });

  it("the scheduler tick checks only servers that are due", async () => {
    await db().update(servers).set({ lastHealthCheckAt: new Date(Date.now() - 10 * 60_000) }).where(eq(servers.id, id));
    expect(await runDueHealthChecks()).toEqual({ checked: 1, failed: 0 });
    expect(await runDueHealthChecks()).toEqual({ checked: 0, failed: 0 });
  });

  it("the admin connection test also stores the latency", async () => {
    await db().update(servers).set({ lastLatencyMs: null }).where(eq(servers.id, id));
    const r = await testConnection(id);
    expect(r.ok).toBe(true);
    expect((await server(id)).lastLatencyMs).toBe(r.latencyMs);
  });

  it("purges history older than 7 days", async () => {
    await db().insert(serverHealth).values({ serverId: id, checkedAt: new Date(Date.now() - 8 * 86_400_000), reachable: true, status: "online" });
    expect(await purgeHealthHistory()).toBe(1);
    const [{ old }] = (await db()
      .select({ old: sql<number>`count(*)::int` })
      .from(serverHealth)
      .where(sql`${serverHealth.checkedAt} < now() - interval '7 days'`)) as [{ old: number }];
    expect(old).toBe(0);
  });
});

describe("account expiry (website side)", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  let managedNode: Awaited<ReturnType<typeof startNode>>;
  let serverId: string;
  let managedId: string;

  const create = async (sid: string, username: string) => {
    const r = await requestAccount({ serverId: sid, protocolSlug: "ssh", input: { username, password: "S3cure-pass", duration: "7" }, idempotencyKey: randomUUID(), clientIp: nextIp() });
    await executeCreate(r.requestId);
    const [acc] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, username));
    expect(acc!.status).toBe("active");
    await db().update(vpnAccounts).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(vpnAccounts.id, acc!.id));
    return acc!;
  };
  const deletes = (n: typeof node, remoteId: string) => n.state.requestLog.filter((l) => l.method === "DELETE" && l.path === `/api/v1/accounts/${remoteId}`);

  beforeAll(async () => {
    await resetDatabase();
    // Like the owner's nodes: expiry_managed_by_node = false.
    node = await startNode({ protocols: ["ssh"], expiryManagedByNode: false });
    managedNode = await startNode({ protocols: ["ssh"], expiryManagedByNode: true });
    const a = await createServer(node.port, { name: "Expiry PL", countryCode: "PL" });
    const b = await createServer(managedNode.port, { name: "Expiry SE", countryCode: "SE" });
    for (const s of [a, b]) {
      await syncServer(s.id);
      await publishServer(s.id, actor);
    }
    serverId = a.id;
    managedId = b.id;
  });
  beforeEach(async () => {
    await redis().flushdb();
  });
  afterAll(async () => {
    await node.close();
    await managedNode.close();
    await teardown();
  });

  it("expires due accounts, frees the slot and removes them from nodes that do not expire accounts themselves", async () => {
    const acc = await create(serverId, "expire_one");
    const notDue = await create(serverId, "expire_later");
    await db().update(vpnAccounts).set({ expiresAt: new Date(Date.now() + 86_400_000) }).where(eq(vpnAccounts.id, notDue.id));
    const before = (await server(serverId)).currentAccounts;

    expect(await expireAccounts()).toEqual({ expired: 1, revokesQueued: 1 });
    const [row] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.id, acc.id));
    expect(row).toMatchObject({ status: "expired", holdsCapacity: false });
    expect((await server(serverId)).currentAccounts).toBe(before - 1);
    expect(node.state.accounts.get(acc.remoteAccountId!)?.status).toBe("active"); // not yet sent

    expect(await processExpiredRevokes()).toEqual({ removed: 1, retrying: 0, failed: 0 });
    expect(node.state.accounts.get(acc.remoteAccountId!)?.status).toBe("revoked");
    expect(deletes(node, acc.remoteAccountId!)).toHaveLength(1);
    const [req] = await db().select().from(provisioningRequests).where(eq(provisioningRequests.idempotencyKey, `expire:${acc.id}`));
    expect(req).toMatchObject({ operation: "revoke", state: "succeeded" });

    // Running again does nothing: no duplicate expiry, no second DELETE.
    expect(await expireAccounts()).toEqual({ expired: 0, revokesQueued: 0 });
    expect(await processExpiredRevokes()).toEqual({ removed: 0, retrying: 0, failed: 0 });
    expect(deletes(node, acc.remoteAccountId!)).toHaveLength(1);

    const logs = await db().select().from(provisioningLogs).where(and(eq(provisioningLogs.accountId, acc.id), eq(provisioningLogs.event, "account.expired")));
    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs)).not.toMatch(/S3cure-pass/);
  });

  it("treats 404 (already gone) as success", async () => {
    const acc = await create(serverId, "expire_gone");
    node.state.accounts.get(acc.remoteAccountId!)!.status = "revoked";
    await expireAccounts();
    expect(await processExpiredRevokes()).toEqual({ removed: 1, retrying: 0, failed: 0 });
  });

  it("retries failed removals later with the same request id and no duplicate side effects", async () => {
    const acc = await create(serverId, "expire_retry");
    await updateServerConnection(serverId, conn("wrong-secret-0123456789abcdef"), actor);
    await expireAccounts();
    expect(await processExpiredRevokes()).toEqual({ removed: 0, retrying: 1, failed: 0 });
    const [req] = await db().select().from(provisioningRequests).where(eq(provisioningRequests.idempotencyKey, `expire:${acc.id}`));
    expect(req).toMatchObject({ state: "queued", attempts: 1, errorCode: expect.any(String) });
    // Backoff: not retried immediately.
    expect(await processExpiredRevokes()).toEqual({ removed: 0, retrying: 0, failed: 0 });

    await updateServerConnection(serverId, conn(SECRET), actor);
    await db().update(provisioningRequests).set({ updatedAt: new Date(Date.now() - 5 * 60_000) }).where(eq(provisioningRequests.id, req!.id));
    // $onUpdate bumps updated_at on every drizzle update, so age it with raw SQL.
    await db().execute(sql`update provisioning_requests set updated_at = now() - interval '5 minutes' where id = ${req!.id}`);
    expect(await processExpiredRevokes()).toEqual({ removed: 1, retrying: 0, failed: 0 });
    expect(node.state.accounts.get(acc.remoteAccountId!)?.status).toBe("revoked");
    const [done] = await db().select().from(provisioningRequests).where(eq(provisioningRequests.id, req!.id));
    expect(done).toMatchObject({ state: "succeeded", attempts: 2 });
  });

  it("never gives up removing an expired account; warns once after about 6 hours of failures", async () => {
    const acc = await create(serverId, "expire_never_give_up");
    await updateServerConnection(serverId, conn("wrong-secret-0123456789abcdef"), actor);
    await expireAccounts();
    const [req] = await db().select().from(provisioningRequests).where(eq(provisioningRequests.idempotencyKey, `expire:${acc.id}`));
    await db().execute(sql`update provisioning_requests set attempts = 11, updated_at = now() - interval '2 hours' where id = ${req!.id}`);
    expect(await processExpiredRevokes()).toEqual({ removed: 0, retrying: 1, failed: 0 });
    await db().execute(sql`update provisioning_requests set updated_at = now() - interval '2 hours' where id = ${req!.id}`);
    expect(await processExpiredRevokes()).toEqual({ removed: 0, retrying: 1, failed: 0 });
    const [still] = await db().select().from(provisioningRequests).where(eq(provisioningRequests.id, req!.id));
    expect(still).toMatchObject({ state: "queued", attempts: 13 });
    const warnings = (await events(serverId, "account.expired")).filter((e) => e.requestId === req!.id && e.status === "failure");
    expect(warnings).toHaveLength(1);

    await updateServerConnection(serverId, conn(SECRET), actor);
    await db().execute(sql`update provisioning_requests set updated_at = now() - interval '2 hours' where id = ${req!.id}`);
    expect(await processExpiredRevokes()).toEqual({ removed: 1, retrying: 0, failed: 0 });
    expect(node.state.accounts.get(acc.remoteAccountId!)?.status).toBe("revoked");
  });

  it("leaves removals for servers marked offline in the queue without using attempts", async () => {
    const acc = await create(serverId, "expire_offline");
    await expireAccounts();
    await db().update(servers).set({ healthStatus: "offline" }).where(eq(servers.id, serverId));
    expect(await processExpiredRevokes()).toEqual({ removed: 0, retrying: 0, failed: 0 });
    const [req] = await db().select().from(provisioningRequests).where(eq(provisioningRequests.idempotencyKey, `expire:${acc.id}`));
    expect(req).toMatchObject({ state: "queued", attempts: 0 });
    await db().update(servers).set({ healthStatus: "online" }).where(eq(servers.id, serverId));
    expect(await processExpiredRevokes()).toEqual({ removed: 1, retrying: 0, failed: 0 });
  });

  it("an unconfirmed account keeps its slot until its deadline, then frees it and is removed if the node created it", async () => {
    const r = await requestAccount({ serverId, protocolSlug: "ssh", input: { username: "expire_unknown", password: "S3cure-pass", duration: "7" }, idempotencyKey: randomUUID(), clientIp: nextIp() });
    node.state.createDelayMs = 2_500; // longer than NODE_PROVISION_TIMEOUT_MS: outcome unknown
    await executeCreate(r.requestId);
    node.state.createDelayMs = 0;
    await new Promise((res) => setTimeout(res, 1_200)); // the node finishes creating it
    // The node stays unreachable for longer than the reconcile window.
    await updateServerConnection(serverId, conn("wrong-secret-0123456789abcdef"), actor);
    await db().execute(sql`update provisioning_requests set started_at = now() - interval '1 hour' where id = ${r.requestId}`);
    await reconcile(r.requestId);
    const [acc] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "expire_unknown"));
    expect(acc).toMatchObject({ status: "failed", failureCode: "OUTCOME_UNKNOWN", holdsCapacity: true, remoteAccountId: null });
    expect(acc!.expiresAt!.getTime() - acc!.createdAt.getTime()).toBe(7 * 86_400_000);
    const remote = [...node.state.accounts.values()].find((a) => a.username === "expire_unknown")!;
    expect(remote.status).toBe("active");

    await updateServerConnection(serverId, conn(SECRET), actor);
    const before = (await server(serverId)).currentAccounts;
    await db().update(vpnAccounts).set({ expiresAt: new Date(Date.now() - 60_000) }).where(eq(vpnAccounts.id, acc!.id));
    expect(await expireAccounts()).toEqual({ expired: 1, revokesQueued: 1 });
    const [after] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.id, acc!.id));
    expect(after).toMatchObject({ status: "failed", holdsCapacity: false });
    expect((await server(serverId)).currentAccounts).toBe(before - 1);
    expect(await processExpiredRevokes()).toEqual({ removed: 1, retrying: 0, failed: 0 });
    expect(remote.status).toBe("revoked");
  });

  it("does not send removals to nodes that expire accounts themselves", async () => {
    const acc = await create(managedId, "expire_managed");
    expect(await expireAccounts()).toEqual({ expired: 1, revokesQueued: 0 });
    expect(await processExpiredRevokes()).toEqual({ removed: 0, retrying: 0, failed: 0 });
    expect(deletes(managedNode, acc.remoteAccountId!)).toHaveLength(0);
    const [row] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.id, acc.id));
    expect(row!.status).toBe("expired");
  });
});
