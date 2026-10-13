import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { protocolFields, protocols, serverProtocols, servers, type ServerStatus } from "@/server/db/schema";

/**
 * Public, read-only catalogue. This is the auto-publishing query: a server is listed on a protocol
 * page when ALL of these hold — nothing is hard-coded in the frontend:
 *   protocol.enabled AND server_protocol.enabled AND server_protocol.detected
 *   AND server is published (lifecycle active|maintenance) AND not deleted AND not "unsupported"
 *   AND server.status IN (online, full, maintenance)
 * Only safe metadata is returned: no hostnames, IPs, ports of the management API or credentials.
 */
const LISTED_STATUSES: ServerStatus[] = ["online", "full", "maintenance"];

export interface PublicServer {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  city: string | null;
  region: string | null;
  status: ServerStatus;
  accounts: { current: number; max: number };
  available: boolean;
  unavailableReason: "maintenance" | "full" | "offline" | "service_stopped" | null;
  protocols: { slug: string; name: string }[];
}

export async function listPublicProtocols() {
  const rows = await db()
    .select({
      id: protocols.id,
      slug: protocols.slug,
      name: protocols.name,
      description: protocols.description,
      icon: protocols.icon,
      category: protocols.category,
      durationOptions: protocols.durationOptions,
      defaultDurationDays: protocols.defaultDurationDays,
      serverCount: sql<number>`(select count(*)::int from ${serverProtocols} sp join ${servers} s on s.id = sp.server_id
        where sp.protocol_id = "protocols"."id" and sp.enabled and sp.detected and s.deleted_at is null
        and s.lifecycle in ('active','maintenance') and s.compatibility <> 'unsupported'
        and s.status in ('online','full','maintenance'))`,
    })
    .from(protocols)
    .where(eq(protocols.enabled, true))
    .orderBy(asc(protocols.displayOrder), asc(protocols.name));
  return rows;
}

async function protocolsByServer(serverIds: string[]) {
  const map = new Map<string, { slug: string; name: string }[]>();
  if (!serverIds.length) return map;
  const rows = await db()
    .select({ serverId: serverProtocols.serverId, slug: protocols.slug, name: protocols.name })
    .from(serverProtocols)
    .innerJoin(protocols, eq(protocols.id, serverProtocols.protocolId))
    .where(
      and(
        inArray(serverProtocols.serverId, serverIds),
        eq(serverProtocols.enabled, true),
        eq(serverProtocols.detected, true),
        eq(protocols.enabled, true),
      ),
    )
    .orderBy(asc(protocols.displayOrder));
  for (const r of rows) {
    const list = map.get(r.serverId) ?? [];
    list.push({ slug: r.slug, name: r.name });
    map.set(r.serverId, list);
  }
  return map;
}

/** Servers offered on /<protocol-slug>. Returns null when the protocol does not exist or is disabled. */
export async function getPublicProtocolServers(slug: string) {
  const [protocol] = await db().select().from(protocols).where(and(eq(protocols.slug, slug), eq(protocols.enabled, true))).limit(1);
  if (!protocol) return null;
  const fields = await db()
    .select({
      key: protocolFields.key,
      label: protocolFields.label,
      type: protocolFields.type,
      required: protocolFields.required,
      placeholder: protocolFields.placeholder,
      helpText: protocolFields.helpText,
      options: protocolFields.options,
      validation: protocolFields.validation,
      defaultValue: protocolFields.defaultValue,
    })
    .from(protocolFields)
    .where(eq(protocolFields.protocolId, protocol.id))
    .orderBy(asc(protocolFields.displayOrder));

  const rows = await db()
    .select({
      id: servers.id,
      name: servers.name,
      country: servers.country,
      countryCode: servers.countryCode,
      city: servers.city,
      region: servers.region,
      status: servers.status,
      current: servers.currentAccounts,
      max: servers.maxAccounts,
      spCurrent: serverProtocols.currentAccounts,
      spMax: serverProtocols.maxAccounts,
      serviceStatus: serverProtocols.serviceStatus,
    })
    .from(serverProtocols)
    .innerJoin(servers, eq(servers.id, serverProtocols.serverId))
    .where(
      and(
        eq(serverProtocols.protocolId, protocol.id),
        eq(serverProtocols.enabled, true),
        eq(serverProtocols.detected, true),
        isNull(servers.deletedAt),
        inArray(servers.lifecycle, ["active", "maintenance"]),
        ne(servers.compatibility, "unsupported"),
        inArray(servers.status, LISTED_STATUSES),
      ),
    )
    .orderBy(asc(servers.region), asc(servers.country), asc(servers.name));

  const others = await protocolsByServer(rows.map((r) => r.id));
  const list: PublicServer[] = rows.map((r) => {
    const protoFull = r.spMax !== null && r.spCurrent >= r.spMax;
    const reason: PublicServer["unavailableReason"] =
      r.status === "maintenance"
        ? "maintenance"
        : r.status === "full" || protoFull
          ? "full"
          : r.status !== "online"
            ? "offline"
            : r.serviceStatus === "stopped"
              ? "service_stopped"
              : null;
    return {
      id: r.id,
      name: r.name,
      country: r.country,
      countryCode: r.countryCode,
      city: r.city,
      region: r.region,
      status: r.status,
      accounts: r.spMax !== null ? { current: r.spCurrent, max: r.spMax } : { current: r.current, max: r.max },
      available: reason === null,
      unavailableReason: reason,
      protocols: others.get(r.id) ?? [],
    };
  });

  return {
    protocol: {
      slug: protocol.slug,
      name: protocol.name,
      description: protocol.description,
      icon: protocol.icon,
      category: protocol.category,
      durationOptions: protocol.durationOptions,
      defaultDurationDays: protocol.defaultDurationDays,
      fields,
    },
    servers: list,
  };
}

/** Server status page: every published server, including offline ones. */
export async function listPublicServerStatus() {
  const rows = await db()
    .select({
      id: servers.id,
      name: servers.name,
      country: servers.country,
      countryCode: servers.countryCode,
      city: servers.city,
      region: servers.region,
      status: servers.status,
      current: servers.currentAccounts,
      max: servers.maxAccounts,
      lastSeenAt: servers.lastSeenAt,
    })
    .from(servers)
    .where(and(isNull(servers.deletedAt), inArray(servers.lifecycle, ["active", "maintenance"])))
    .orderBy(asc(servers.region), asc(servers.country), asc(servers.name));
  const others = await protocolsByServer(rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    country: r.country,
    countryCode: r.countryCode,
    city: r.city,
    region: r.region,
    status: r.status,
    accounts: { current: r.current, max: r.max },
    lastSeenAt: r.lastSeenAt?.toISOString() ?? null,
    protocols: others.get(r.id) ?? [],
  }));
}
