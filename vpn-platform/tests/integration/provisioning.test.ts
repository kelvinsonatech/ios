import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { provisioningLogs, provisioningRequests, serverProtocols, servers, vpnAccounts } from "@/server/db/schema";
import { redis } from "@/server/redis";
import {
  executeCreate,
  getRequestRow,
  getRequestStatus,
  ProvisioningError,
  reconcile,
  requestAccount,
  revokeAccount,
  sweep,
} from "@/server/provisioning/service";
import { publishServer } from "@/server/servers/service";
import { syncServer } from "@/server/servers/sync";
import { actor, createServer, resetDatabase, startNode, teardown } from "../helpers";

const sshInput = (username: string) => ({ username, password: "S3cure-pass", duration: "7" });
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter}`;

async function counters(serverId: string) {
  const [s] = await db().select({ current: servers.currentAccounts, status: servers.status }).from(servers).where(eq(servers.id, serverId));
  return s!;
}

describe("provisioning lifecycle", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  let serverId: string;

  beforeAll(async () => {
    await resetDatabase();
    node = await startNode();
    const s = await createServer(node.port, { name: "Provisioning SG", maxAccounts: 50 });
    await syncServer(s.id);
    await publishServer(s.id, actor);
    serverId = s.id;
  });
  beforeEach(async () => {
    node.state.createDelayMs = 0;
    node.state.failNextCreates = 0;
    await redis().flushdb();
  });
  afterAll(async () => {
    await node.close();
    await teardown();
  });

  it("creates an account end to end and delivers the config once via the claim token", async () => {
    const r = await requestAccount({ serverId, protocolSlug: "vless", input: { username: "Traveller", duration: "7" }, idempotencyKey: randomUUID(), clientIp: nextIp() });
    expect(r.state).toBe("queued");
    expect(await getRequestStatus(r.requestId, r.claimToken)).toEqual({ status: "pending" });
    await executeCreate(r.requestId);

    const status = await getRequestStatus(r.requestId, r.claimToken);
    expect(status?.status).toBe("active");
    const account = status && "account" in status ? status.account! : null;
    expect(account?.artifacts[0]?.content).toMatch(/^vless:\/\//);
    expect(account?.fields.find((f) => f.key === "uuid")?.sensitive).toBe(true);

    // Nothing secret persisted in the database
    const [acc] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "Traveller"));
    expect(acc!.status).toBe("active");
    expect(JSON.stringify(acc!.metadata)).not.toMatch(/vless:\/\/|[0-9a-f]{8}-[0-9a-f]{4}-/);
    const row = await getRequestRow(r.requestId);
    expect(row!.inputEncrypted).toBeNull();
    expect(row!.resultEncrypted).toMatch(/^v1\./);
    const logs = await db().select().from(provisioningLogs).where(eq(provisioningLogs.requestId, r.requestId));
    expect(JSON.stringify(logs)).not.toMatch(/S3cure|vless:\/\//);

    // Wrong claim token reveals nothing
    expect(await getRequestStatus(r.requestId, "0".repeat(64))).toBeNull();
  });

  it("a double-click returns the same request and creates one account", async () => {
    const key = randomUUID();
    const ip = nextIp();
    const [a, b] = await Promise.all([
      requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("double_click"), idempotencyKey: key, clientIp: ip }),
      requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("double_click"), idempotencyKey: key, clientIp: ip }),
    ]);
    expect(a.requestId).toBe(b.requestId);
    expect(a.claimToken).toBe(b.claimToken);
    await Promise.all([executeCreate(a.requestId), executeCreate(a.requestId)]);
    const rows = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "double_click"));
    expect(rows).toHaveLength(1);
    expect([...node.state.accounts.values()].filter((x) => x.username === "double_click")).toHaveLength(1);
  });

  it("rejects reusing an idempotency key with different details", async () => {
    const key = randomUUID();
    await requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("first_name"), idempotencyKey: key, clientIp: nextIp() });
    await expect(requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("other_name"), idempotencyKey: key, clientIp: nextIp() })).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("never creates a duplicate after an uncertain outcome (timeout after sending)", async () => {
    node.state.createDelayMs = 2_500; // longer than NODE_PROVISION_TIMEOUT_MS
    const logStart = node.state.requestLog.length;
    const r = await requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("slow_node"), idempotencyKey: randomUUID(), clientIp: nextIp() });
    await executeCreate(r.requestId);
    expect((await getRequestRow(r.requestId))!.state).toBe("uncertain");
    node.state.createDelayMs = 0;
    await new Promise((res) => setTimeout(res, 1_200)); // let the node finish the slow request
    await reconcile(r.requestId);
    expect((await getRequestRow(r.requestId))!.state).toBe("succeeded");
    expect([...node.state.accounts.values()].filter((a) => a.username === "slow_node")).toHaveLength(1);
    const creates = node.state.requestLog.slice(logStart).filter((l) => l.method === "POST" && l.path === "/api/v1/accounts");
    expect(creates).toHaveLength(1); // the uncertain create was never re-sent; it was looked up instead
    expect(node.state.requestLog.slice(logStart).some((l) => l.path.startsWith("/api/v1/accounts/by-request/"))).toBe(true);
  });

  it("retries with the same request id when the node never saw the request", async () => {
    const r = await requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("not_found_retry"), idempotencyKey: randomUUID(), clientIp: nextIp() });
    // Simulate an uncertain state where the node has no record → safe re-send.
    await db().update(provisioningRequests).set({ state: "uncertain", attempts: 1 }).where(eq(provisioningRequests.id, r.requestId));
    await reconcile(r.requestId);
    expect((await getRequestRow(r.requestId))!.state).toBe("queued");
    await executeCreate(r.requestId);
    expect((await getRequestRow(r.requestId))!.state).toBe("succeeded");
  });

  it("fails cleanly on a definite node error and releases capacity", async () => {
    const before = (await counters(serverId)).current;
    await executeCreate(
      (await requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("taken_name"), idempotencyKey: randomUUID(), clientIp: nextIp() })).requestId,
    );
    const second = await requestAccount({ serverId, protocolSlug: "ssh-websocket", input: sshInput("taken_name"), idempotencyKey: randomUUID(), clientIp: nextIp() });
    await executeCreate(second.requestId);
    const status = await getRequestStatus(second.requestId, second.claimToken);
    expect(status).toEqual({ status: "failed", error: { code: "USERNAME_TAKEN", message: expect.stringMatching(/already taken/) } });
    expect((await counters(serverId)).current).toBe(before + 1);
  });

  it("validates input before anything else", async () => {
    await expect(
      requestAccount({ serverId, protocolSlug: "ssh", input: { username: "root", password: "x y", duration: "2" }, idempotencyKey: randomUUID(), clientIp: nextIp() }),
    ).rejects.toSatisfy((e: ProvisioningError) => e.code === "VALIDATION_FAILED" && !!e.fieldErrors?.username && !!e.fieldErrors?.password && !!e.fieldErrors?.duration);
  });

  it("enforces the per-IP daily limit", async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) {
      await requestAccount({ serverId, protocolSlug: "trojan", input: { username: `limit_${i}`, duration: "7" }, idempotencyKey: randomUUID(), clientIp: ip });
    }
    await expect(
      requestAccount({ serverId, protocolSlug: "trojan", input: { username: "limit_4", duration: "7" }, idempotencyKey: randomUUID(), clientIp: ip }),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", httpStatus: 429 });
  });

  it("enforces capacity under concurrency", async () => {
    const [sp] = await db()
      .select()
      .from(serverProtocols)
      .innerJoin(servers, eq(servers.id, serverProtocols.serverId))
      .where(sql`${servers.id} = ${serverId} and ${serverProtocols.nodeIdentifier} = 'noobzvpn'`);
    await db().update(serverProtocols).set({ maxAccounts: 2 }).where(eq(serverProtocols.id, sp!.server_protocols.id));
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) =>
        requestAccount({ serverId, protocolSlug: "noobzvpn", input: sshInput(`cap_${i}`), idempotencyKey: randomUUID(), clientIp: nextIp() }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(rejected.every((r) => (r.reason as ProvisioningError).code === "CAPACITY_REACHED")).toBe(true);
  });

  it("refuses new accounts during maintenance", async () => {
    await db().update(servers).set({ lifecycle: "maintenance", status: "maintenance" }).where(eq(servers.id, serverId));
    await expect(
      requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("maint_user"), idempotencyKey: randomUUID(), clientIp: nextIp() }),
    ).rejects.toMatchObject({ code: "SERVER_UNAVAILABLE", message: "Server temporarily under maintenance." });
    await db().update(servers).set({ lifecycle: "active", status: "online" }).where(eq(servers.id, serverId));
  });

  it("revokes accounts on the node and frees the slot", async () => {
    const r = await requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("revoke_me"), idempotencyKey: randomUUID(), clientIp: nextIp() });
    await executeCreate(r.requestId);
    const [acc] = await db().select().from(vpnAccounts).where(eq(vpnAccounts.username, "revoke_me"));
    const before = (await counters(serverId)).current;
    await revokeAccount(acc!.id, actor);
    expect((await counters(serverId)).current).toBe(before - 1);
    expect(node.state.accounts.get(acc!.remoteAccountId!)?.status).toBe("revoked");
  });

  it("the sweeper erases expired one-time results and re-queues stranded requests", async () => {
    const r = await requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("sweep_user"), idempotencyKey: randomUUID(), clientIp: nextIp() });
    await executeCreate(r.requestId);
    await db().update(provisioningRequests).set({ resultExpiresAt: new Date(Date.now() - 1000) }).where(eq(provisioningRequests.id, r.requestId));
    const stranded = await requestAccount({ serverId, protocolSlug: "ssh", input: sshInput("stranded_user"), idempotencyKey: randomUUID(), clientIp: nextIp() });
    await db().update(provisioningRequests).set({ updatedAt: new Date(Date.now() - 10 * 60_000) }).where(eq(provisioningRequests.id, stranded.requestId));
    const result = await sweep();
    expect(result.erased).toBeGreaterThanOrEqual(1);
    expect(result.requeued).toBeGreaterThanOrEqual(1);
    expect((await getRequestRow(r.requestId))!.resultEncrypted).toBeNull();
    expect(await getRequestStatus(r.requestId, r.claimToken)).toEqual({ status: "active", account: null });
  });
});
