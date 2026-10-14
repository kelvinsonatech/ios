import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import {
  protocols,
  serverHealth,
  serverProtocols,
  servers,
  serverStatistics,
  type NodeCapabilities,
  type PortMap,
  type Server,
  type ServerCompatibility,
  type ServerHealthStatus,
} from "@/server/db/schema";
import { env } from "@/server/env";
import { audit, type AuditActor } from "@/server/audit";
import { logEvent } from "@/server/logging/events";
import { evaluateCompatibility } from "@/server/nodes/compatibility";
import { getNodeDriver } from "@/server/nodes/connection";
import type { NodeHealth, NodeInfo, NodeProtocol, NodeStats } from "@/server/nodes/contract";
import { isNodeError, NodeError } from "@/server/nodes/errors";
import { matchProtocols, normalizeIdentifier } from "@/server/protocols/identifiers";
import { getSiteSettings } from "@/server/settings/service";
import { refreshServerStatus } from "./status";

export interface ConnectionCheck {
  ok: boolean;
  latencyMs?: number;
  info?: NodeInfo;
  health?: NodeHealth;
  compatibility: ServerCompatibility;
  compatibilityReasons: string[];
  warnings: string[];
  error?: { code: string; message: string };
}

export interface DetectedProtocolRow {
  protocolId: string;
  slug: string;
  name: string;
  detected: boolean;
  enabled: boolean;
  isNew: boolean;
  removed: boolean;
  nodeIdentifier: string | null;
  ports: PortMap;
  serviceStatus: string;
}

export interface SyncResult extends ConnectionCheck {
  protocols: DetectedProtocolRow[];
  unmapped: string[];
  added: string[];
  removed: string[];
}

export function mapHealth(info: NodeInfo | undefined, health: NodeHealth | undefined): ServerHealthStatus {
  if (health?.status === "offline") return "offline";
  if (health?.status === "degraded" || info?.status === "degraded" || info?.status === "maintenance") return "degraded";
  return "online";
}

function warningsFor(server: Server, info: NodeInfo): string[] {
  const w: string[] = [];
  if (info.hostname && info.hostname.toLowerCase() !== server.hostname.toLowerCase()) {
    w.push(`The server reports hostname "${info.hostname}" but it is registered as "${server.hostname}".`);
  }
  if (info.publicIp && info.publicIp !== server.ipAddress) {
    w.push(`The server reports public IP ${info.publicIp} but it is registered with ${server.ipAddress}.`);
  }
  if (info.status === "maintenance") w.push("The server reports that it is in maintenance mode.");
  if (info.serverTime) {
    const skew = Math.abs(info.serverTime.getTime() - Date.now()) / 1000;
    if (skew > 120) w.push(`Server clock differs by ${Math.round(skew)}s. Signed requests fail beyond 300s — enable NTP on the server.`);
  }
  if (!info.capabilities.idempotency) {
    w.push("The server does not report idempotency support; duplicate protection relies on request-id lookups.");
  }
  return w;
}

function toCapabilities(info: NodeInfo): NodeCapabilities {
  return { ...info.capabilities };
}

async function recordFailure(server: Server, error: NodeError | Error, event: "server.connection_failed" | "server.sync_failed", actor?: AuditActor) {
  const safe = isNodeError(error) ? error.safeMessage : "Unexpected error while contacting the server.";
  const code = isNodeError(error) ? error.code : "UNEXPECTED";
  const now = new Date();
  let transition: Awaited<ReturnType<typeof refreshServerStatus>> = null;
  await db().transaction(async (tx) => {
    await tx
      .update(servers)
      .set({
        healthStatus: "offline",
        lastHealthCheckAt: now,
        lastLatencyMs: null,
        lastError: safe,
        consecutiveFailures: server.consecutiveFailures + 1,
      })
      .where(eq(servers.id, server.id));
    await tx.insert(serverHealth).values({
      serverId: server.id,
      checkedAt: now,
      reachable: false,
      status: "offline",
      errorCode: code,
      errorMessage: safe,
    });
    transition = await refreshServerStatus(tx, server.id);
  });
  await logEvent({
    event,
    status: "failure",
    level: "error",
    serverId: server.id,
    adminId: actor?.adminId,
    message: `${server.name}: ${safe}`,
    details: { code },
  });
  await logTransition(server, transition);
  return { code, message: safe };
}

