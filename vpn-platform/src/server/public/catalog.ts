import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { protocolFields, protocols, serverProtocols, servers, vpnAccounts, type PortMap, type ServerStatus } from "@/server/db/schema";
import { captchaSiteKey } from "@/server/captcha";
import { quotaWindow, startOfLocalDay, type QuotaWindow } from "@/server/provisioning/quota";
import { getSiteSettings } from "@/server/settings/service";
import { countryName } from "@/lib/countries";
import { countryCodeFromSlug, countrySlug, SERVER_SLUG_PATTERN } from "@/lib/slug";
import type {
  Availability,
  CountryPageData,
  ProtocolPageData,
  PublicCapacity,
  PublicCountry,
  PublicCountrySummary,
  PublicFormField,
  PublicProtocolDetail,
  PublicProtocolSummary,
  PublicServerCard,
  PublicSiteSettings,
  ServerPageData,
  SitemapEntry,
  SiteStats,
  StatusPageData,
} from "@/lib/public/types";
import { cached } from "./cache";

/**
 * Read-only public catalogue used by the public pages and /api/public/*.
 * Listing rules (the auto-publishing query; nothing is hard-coded in the frontend):
 *   protocol.enabled AND server_protocol.enabled AND server_protocol.detected AND server published
 *   (lifecycle active|maintenance, not deleted, compatibility <> unsupported).
 * Browse pages list servers whose status is online|full|maintenance; the status page also lists
 * offline ones (and a server page stays reachable while its server is offline, showing why; a
 * country page whose servers are all offline returns servers: [] for its empty state).
 * All functions return null for unknown/disabled slugs (pages call notFound()).
 *
 * Only safe metadata leaves this module: never IP addresses, management API ports or credentials.
 * The VPN hostname is included only when settings.display.showHostnames is on.
 * Results are cached per process for a few seconds (CACHE_MS / STATUS_CACHE_MS); every page load
 * costs at most a handful of queries, independent of the number of servers.
 */

const CACHE_MS = 10_000;
const STATUS_CACHE_MS = 5_000;
const BROWSE_STATUSES: ServerStatus[] = ["online", "full", "maintenance"];
const PROTOCOL_SLUG = /^[a-z0-9][a-z0-9-]{0,47}$/;
const COUNTRY_SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** Fixed-key entries are never evicted by URL-derived ones (see cached()). */
const PINNED = { pinned: true };

export const STATIC_PAGES = ["/about", "/contact", "/privacy", "/terms", "/acceptable-use", "/server-status", "/report"];

// ---------------------------------------------------------------------------
// Snapshot: one query for every listed (server, protocol) pair
// ---------------------------------------------------------------------------

interface ProtocolRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  displayOrder: number;
  durationOptions: number[];
  defaultDurationDays: number;
}

interface Row {
  protocolId: string;
  server: {
    id: string;
    slug: string;
    name: string;
    hostname: string;
    countryCode: string;
    city: string | null;
    region: string | null;
    status: ServerStatus;
    lifecycle: string;
    compatibility: string;
    maxAccounts: number;
    currentAccounts: number;
    lastLatencyMs: number | null;
    lastHealthCheckAt: Date | null;
    publishedAt: Date | null;
  };
  sp: {
    serviceStatus: string;
    ports: PortMap;
    transports: string[];
    maxAccounts: number | null;
    currentAccounts: number;
    quotaLimit: number | null;
    quotaUsed: number;
    quotaWindowStart: Date | null;
  };
}

interface Snapshot {
  /** Enabled protocols in display order. */
  protocols: ProtocolRow[];
  /** Listed pairs (including offline servers). */
  rows: Row[];
  /** Server id → listed protocol ids. */
  protocolsByServer: Map<string, Set<string>>;
  window: QuotaWindow;
  showHostnames: boolean;
}

