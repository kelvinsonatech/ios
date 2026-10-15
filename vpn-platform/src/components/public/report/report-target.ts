import type { StatusPageData } from "@/lib/public/types";

/**
 * Server choices of the "Report a problem" form, shared by the /report page (server) and the form
 * (client). Plain module on purpose: functions exported from a "use client" file cannot be called
 * from server components. A choice is encoded as "<protocol>|<serverId>" ("<protocol>|" = any
 * server of that protocol, "" = not sure).
 */
export interface ReportServerOption {
  protocol: { slug: string; name: string };
  servers: { id: string; name: string; location: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export function encodeTarget(protocol: string, serverId: string | null): string {
  return `${protocol}|${serverId ?? ""}`;
}

export function decodeTarget(v: string): { protocol: string | null; serverId: string | null } {
  if (!v) return { protocol: null, serverId: null };
  const [protocol, serverId] = v.split("|");
  return {
    protocol: protocol && SLUG.test(protocol) ? protocol : null,
    serverId: serverId && UUID.test(serverId) ? serverId : null,
  };
}

/** One group per protocol with every listed server ("Germany 01 — Frankfurt, Germany"). */
export function reportOptionsFromStatus(status: StatusPageData | null): ReportServerOption[] {
  return (status?.sections ?? []).map((sec) => ({
    protocol: { slug: sec.protocol.slug, name: sec.protocol.name },
    servers: sec.servers.map((s) => ({ id: s.id, name: s.name, location: [s.city, s.country.name].filter(Boolean).join(", ") })),
  }));
}

/** Preselected choice from ?server=&protocol= (ignored unless it matches a listed option). */
export function initialTarget(options: ReportServerOption[], serverId: string | null, protocol: string | null): string {
  if (serverId) {
    const exact = options.find((o) => (!protocol || o.protocol.slug === protocol) && o.servers.some((s) => s.id === serverId));
    if (exact) return encodeTarget(exact.protocol.slug, serverId);
  }
  if (protocol && options.some((o) => o.protocol.slug === protocol)) return encodeTarget(protocol, null);
  return "";
}

/** Readable name of a preselected choice ("VLESS · Germany 01"), or null. */
export function targetLabel(options: ReportServerOption[], value: string): string | null {
  const t = decodeTarget(value);
  if (!t.protocol) return null;
  const group = options.find((o) => o.protocol.slug === t.protocol);
  if (!group) return null;
  const server = t.serverId ? group.servers.find((s) => s.id === t.serverId) : null;
  return server ? `${group.protocol.name} · ${server.name}` : `Any ${group.protocol.name} server`;
}