/** Log server.offline / server.restored on public status transitions only (never on every check). */
export async function logTransition(server: Pick<Server, "id" | "name">, t: { previous: string; current: string } | null) {
  if (!t || t.previous === t.current) return;
  if (t.current === "offline" && (t.previous === "online" || t.previous === "full")) {
    await logEvent({ event: "server.offline", status: "failure", level: "warning", serverId: server.id, message: `${server.name} is offline.` });
  } else if ((t.current === "online" || t.current === "full") && t.previous === "offline") {
    await logEvent({ event: "server.restored", status: "success", serverId: server.id, message: `${server.name} is back online.` });
  }
}

export async function fetchOptional<T>(fn: () => Promise<T>): Promise<{ value?: T; error?: NodeError }> {
  try {
    return { value: await fn() };
  } catch (e) {
    if (isNodeError(e)) return { error: e };
    throw e;
  }
}

/** "Test Connection": reachability, versions and health. Does not change protocol settings. */
export async function testConnection(serverId: string, actor?: AuditActor): Promise<ConnectionCheck> {
  let server: Server | undefined;
  try {
    const { server: s, driver } = await getNodeDriver(serverId);
    server = s;
    const { info, latencyMs } = await driver.getInfo();
    const health = await fetchOptional(() => driver.getHealth());
    const compat = evaluateCompatibility(info.apiVersion, info.agentVersion, env().NODE_AGENT_LATEST_VERSION);
    const warnings = warningsFor(s, info);
    if (health.error) warnings.push(`Health endpoint failed: ${health.error.safeMessage}`);
    await recordSuccess(s, info, health.value, compat.compatibility, latencyMs, { syncWarnings: warnings });
    if (actor) await audit(actor, "server.test_connection", { targetType: "server", targetId: serverId, details: { ok: true, latencyMs } });
    return {
      ok: true,
      latencyMs,
      info,
      health: health.value,
      compatibility: compat.compatibility,
      compatibilityReasons: compat.reasons,
      warnings,
    };
  } catch (e) {
    if (!server) {
      const [s] = await db().select().from(servers).where(eq(servers.id, serverId)).limit(1);
      server = s;
    }
    if (!server) throw e;
    const err = await recordFailure(server, e as Error, "server.connection_failed", actor);
    if (actor) await audit(actor, "server.test_connection", { targetType: "server", targetId: serverId, success: false, details: { code: err.code } });
    return { ok: false, compatibility: server.compatibility, compatibilityReasons: [], warnings: [], error: err };
  }
}

/** Store a successful check (connect, sync, test or the health monitor) and its health snapshot. */
export async function recordSuccess(
  server: Server,
  info: NodeInfo,
  health: NodeHealth | undefined,
  compatibility: ServerCompatibility,
  latencyMs: number,
  extra: Partial<typeof servers.$inferInsert> = {},
): Promise<{ previous: string; current: string } | null> {
  const now = new Date();
  const healthStatus = mapHealth(info, health);
  let transition: Awaited<ReturnType<typeof refreshServerStatus>> = null;
  const services = Object.entries(health?.services ?? {});
  await db().transaction(async (tx) => {
    await tx
      .update(servers)
      .set({
        healthStatus,
        compatibility,
        apiVersion: info.apiVersion,
        provisioningVersion: info.agentVersion,
        reportedHostname: info.hostname,
        capabilities: toCapabilities(info),
        lastSeenAt: now,
        lastSuccessfulConnectionAt: now,
        lastHealthCheckAt: now,
        lastLatencyMs: latencyMs,
        lastError: null,
        consecutiveFailures: 0,
        ...extra,
      })
      .where(eq(servers.id, server.id));
    // Per-protocol service state from the health report ("stopped" hides the create form publicly).
    for (const state of ["running", "stopped"] as const) {
      const ids = services.filter(([, v]) => v === state).map(([k]) => k);
      if (!ids.length) continue;
      await tx
        .update(serverProtocols)
        .set({ serviceStatus: state })
        .where(
          and(
            eq(serverProtocols.serverId, server.id),
            eq(serverProtocols.detected, true),
            inArray(serverProtocols.nodeIdentifier, ids),
          ),
        );
    }
    await tx.insert(serverHealth).values({
      serverId: server.id,
      checkedAt: now,
      reachable: true,
      status: healthStatus,
      latencyMs,
      cpuPercent: health?.cpuPercent,
      memoryUsedBytes: health?.memory?.usedBytes,
      memoryTotalBytes: health?.memory?.totalBytes,
      diskUsedBytes: health?.disk?.usedBytes,
      diskTotalBytes: health?.disk?.totalBytes,
      load1: health?.load?.[0],
      load5: health?.load?.[1],
      load15: health?.load?.[2],
      uptimeSeconds: health?.uptimeSeconds,
      services: health?.services ?? {},
    });
    transition = await refreshServerStatus(tx, server.id);
  });
  await logTransition(server, transition);
  return transition;
}