async function loadSnapshot(): Promise<Snapshot> {
  const settings = await getSiteSettings();
  const window = quotaWindow(new Date(), settings.quota.resetTimes, settings.quota.timezone);
  const [protocolRows, rows] = await Promise.all([
    db()
      .select({
        id: protocols.id,
        slug: protocols.slug,
        name: protocols.name,
        description: protocols.description,
        icon: protocols.icon,
        category: protocols.category,
        displayOrder: protocols.displayOrder,
        durationOptions: protocols.durationOptions,
        defaultDurationDays: protocols.defaultDurationDays,
      })
      .from(protocols)
      .where(eq(protocols.enabled, true))
      .orderBy(asc(protocols.displayOrder), asc(protocols.name)),
    db()
      .select({
        protocolId: serverProtocols.protocolId,
        // Deliberately no ip_address / api_port / credentials here.
        server: {
          id: servers.id,
          slug: servers.slug,
          name: servers.name,
          hostname: servers.hostname,
          countryCode: servers.countryCode,
          city: servers.city,
          region: servers.region,
          status: servers.status,
          lifecycle: servers.lifecycle,
          compatibility: servers.compatibility,
          maxAccounts: servers.maxAccounts,
          currentAccounts: servers.currentAccounts,
          lastLatencyMs: servers.lastLatencyMs,
          lastHealthCheckAt: servers.lastHealthCheckAt,
          publishedAt: servers.publishedAt,
        },
        sp: {
          serviceStatus: serverProtocols.serviceStatus,
          ports: serverProtocols.ports,
          transports: serverProtocols.transports,
          maxAccounts: serverProtocols.maxAccounts,
          currentAccounts: serverProtocols.currentAccounts,
          quotaLimit: serverProtocols.quotaLimit,
          quotaUsed: serverProtocols.quotaUsed,
          quotaWindowStart: serverProtocols.quotaWindowStart,
        },
      })
      .from(serverProtocols)
      .innerJoin(servers, eq(servers.id, serverProtocols.serverId))
      .innerJoin(protocols, eq(protocols.id, serverProtocols.protocolId))
      .where(
        and(
          eq(protocols.enabled, true),
          eq(serverProtocols.enabled, true),
          eq(serverProtocols.detected, true),
          isNull(servers.deletedAt),
          inArray(servers.lifecycle, ["active", "maintenance"]),
          ne(servers.compatibility, "unsupported"),
        ),
      ),
  ]);
  const protocolsByServer = new Map<string, Set<string>>();
  for (const r of rows) protocolsByServer.set(r.server.id, (protocolsByServer.get(r.server.id) ?? new Set()).add(r.protocolId));
  return { protocols: protocolRows, rows: rows as Row[], protocolsByServer, window, showHostnames: settings.display.showHostnames };
}

function snapshot(): Promise<Snapshot> {
  return cached("snapshot", STATUS_CACHE_MS, loadSnapshot, PINNED);
}

// ---------------------------------------------------------------------------
// Derivations (pure)
// ---------------------------------------------------------------------------

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "en", { numeric: true, sensitivity: "base" });

function country(code: string): PublicCountry {
  const upper = code.toUpperCase();
  return { code: upper, slug: countrySlug(upper), name: countryName(upper) };
}

/** min(server cap, protocol cap, quota) for one row; see PublicCapacity. */
export function capacityOf(row: Pick<Row, "server" | "sp">, window: QuotaWindow): PublicCapacity {
  const serverRemaining = Math.max(0, row.server.maxAccounts - row.server.currentAccounts);
  const protocolRemaining = row.sp.maxAccounts === null ? null : Math.max(0, row.sp.maxAccounts - row.sp.currentAccounts);
  let quotaRemaining: number | null = null;
  if (row.sp.quotaLimit !== null) {
    const sameWindow = row.sp.quotaWindowStart?.getTime() === window.start.getTime();
    quotaRemaining = Math.max(0, row.sp.quotaLimit - (sameWindow ? row.sp.quotaUsed : 0));
  }
  const candidates = [serverRemaining, protocolRemaining, quotaRemaining].filter((v): v is number => v !== null);
  const remaining = Math.min(...candidates);
  let limit: number;
  if (row.sp.quotaLimit !== null) limit = row.sp.quotaLimit;
  else if (protocolRemaining !== null && protocolRemaining <= serverRemaining) limit = row.sp.maxAccounts!;
  else limit = row.server.maxAccounts;
  return { remaining, limit, quotaResetsAt: row.sp.quotaLimit !== null ? window.end.toISOString() : null };
}

