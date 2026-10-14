import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { serverHealth, servers, type Server, type ServerHealthStatus } from "@/server/db/schema";
import { env } from "@/server/env";
import { errorSummary, logger } from "@/server/logging/logger";
import { evaluateCompatibility } from "@/server/nodes/compatibility";
import { getNodeDriver } from "@/server/nodes/connection";
import { isNodeError } from "@/server/nodes/errors";
import { getSiteSettings } from "@/server/settings/service";
import { refreshServerStatus } from "./status";
import { fetchOptional, logTransition, mapHealth, recordSuccess } from "./sync";

/**
 * Health monitor (roadmap phase 18). The worker checks every published server on a schedule using
 * only the predefined `info` and `health` operations, stores a server_health row, the round-trip
 * time and the check time, and derives the public status:
 *  - a successful check marks the server online (or degraded) immediately and resets the failure count;
 *  - a failed check increments consecutive_failures; the server is shown offline only once
 *    `settings.health.failureThreshold` checks in a row have failed (one lost packet ≠ outage).
 * Provisioning events are written only on transitions (online → offline, offline → online).
 */

export interface HealthCheckResult {
  serverId: string;
  ok: boolean;
  latencyMs: number | null;
  healthStatus: ServerHealthStatus;
  consecutiveFailures: number;
  transition: { previous: string; current: string } | null;
  error?: { code: string; message: string };
}

/** How often the worker looks for servers that are due (each server is checked every intervalSeconds). */
export const HEALTH_TICK_MS = 30_000;
/** server_health rows are kept for this long. */
export const HEALTH_RETENTION_DAYS = 7;

export async function checkServerHealth(serverId: string): Promise<HealthCheckResult> {
  let server: Server | undefined;
  try {
    const { server: s, driver } = await getNodeDriver(serverId);
    server = s;
    const { info, latencyMs } = await driver.getInfo();
    const health = await fetchOptional(() => driver.getHealth());
    const compat = evaluateCompatibility(info.apiVersion, info.agentVersion, env().NODE_AGENT_LATEST_VERSION);
    const transition = await recordSuccess(s, info, health.value, compat.compatibility, latencyMs);
    return { serverId, ok: true, latencyMs, healthStatus: mapHealth(info, health.value), consecutiveFailures: 0, transition };
  } catch (e) {
    if (!server) {
      const [s] = await db().select().from(servers).where(eq(servers.id, serverId)).limit(1);
      server = s;
    }
    if (!server) throw e;
    return recordHealthFailure(server, e);
  }
}

async function recordHealthFailure(server: Server, error: unknown): Promise<HealthCheckResult> {
  const code = isNodeError(error) ? error.code : "UNEXPECTED";
  const message = isNodeError(error) ? error.safeMessage : "Unexpected error while contacting the server.";
  if (!isNodeError(error)) logger.warn("health check failed unexpectedly", { serverId: server.id, ...errorSummary(error) });
  const threshold = (await getSiteSettings()).health.failureThreshold;
  const now = new Date();
  const reached = sql`${servers.consecutiveFailures} + 1 >= ${threshold}`;
  let transition: Awaited<ReturnType<typeof refreshServerStatus>> = null;
  let after: { consecutiveFailures: number; healthStatus: ServerHealthStatus } | undefined;
  await db().transaction(async (tx) => {
    [after] = await tx
      .update(servers)
      .set({
        consecutiveFailures: sql`${servers.consecutiveFailures} + 1`,
        // Below the threshold the previous health (and latency) is kept.
        healthStatus: sql`case when ${reached} then 'offline'::server_health_status else ${servers.healthStatus} end`,
        lastLatencyMs: sql`case when ${reached} then null else ${servers.lastLatencyMs} end`,
        lastHealthCheckAt: now,
        lastError: message,
      })
      .where(eq(servers.id, server.id))
      .returning({ consecutiveFailures: servers.consecutiveFailures, healthStatus: servers.healthStatus });
    await tx.insert(serverHealth).values({
      serverId: server.id,
      checkedAt: now,
      reachable: false,
      status: "offline",
      errorCode: code,
      errorMessage: message,
    });
    transition = await refreshServerStatus(tx, server.id);
  });
  await logTransition(server, transition);
  return {
    serverId: server.id,
    ok: false,
    latencyMs: null,
    healthStatus: after?.healthStatus ?? server.healthStatus,
    consecutiveFailures: after?.consecutiveFailures ?? server.consecutiveFailures + 1,
    transition,
    error: { code, message },
  };
}

async function pool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) await fn(items[next++]!);
  });
  await Promise.all(lanes);
}

/**
 * One scheduler tick: check every published server (lifecycle active|maintenance, not deleted)
 * whose last check is older than the configured interval. Due servers are claimed atomically
 * (last_health_check_at is bumped first), so overlapping ticks or several workers never check the
 * same server twice. Each check is bounded by the node connect/request timeouts.
 */
export async function runDueHealthChecks(opts: { concurrency?: number } = {}): Promise<{ checked: number; failed: number }> {
  const { intervalSeconds } = (await getSiteSettings()).health;
  // Half a tick of slack, so a 60 s interval with 30 s ticks really checks every 60 s (not 90 s).
  const dueBefore = new Date(Date.now() - Math.max(intervalSeconds * 1000 - HEALTH_TICK_MS / 2, 1_000));
  const claimed = await db()
    .update(servers)
    .set({ lastHealthCheckAt: new Date() })
    .where(
      and(
        isNull(servers.deletedAt),
        inArray(servers.lifecycle, ["active", "maintenance"]),
        or(isNull(servers.lastHealthCheckAt), lt(servers.lastHealthCheckAt, dueBefore)),
      ),
    )
    .returning({ id: servers.id });
  let failed = 0;
  await pool(claimed, opts.concurrency ?? 8, async ({ id }) => {
    try {
      const r = await checkServerHealth(id);
      if (!r.ok) failed++;
    } catch (e) {
      failed++;
      logger.error("health check crashed", { serverId: id, ...errorSummary(e) });
    }
  });
  return { checked: claimed.length, failed };
}

/** Delete health history older than the retention period. */
export async function purgeHealthHistory(days = HEALTH_RETENTION_DAYS): Promise<number> {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const res = await db().execute(sql`delete from ${serverHealth} where ${serverHealth.checkedAt} < ${cutoff}::timestamptz`);
  return res.count ?? 0;
}