function primaryPort(ports: PortMap): number | null {
  for (const v of Object.values(ports)) {
    if (Array.isArray(v) && v.length) return v[0]!;
  }
  return null;
}

/**
 * "Connect" / "Sync": verify the server and (re)detect its protocols.
 *  - Newly detected protocols are enabled automatically only while the server is still a draft;
 *    on a published server they appear as "Available" for the administrator to enable.
 *  - Protocols the server no longer reports are marked undetected and immediately stop being
 *    offered publicly; the admin's enabled flag is preserved for when they come back.
 *  - Identifiers no protocol maps to are reported so they can be mapped in Admin → Protocols.
 */
export async function syncServer(serverId: string, actor?: AuditActor): Promise<SyncResult> {
  const started = Date.now();
  let server: Server | undefined;
  try {
    const { server: s, driver } = await getNodeDriver(serverId);
    server = s;
    const { info, latencyMs } = await driver.getInfo();
    const [detailed, health, stats] = await Promise.all([
      fetchOptional(() => driver.getProtocols()),
      fetchOptional(() => driver.getHealth()),
      fetchOptional(() => driver.getStats()),
    ]);
    if (detailed.error && detailed.error.kind !== "remote" && detailed.error.kind !== "protocol") throw detailed.error;

    const compat = evaluateCompatibility(info.apiVersion, info.agentVersion, env().NODE_AGENT_LATEST_VERSION);
    const warnings = warningsFor(s, info);
    if (detailed.error) warnings.push(`Protocol discovery failed (${detailed.error.safeMessage}); using the protocol list from /info.`);
    if (health.error) warnings.push(`Health endpoint failed: ${health.error.safeMessage}`);

    const nodeProtocols: NodeProtocol[] =
      detailed.value ??
      info.protocols.map((id) => ({ id, installed: true, running: null, ports: {}, transports: [], metadata: {} }));
    const installed = nodeProtocols.filter((p) => p.installed);

    const result = await applyDetection(s, installed, compat.compatibility);
    await recordSuccess(s, info, health.value, compat.compatibility, latencyMs, {
      lastSyncAt: new Date(),
      unmappedProtocols: result.unmapped,
      syncWarnings: warnings,
    });
    if (stats.value) await recordStats(s.id, stats.value);

    await logEvent({
      event: "server.synced",
      status: "success",
      serverId: s.id,
      adminId: actor?.adminId,
      message: `${s.name} synchronised: ${result.protocols.filter((p) => p.detected).length} protocol(s) detected${
        result.added.length ? `, new: ${result.added.join(", ")}` : ""
      }${result.removed.length ? `, missing: ${result.removed.join(", ")}` : ""}.`,
      details: {
        apiVersion: info.apiVersion,
        agentVersion: info.agentVersion,
        compatibility: compat.compatibility,
        added: result.added,
        removed: result.removed,
        unmapped: result.unmapped,
      },
      durationMs: Date.now() - started,
    });
    if (actor) await audit(actor, "server.sync", { targetType: "server", targetId: s.id, details: { added: result.added, removed: result.removed } });

    return {
      ok: true,
      latencyMs,
      info,
      health: health.value,
      compatibility: compat.compatibility,
      compatibilityReasons: compat.reasons,
      warnings,
      ...result,
    };
  } catch (e) {
    if (!server) {
      const [s] = await db().select().from(servers).where(eq(servers.id, serverId)).limit(1);
      server = s;
    }
    if (!server) throw e;
    const err = await recordFailure(server, e as Error, "server.sync_failed", actor);
    if (actor) await audit(actor, "server.sync", { targetType: "server", targetId: serverId, success: false, details: { code: err.code } });
    return {
      ok: false,
      compatibility: server.compatibility,
      compatibilityReasons: [],
      warnings: [],
      error: err,
      protocols: [],
      unmapped: [],
      added: [],
      removed: [],
    };
  }
}

