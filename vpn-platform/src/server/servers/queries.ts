import { and, asc, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  protocols,
  provisioningLogs,
  serverCredentials,
  serverHealth,
  serverProtocols,
  servers,
} from "@/server/db/schema";
import { evaluateCompatibility } from "@/server/nodes/compatibility";
import { env } from "@/server/env";

/** Admin server list: safe fields + protocol counts. */
export async function listServersForAdmin() {
  const rows = await db()
    .select({
      id: servers.id,
      name: servers.name,
      hostname: servers.hostname,
      ipAddress: servers.ipAddress,
      country: servers.country,
      countryCode: servers.countryCode,
      city: servers.city,
      region: servers.region,
      provider: servers.provider,
      lifecycle: servers.lifecycle,
      status: servers.status,
      healthStatus: servers.healthStatus,
      compatibility: servers.compatibility,
      currentAccounts: servers.currentAccounts,
      maxAccounts: servers.maxAccounts,
      provisioningVersion: servers.provisioningVersion,
      capabilities: servers.capabilities,
      lastSeenAt: servers.lastSeenAt,
      lastError: servers.lastError,
      enabledProtocols: sql<number>`(select count(*)::int from ${serverProtocols} sp
        where sp.server_id = "servers"."id" and sp.enabled and sp.detected)`,
      detectedProtocols: sql<number>`(select count(*)::int from ${serverProtocols} sp
        where sp.server_id = "servers"."id" and sp.detected)`,
      protocolNames: sql<string[]>`coalesce((select array_agg(p.name order by p.display_order) from ${serverProtocols} sp
        join ${protocols} p on p.id = sp.protocol_id where sp.server_id = "servers"."id" and sp.enabled and sp.detected), '{}')`,
    })
    .from(servers)
    .where(isNull(servers.deletedAt))
    .orderBy(asc(servers.countryCode), asc(servers.name));
  return rows;
}

export type AdminServerRow = Awaited<ReturnType<typeof listServersForAdmin>>[number];

/** Everything shown on Admin → Servers → <server>. Never includes secrets. */
export async function getServerDetail(id: string) {
  const [server] = await db().select().from(servers).where(and(eq(servers.id, id), isNull(servers.deletedAt))).limit(1);
  if (!server) return null;

  const [credential] = await db()
    .select({
      authMethod: serverCredentials.authMethod,
      keyId: serverCredentials.keyId,
      tlsMode: serverCredentials.tlsMode,
      tlsServerName: serverCredentials.tlsServerName,
      caCertificatePem: serverCredentials.caCertificatePem,
      pinnedFingerprintSha256: serverCredentials.pinnedFingerprintSha256,
      clientCertificatePem: serverCredentials.clientCertificatePem,
      hasClientKey: sql<boolean>`${serverCredentials.clientKeyEncrypted} is not null`,
      version: serverCredentials.version,
      createdAt: serverCredentials.createdAt,
      rotatedAt: serverCredentials.rotatedAt,
    })
    .from(serverCredentials)
    .where(and(eq(serverCredentials.serverId, id), isNull(serverCredentials.revokedAt)))
    .limit(1);

  const [latestHealth] = await db()
    .select()
    .from(serverHealth)
    .where(eq(serverHealth.serverId, id))
    .orderBy(desc(serverHealth.checkedAt))
    .limit(1);

  const healthHistory = await db()
    .select({ checkedAt: serverHealth.checkedAt, reachable: serverHealth.reachable, latencyMs: serverHealth.latencyMs })
    .from(serverHealth)
    .where(eq(serverHealth.serverId, id))
    .orderBy(desc(serverHealth.checkedAt))
    .limit(30);

  const protocolRows = await db()
    .select({
      protocolId: protocols.id,
      slug: protocols.slug,
      name: protocols.name,
      icon: protocols.icon,
      globallyEnabled: protocols.enabled,
      displayOrder: protocols.displayOrder,
      serverProtocolId: serverProtocols.id,
      enabled: serverProtocols.enabled,
      detected: serverProtocols.detected,
      serviceStatus: serverProtocols.serviceStatus,
      nodeIdentifier: serverProtocols.nodeIdentifier,
      port: serverProtocols.port,
      ports: serverProtocols.ports,
      transports: serverProtocols.transports,
      maxAccounts: serverProtocols.maxAccounts,
      currentAccounts: serverProtocols.currentAccounts,
      quotaLimit: serverProtocols.quotaLimit,
      quotaUsed: serverProtocols.quotaUsed,
      quotaWindowStart: serverProtocols.quotaWindowStart,
      lastDetectedAt: serverProtocols.lastDetectedAt,
    })
    .from(protocols)
    .leftJoin(serverProtocols, and(eq(serverProtocols.protocolId, protocols.id), eq(serverProtocols.serverId, id)))
    .orderBy(asc(protocols.displayOrder), asc(protocols.name));

  const recentLogs = await db()
    .select()
    .from(provisioningLogs)
    .where(eq(provisioningLogs.serverId, id))
    .orderBy(desc(provisioningLogs.createdAt))
    .limit(15);

  const compatibility = evaluateCompatibility(server.apiVersion, server.provisioningVersion, env().NODE_AGENT_LATEST_VERSION);

  return { server, credential: credential ?? null, latestHealth: latestHealth ?? null, healthHistory, protocols: protocolRows, recentLogs, compatibility };
}

export type ServerDetail = NonNullable<Awaited<ReturnType<typeof getServerDetail>>>;

export interface HealthBucket {
  /** Start of the bucket (ISO). */
  start: string;
  checks: number;
  failures: number;
  /** Average round-trip time of the successful checks, ms. */
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
}

/**
 * Health checks of the last `hours`, aggregated into `buckets` equal slices for the server
 * sparkline (Admin → Servers → <server>). Empty slices are returned with zero checks.
 */
export async function getHealthTimeline(serverId: string, hours = 24, buckets = 48): Promise<HealthBucket[]> {
  const bucketMs = Math.floor((hours * 3_600_000) / buckets);
  const sinceMs = Date.now() - bucketMs * buckets;
  // Both numbers are computed here (never user input), so they are inlined as literals.
  const index = sql<number>`floor((extract(epoch from ${serverHealth.checkedAt}) * 1000 - ${sql.raw(String(sinceMs))}) / ${sql.raw(String(bucketMs))})::int`;
  const rows = await db()
    .select({
      index,
      checks: sql<number>`count(*)::int`,
      failures: sql<number>`count(*) filter (where not ${serverHealth.reachable})::int`,
      avgLatencyMs: sql<number | null>`round(avg(${serverHealth.latencyMs}) filter (where ${serverHealth.reachable}))::int`,
      maxLatencyMs: sql<number | null>`max(${serverHealth.latencyMs}) filter (where ${serverHealth.reachable})`,
    })
    .from(serverHealth)
    .where(and(eq(serverHealth.serverId, serverId), gte(serverHealth.checkedAt, new Date(sinceMs))))
    .groupBy(sql`1`);
  const byIndex = new Map(rows.map((r) => [r.index, r]));
  return Array.from({ length: buckets }, (_, i) => {
    const r = byIndex.get(i);
    return {
      start: new Date(sinceMs + i * bucketMs).toISOString(),
      checks: r?.checks ?? 0,
      failures: r?.failures ?? 0,
      avgLatencyMs: r?.avgLatencyMs ?? null,
      maxLatencyMs: r?.maxLatencyMs ?? null,
    };
  });
}