/** maintenance > offline > service_stopped > full > available. */
export function availabilityOf(row: Pick<Row, "server" | "sp">, capacity: PublicCapacity): Availability {
  if (row.server.lifecycle === "maintenance" || row.server.status === "maintenance") return "maintenance";
  if (row.server.status === "offline" || row.server.compatibility === "unsupported") return "offline";
  if (row.sp.serviceStatus === "stopped") return "service_stopped";
  if (row.server.status === "full" || capacity.remaining === 0) return "full";
  return "available";
}

const AVAILABILITY_RANK: Record<Availability, number> = { available: 0, full: 1, service_stopped: 2, maintenance: 3, offline: 4 };

function isBrowsable(row: Row) {
  return BROWSE_STATUSES.includes(row.server.status);
}

function card(snap: Snapshot, row: Row, protocol: ProtocolRow): PublicServerCard {
  const capacity = capacityOf(row, snap.window);
  const c = country(row.server.countryCode);
  const offered = snap.protocolsByServer.get(row.server.id);
  const others = snap.protocols.filter((p) => p.id !== protocol.id && offered?.has(p.id)).map((p) => ({ slug: p.slug, name: p.name }));
  return {
    id: row.server.id,
    slug: row.server.slug,
    name: row.server.name,
    hostname: snap.showHostnames ? row.server.hostname : null,
    country: c,
    city: row.server.city,
    region: row.server.region,
    status: row.server.status,
    availability: availabilityOf(row, capacity),
    latencyMs: row.server.lastLatencyMs,
    lastCheckedAt: row.server.lastHealthCheckAt?.toISOString() ?? null,
    capacity,
    ports: row.sp.ports ?? {},
    transports: row.sp.transports ?? [],
    otherProtocols: others,
    href: `/${protocol.slug}/${c.slug}/${row.server.slug}`,
  };
}

function cardsFor(snap: Snapshot, protocol: ProtocolRow, filter: (r: Row) => boolean): PublicServerCard[] {
  return snap.rows
    .filter((r) => r.protocolId === protocol.id && filter(r))
    .map((r) => card(snap, r, protocol))
    .sort((a, b) => a.country.name.localeCompare(b.country.name) || byName(a, b));
}

function summary(snap: Snapshot, p: ProtocolRow): PublicProtocolSummary {
  const cards = cardsFor(snap, p, isBrowsable);
  const countries = new Map<string, PublicCountry>();
  for (const c of cards) countries.set(c.country.code, c.country);
  return {
    slug: p.slug,
    name: p.name,
    description: p.description,
    icon: p.icon,
    category: p.category,
    serverCount: cards.length,
    availableCount: cards.filter((c) => c.availability === "available").length,
    countries: [...countries.values()].sort(byName),
    durationOptions: p.durationOptions,
    defaultDurationDays: p.defaultDurationDays,
    href: `/${p.slug}`,
  };
}

async function formFields(protocolId: string): Promise<PublicFormField[]> {
  const rows = await db()
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
    .where(eq(protocolFields.protocolId, protocolId))
    .orderBy(asc(protocolFields.displayOrder));
  return rows.map((f) => ({ ...f, options: f.options ?? [], validation: f.validation ?? {} }));
}

async function detail(snap: Snapshot, p: ProtocolRow): Promise<PublicProtocolDetail> {
  return { ...summary(snap, p), fields: await formFields(p.id) };
}

function findProtocol(snap: Snapshot, slug: string): ProtocolRow | null {
  if (!PROTOCOL_SLUG.test(slug)) return null;
  return snap.protocols.find((p) => p.slug === slug) ?? null;
}

function countrySummaries(cards: PublicServerCard[], protocolSlug: string): PublicCountrySummary[] {
  const groups = new Map<string, PublicServerCard[]>();
  for (const c of cards) groups.set(c.country.code, [...(groups.get(c.country.code) ?? []), c]);
  return [...groups.values()]
    .map((list) => {
      const c = list[0]!.country;
      const latencies = list.map((s) => s.latencyMs).filter((v): v is number => v !== null);
      // Only servers that can create accounts right now count (maintenance/offline/stopped contribute 0).
      const usable = list.filter((s) => s.availability === "available");
      const remaining = usable.some((s) => s.capacity.remaining === null) ? null : usable.reduce((sum, s) => sum + (s.capacity.remaining ?? 0), 0);
      const best = list.map((s) => s.availability).sort((a, b) => AVAILABILITY_RANK[a] - AVAILABILITY_RANK[b])[0]!;
      return {
        ...c,
        region: list.find((s) => s.region)?.region ?? null,
        serverCount: list.length,
        availableCount: list.filter((s) => s.availability === "available").length,
        remaining,
        availability: best,
        bestLatencyMs: latencies.length ? Math.min(...latencies) : null,
        href: `/${protocolSlug}/${c.slug}`,
      };
    })
    .sort(byName);
}

