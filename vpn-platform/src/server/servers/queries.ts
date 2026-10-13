import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
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
      lastSeenAt: servers.lastSeenAt,
      lastError: servers.lastError,
      enabledProtocols: sql<number>`(select count(*)::int from ${serverProtocols} sp
        where sp.server_id = ${servers.id} and sp.enabled and sp.detected)`,
      detectedProtocols: sql<number>`(select count(*)::int from ${serverProtocols} sp
        where sp.server_id = ${servers.id} and sp.detected)`,
      protocolNames: sql<string[]>`coalesce((select array_agg(p.name order by p.display_order) from ${serverProtocols} sp
        join ${protocols} p on p.id = sp.protocol_id where sp.server_id = ${servers.id} and sp.enabled and sp.detected), '{}')`,
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
