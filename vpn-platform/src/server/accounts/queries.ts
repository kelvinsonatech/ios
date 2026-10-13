import { and, desc, eq, gte, ilike, lte, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { accountStatus, protocols, servers, vpnAccounts, type AccountStatus } from "@/server/db/schema";

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

/** Admin account list. Only safe metadata is ever stored, so nothing secret can leak from here. */
export async function listAccounts(f: AccountFilters) {
  const conds: SQL[] = [];
  if (f.q) conds.push(ilike(vpnAccounts.username, `%${f.q.replace(/[%_]/g, "")}%`));
  if (f.serverId) conds.push(eq(vpnAccounts.serverId, f.serverId));
  if (f.protocol) conds.push(eq(protocols.slug, f.protocol));
  if (f.status) conds.push(eq(vpnAccounts.status, f.status));
  if (f.country) conds.push(eq(servers.countryCode, f.country));
  if (f.createdFrom) conds.push(gte(vpnAccounts.createdAt, f.createdFrom));
  if (f.createdTo) conds.push(lte(vpnAccounts.createdAt, new Date(f.createdTo.getTime() + 86_400_000)));
  if (f.expiresBefore) conds.push(lte(vpnAccounts.expiresAt, f.expiresBefore));
  const rows = await db()
    .select({
      id: vpnAccounts.id,
      username: vpnAccounts.username,
      status: vpnAccounts.status,
      createdAt: vpnAccounts.createdAt,
      expiresAt: vpnAccounts.expiresAt,
      durationDays: vpnAccounts.durationDays,
      remoteAccountId: vpnAccounts.remoteAccountId,
      failureMessage: vpnAccounts.failureMessage,
      metadata: vpnAccounts.metadata,
      serverId: servers.id,
      serverName: servers.name,
      countryCode: servers.countryCode,
      protocolName: protocols.name,
      protocolSlug: protocols.slug,
    })
    .from(vpnAccounts)
    .innerJoin(servers, eq(servers.id, vpnAccounts.serverId))
    .innerJoin(protocols, eq(protocols.id, vpnAccounts.protocolId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(vpnAccounts.createdAt))
    .limit(ACCOUNT_PAGE_SIZE + 1)
    .offset((f.page - 1) * ACCOUNT_PAGE_SIZE);
  return { rows: rows.slice(0, ACCOUNT_PAGE_SIZE), hasMore: rows.length > ACCOUNT_PAGE_SIZE };
}