async function applyDetection(
  server: Server,
  installed: NodeProtocol[],
  compatibility: ServerCompatibility,
): Promise<{ protocols: DetectedProtocolRow[]; unmapped: string[]; added: string[]; removed: string[] }> {
  const allProtocols = await db().select().from(protocols);
  const { matches, unmapped } = matchProtocols(
    installed.map((p) => p.id),
    allProtocols,
  );
  const byIdentifier = new Map(installed.map((p) => [normalizeIdentifier(p.id), p]));
  const existing = await db().select().from(serverProtocols).where(eq(serverProtocols.serverId, server.id));
  const existingByProtocol = new Map(existing.map((r) => [r.protocolId, r]));
  const now = new Date();
  const autoEnable = server.lifecycle === "draft" && compatibility !== "unsupported";
  // New server/protocol rows start with the site's default creation quota (Admin → Settings).
  const { defaultLimit } = (await getSiteSettings()).quota;

  const rows: DetectedProtocolRow[] = [];
  const added: string[] = [];
  const removed: string[] = [];

  await db().transaction(async (tx) => {
    for (const p of allProtocols) {
      const match = matches.get(p.id);
      const prev = existingByProtocol.get(p.id);
      if (match) {
        const np = byIdentifier.get(normalizeIdentifier(match.identifier))!;
        const serviceStatus = np.running === true ? "running" : np.running === false ? "stopped" : "unknown";
        const isNew = !prev || !prev.detected;
        if (isNew) added.push(p.name);
        const values = {
          detected: true,
          nodeIdentifier: match.identifier,
          ports: np.ports,
          port: primaryPort(np.ports),
          transports: np.transports,
          serviceStatus,
          metadata: np.metadata as Record<string, never>,
          lastDetectedAt: now,
        };
        if (prev) {
          await tx
            .update(serverProtocols)
            .set({ ...values, enabled: !prev.detected && !prev.enabled && autoEnable ? true : prev.enabled })
            .where(eq(serverProtocols.id, prev.id));
        } else {
          await tx.insert(serverProtocols).values({
            ...values,
            serverId: server.id,
            protocolId: p.id,
            enabled: autoEnable,
            quotaLimit: defaultLimit,
            firstDetectedAt: now,
          });
        }
        rows.push({
          protocolId: p.id,
          slug: p.slug,
          name: p.name,
          detected: true,
          enabled: prev ? (!prev.detected && !prev.enabled && autoEnable ? true : prev.enabled) : autoEnable,
          isNew,
          removed: false,
          nodeIdentifier: match.identifier,
          ports: np.ports,
          serviceStatus,
        });
      } else if (prev?.detected) {
        removed.push(p.name);
        await tx.update(serverProtocols).set({ detected: false, serviceStatus: "unknown" }).where(eq(serverProtocols.id, prev.id));
        rows.push({
          protocolId: p.id,
          slug: p.slug,
          name: p.name,
          detected: false,
          enabled: prev.enabled,
          isNew: false,
          removed: true,
          nodeIdentifier: prev.nodeIdentifier,
          ports: prev.ports,
          serviceStatus: "unknown",
        });
      }
    }
  });
  return { protocols: rows, unmapped, added, removed };
}

async function recordStats(serverId: string, stats: NodeStats) {
  await db().insert(serverStatistics).values({
    serverId,
    accountsTotal: stats.accountsTotal,
    accountsByProtocol: stats.accountsByProtocol,
    onlineUsers: stats.onlineUsers,
    bandwidthRxBytes: stats.bandwidth?.rxBytes,
    bandwidthTxBytes: stats.bandwidth?.txBytes,
  });
}

/** Predefined maintenance operation: ask the node agent to restart itself (if it supports it). */
export async function restartProvisioningService(serverId: string, actor: AuditActor): Promise<void> {
  const { server, driver } = await getNodeDriver(serverId);
  if (!server.capabilities?.restartAgent) {
    throw new NodeError({
      kind: "config",
      code: "NOT_SUPPORTED",
      delivery: "not_sent",
      safeMessage: "This server's provisioning service does not support remote restart.",
    });
  }
  try {
    await driver.restartAgent();
    await logEvent({ event: "server.agent_restart", status: "success", serverId, adminId: actor.adminId, message: `Restart requested for ${server.name}'s provisioning service.` });
    await audit(actor, "server.restart_agent", { targetType: "server", targetId: serverId });
  } catch (e) {
    await logEvent({
      event: "server.agent_restart",
      status: "failure",
      serverId,
      adminId: actor.adminId,
      message: `Restart failed for ${server.name}: ${isNodeError(e) ? e.safeMessage : "unexpected error"}`,
    });
    await audit(actor, "server.restart_agent", { targetType: "server", targetId: serverId, success: false });
    throw e;
  }
}

export async function getServerOrNull(id: string) {
  const [s] = await db().select().from(servers).where(and(eq(servers.id, id), isNull(servers.deletedAt))).limit(1);
  return s ?? null;
}