// ---------------------------------------------------------------------------
// Public API (signatures are the contract with the UI lanes)
// ---------------------------------------------------------------------------

export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  const s = await getSiteSettings();
  return {
    siteName: s.siteName,
    tagline: s.tagline,
    seoDescription: s.seoDescription,
    announcement: s.announcement,
    contact: s.contact,
    rules: s.rules,
    avatarStyle: s.avatarStyle,
    display: s.display,
    quota: { resetTimes: s.quota.resetTimes, timezone: s.quota.timezone },
    captchaSiteKey: captchaSiteKey(),
  };
}

/** Enabled protocols that have at least one published server (offline ones included), in display order. */
export async function listProtocolSummaries(): Promise<PublicProtocolSummary[]> {
  return cached("protocols", CACHE_MS, async () => {
    const snap = await snapshot();
    return snap.protocols.filter((p) => snap.rows.some((r) => r.protocolId === p.id)).map((p) => summary(snap, p));
  }, PINNED);
}

export async function getProtocolPage(protocolSlug: string): Promise<ProtocolPageData | null> {
  // Malformed input is rejected before it can occupy a cache entry.
  if (!PROTOCOL_SLUG.test(protocolSlug)) return null;
  return cached(`protocol:${protocolSlug}`, CACHE_MS, async () => {
    const snap = await snapshot();
    const p = findProtocol(snap, protocolSlug);
    if (!p) return null;
    return { protocol: await detail(snap, p), countries: countrySummaries(cardsFor(snap, p, isBrowsable), p.slug) };
  });
}

export async function getCountryPage(protocolSlug: string, countrySlugValue: string): Promise<CountryPageData | null> {
  if (!PROTOCOL_SLUG.test(protocolSlug) || !COUNTRY_SLUG.test(countrySlugValue)) return null;
  const code = countryCodeFromSlug(countrySlugValue);
  if (!code) return null;
  return cached(`country:${protocolSlug}:${countrySlugValue}`, CACHE_MS, async () => {
    const snap = await snapshot();
    const p = findProtocol(snap, protocolSlug);
    if (!p) return null;
    const inCountry = (r: Row) => r.server.countryCode.toUpperCase() === code;
    // A country whose listed servers are all offline keeps its page (empty state, servers: []), so
    // its server pages stay reachable too; only countries with no listed server at all are unknown.
    if (!snap.rows.some((r) => r.protocolId === p.id && inCountry(r))) return null;
    const list = cardsFor(snap, p, (r) => isBrowsable(r) && inCountry(r));
    return { protocol: await detail(snap, p), country: country(code), servers: list };
  });
}

export async function getServerPage(protocolSlug: string, countrySlugValue: string, serverSlug: string): Promise<ServerPageData | null> {
  if (!PROTOCOL_SLUG.test(protocolSlug) || !SERVER_SLUG_PATTERN.test(serverSlug) || !COUNTRY_SLUG.test(countrySlugValue)) return null;
  const code = countryCodeFromSlug(countrySlugValue);
  if (!code) return null;
  return cached(`server:${protocolSlug}:${countrySlugValue}:${serverSlug}`, CACHE_MS, async () => {
    const snap = await snapshot();
    const p = findProtocol(snap, protocolSlug);
    if (!p) return null;
    const row = snap.rows.find((r) => r.protocolId === p.id && r.server.slug === serverSlug && r.server.countryCode.toUpperCase() === code);
    if (!row) return null;
    return { protocol: await detail(snap, p), country: country(code), server: card(snap, row, p) };
  });
}

