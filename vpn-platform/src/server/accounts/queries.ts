import { and, desc, eq, gte, ilike, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { accountStatus, admins, protocols, servers, vpnAccounts, type AccountStatus } from "@/server/db/schema";
import { redactObject } from "@/server/logging/redact";

export const ACCOUNT_PAGE_SIZE = 50;

export interface AccountFilters {
  q?: string;
  serverId?: string;
  protocol?: string;
  status?: AccountStatus;
  country?: string;
  createdFrom?: Date;
  createdTo?: Date;
  expiresBefore?: Date;
  page: number;
}

export function parseAccountFilters(sp: Record<string, string | string[] | undefined>): AccountFilters {
  const s = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : undefined) || undefined;
  const date = (k: string) => {
    const v = s(k);
    const d = v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : undefined;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  };
  const uuid = (k: string) => {
    const v = s(k);
    return v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined;
  };
  const status = s("status");
  return {
    q: s("q")?.slice(0, 64),
    serverId: uuid("server"),
    protocol: s("protocol")?.slice(0, 48),
    status: status && (accountStatus.enumValues as readonly string[]).includes(status) ? (status as AccountStatus) : undefined,
    country: s("country")?.toUpperCase().slice(0, 2),
    createdFrom: date("from"),
    createdTo: date("to"),
    expiresBefore: date("expires"),
    page: Math.max(1, Math.min(1000, Number(s("page") ?? 1) || 1)),
  };
}

function filterConditions(f: AccountFilters, opts: { status: boolean }): SQL[] {
  const conds: SQL[] = [];
  if (f.q) conds.push(ilike(vpnAccounts.username, `%${f.q.replace(/[%_]/g, "")}%`));
  if (f.serverId) conds.push(eq(vpnAccounts.serverId, f.serverId));
  if (f.protocol) conds.push(eq(protocols.slug, f.protocol));
  if (opts.status && f.status) conds.push(eq(vpnAccounts.status, f.status));
  if (f.country) conds.push(eq(servers.countryCode, f.country));
  if (f.createdFrom) conds.push(gte(vpnAccounts.createdAt, f.createdFrom));
  if (f.createdTo) conds.push(lte(vpnAccounts.createdAt, new Date(f.createdTo.getTime() + 86_400_000)));
  if (f.expiresBefore) conds.push(lte(vpnAccounts.expiresAt, f.expiresBefore));
  return conds;
}

/** Admin account list. Only safe metadata is ever stored, so nothing secret can leak from here. */
export async function listAccounts(f: AccountFilters) {
  const conds = filterConditions(f, { status: true });
  const rows = await db()
    .select({
      id: vpnAccounts.id,
      username: vpnAccounts.username,
      status: vpnAccounts.status,
      createdAt: vpnAccounts.createdAt,
      expiresAt: vpnAccounts.expiresAt,
      durationDays: vpnAccounts.durationDays,
      activatedAt: vpnAccounts.activatedAt,
      revokedAt: vpnAccounts.revokedAt,
      revokedByEmail: admins.email,
      remoteAccountId: vpnAccounts.remoteAccountId,
      failureCode: vpnAccounts.failureCode,
      failureMessage: vpnAccounts.failureMessage,
      metadata: vpnAccounts.metadata,
      serverId: servers.id,
      serverName: servers.name,
      serverSlug: servers.slug,
      countryCode: servers.countryCode,
      country: servers.country,
      protocolName: protocols.name,
      protocolSlug: protocols.slug,
      protocolIcon: protocols.icon,
    })
    .from(vpnAccounts)
    .innerJoin(servers, eq(servers.id, vpnAccounts.serverId))
    .innerJoin(protocols, eq(protocols.id, vpnAccounts.protocolId))
    .leftJoin(admins, eq(admins.id, vpnAccounts.revokedBy))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(vpnAccounts.createdAt))
    .limit(ACCOUNT_PAGE_SIZE + 1)
    .offset((f.page - 1) * ACCOUNT_PAGE_SIZE);
  return {
    // Metadata is non-secret by design (host, ports, transport...); redacting again is defence in depth.
    rows: rows.slice(0, ACCOUNT_PAGE_SIZE).map((r) => ({ ...r, metadata: redactObject(r.metadata) })),
    hasMore: rows.length > ACCOUNT_PAGE_SIZE,
  };
}

export type AdminAccountRow = Awaited<ReturnType<typeof listAccounts>>["rows"][number];

/** Accounts per status for the status chips, with every other filter applied. */
export async function countAccountsByStatus(f: AccountFilters): Promise<Record<AccountStatus, number>> {
  const conds = filterConditions(f, { status: false });
  const rows = await db()
    .select({ status: vpnAccounts.status, count: sql<number>`count(*)::int` })
    .from(vpnAccounts)
    .innerJoin(servers, eq(servers.id, vpnAccounts.serverId))
    .innerJoin(protocols, eq(protocols.id, vpnAccounts.protocolId))
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(vpnAccounts.status);
  const out = Object.fromEntries(accountStatus.enumValues.map((s) => [s, 0])) as Record<AccountStatus, number>;
  for (const r of rows) out[r.status] = r.count;
  return out;
}

/** Status and node id of one account (for the revoke action's pre-checks). */
export async function getAccountState(id: string) {
  const [row] = await db()
    .select({ id: vpnAccounts.id, status: vpnAccounts.status, username: vpnAccounts.username, remoteAccountId: vpnAccounts.remoteAccountId })
    .from(vpnAccounts)
    .where(eq(vpnAccounts.id, id))
    .limit(1);
  return row ?? null;
}