export async function getStatusPage(): Promise<StatusPageData> {
  return cached("status", STATUS_CACHE_MS, async () => {
    const snap = await snapshot();
    const sections = snap.protocols
      .map((p) => ({ protocol: { slug: p.slug, name: p.name, icon: p.icon, href: `/${p.slug}` }, servers: cardsFor(snap, p, () => true) }))
      .filter((s) => s.servers.length > 0);
    const statusByServer = new Map(snap.rows.map((r) => [r.server.id, r.server.status]));
    const count = (st: ServerStatus) => [...statusByServer.values()].filter((v) => v === st).length;
    return {
      generatedAt: new Date().toISOString(),
      totals: {
        protocols: sections.length,
        servers: statusByServer.size,
        online: count("online"),
        offline: count("offline"),
        maintenance: count("maintenance"),
        // Services (server + protocol) that cannot take accounts right now because they are full.
        full: sections.reduce((n, s) => n + s.servers.filter((c) => c.availability === "full").length, 0),
      },
      sections,
    };
  }, PINNED);
}

/** Accounts ever activated (active, expired or revoked), in total and since local midnight, per protocol. */
export async function getSiteStats(): Promise<SiteStats> {
  return cached("stats", CACHE_MS, async () => {
    const settings = await getSiteSettings();
    const since = startOfLocalDay(new Date(), settings.quota.timezone);
    const [snap, counts] = await Promise.all([
      snapshot(),
      db()
        .select({
          protocolId: vpnAccounts.protocolId,
          total: sql<number>`count(*)::int`,
          today: sql<number>`(count(*) filter (where ${vpnAccounts.createdAt} >= ${since.toISOString()}::timestamptz))::int`,
        })
        .from(vpnAccounts)
        .where(inArray(vpnAccounts.status, ["active", "expired", "revoked"]))
        .groupBy(vpnAccounts.protocolId),
    ]);
    const byId = new Map(counts.map((c) => [c.protocolId, c]));
    const byProtocol = snap.protocols
      .filter((p) => byId.has(p.id) || snap.rows.some((r) => r.protocolId === p.id))
      .map((p) => ({ slug: p.slug, name: p.name, total: byId.get(p.id)?.total ?? 0, today: byId.get(p.id)?.today ?? 0 }));
    const browsable = snap.rows.filter(isBrowsable);
    const reachable = new Set(snap.rows.filter((r) => r.server.status === "online" || r.server.status === "full").map((r) => r.server.id));
    return {
      accountsTotal: counts.reduce((s, c) => s + c.total, 0),
      accountsToday: counts.reduce((s, c) => s + c.today, 0),
      serversOnline: reachable.size,
      countries: new Set(browsable.map((r) => r.server.countryCode.toUpperCase())).size,
      byProtocol,
    };
  }, PINNED);
}

export async function listSitemapEntries(): Promise<SitemapEntry[]> {
  return cached("sitemap", CACHE_MS, async () => {
    const snap = await snapshot();
    const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
    const latest = (rows: Row[]) => rows.reduce<Date | null>((m, r) => (r.server.publishedAt && (!m || r.server.publishedAt > m) ? r.server.publishedAt : m), null);
    const entries: SitemapEntry[] = [{ path: "/", lastModified: null }, ...STATIC_PAGES.map((path) => ({ path, lastModified: null }))];
    for (const p of snap.protocols) {
      const rows = snap.rows.filter((r) => r.protocolId === p.id && isBrowsable(r));
      if (!rows.length) continue;
      entries.push({ path: `/${p.slug}`, lastModified: iso(latest(rows)) });
      const byCountry = new Map<string, Row[]>();
      for (const r of rows) byCountry.set(r.server.countryCode.toUpperCase(), [...(byCountry.get(r.server.countryCode.toUpperCase()) ?? []), r]);
      for (const [code, list] of [...byCountry.entries()].sort((a, b) => countryName(a[0]).localeCompare(countryName(b[0])))) {
        const cs = countrySlug(code);
        entries.push({ path: `/${p.slug}/${cs}`, lastModified: iso(latest(list)) });
        for (const r of [...list].sort((a, b) => byName(a.server, b.server))) {
          entries.push({ path: `/${p.slug}/${cs}/${r.server.slug}`, lastModified: iso(r.server.publishedAt) });
        }
      }
    }
    return entries;
  }, PINNED);
}
