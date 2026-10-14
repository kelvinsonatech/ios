import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { protocols, provisioningLogs, serverReports, servers, vpnAccounts, type ReportStatus } from "@/server/db/schema";
import { startOfLocalDay } from "@/server/provisioning/quota";
import { getSiteSettings } from "@/server/settings/service";

const ACTIVITY_EVENTS = [
  "server.added",
  "server.offline",
  "server.restored",
  "server.synced",
  "server.published",
  "server.deleted",
  "server.lifecycle_changed",
  "account.created",
  "account.failed",
  "account.revoked",
];

/** Problem reports per status (Admin → Reports tabs, dashboard). Queried here so the counters work on their own. */
export async function countReportsByStatus(): Promise<Record<ReportStatus, number>> {
  const rows = await db()
    .select({ status: serverReports.status, count: sql<number>`count(*)::int` })
    .from(serverReports)
    .groupBy(serverReports.status);
  const out: Record<ReportStatus, number> = { open: 0, resolved: 0 };
  for (const r of rows) out[r.status] = r.count;
  return out;
}

export async function getDashboardData() {
  const now = new Date();
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const twoWeeksAgo = new Date(startOfDay.getTime() - 13 * 86_400_000);
  // "Created today" follows the site's quota time zone, so it matches the day users see on the public site.
  const { timezone } = (await getSiteSettings()).quota;
  const localDay = startOfLocalDay(now, timezone);
  // Raw sql fragments need explicit timestamptz parameters (Dates are only mapped for column operators).
  const dayTs = sql`${localDay.toISOString()}::timestamptz`;
  const monthTs = sql`${startOfMonth.toISOString()}::timestamptz`;

  const [statusCounts, accountCounts, protocolUsage, capacity, recentErrors, activity, trend, reports] = await Promise.all([
    db()
      .select({ status: servers.status, count: sql<number>`count(*)::int` })
      .from(servers)
      .where(isNull(servers.deletedAt))
      .groupBy(servers.status),
    db()
      .select({
        active: sql<number>`count(*) filter (where ${vpnAccounts.status} = 'active')::int`,
        today: sql<number>`count(*) filter (where ${vpnAccounts.activatedAt} >= ${dayTs})::int`,
        month: sql<number>`count(*) filter (where ${vpnAccounts.activatedAt} >= ${monthTs})::int`,
        failedToday: sql<number>`count(*) filter (where ${vpnAccounts.status} = 'failed' and ${vpnAccounts.createdAt} >= ${dayTs})::int`,
      })
      .from(vpnAccounts),
    db()
      .select({
        name: protocols.name,
        slug: protocols.slug,
        icon: protocols.icon,
        active: sql<number>`count(${vpnAccounts.id}) filter (where ${vpnAccounts.status} = 'active')::int`,
        month: sql<number>`count(${vpnAccounts.id}) filter (where ${vpnAccounts.activatedAt} >= ${monthTs})::int`,
      })
      .from(protocols)
      .leftJoin(vpnAccounts, eq(vpnAccounts.protocolId, protocols.id))
      .where(eq(protocols.enabled, true))
      .groupBy(protocols.id)
      .orderBy(desc(sql`count(${vpnAccounts.id}) filter (where ${vpnAccounts.status} = 'active')`), protocols.displayOrder),
    db()
      .select({
        id: servers.id,
        name: servers.name,
        countryCode: servers.countryCode,
        status: servers.status,
        current: servers.currentAccounts,
        max: servers.maxAccounts,
      })
      .from(servers)
      .where(and(isNull(servers.deletedAt), ne(servers.lifecycle, "draft")))
      .orderBy(desc(sql`${servers.currentAccounts}::float / greatest(${servers.maxAccounts}, 1)`))
      .limit(8),
    db()
      .select({
        id: provisioningLogs.id,
        createdAt: provisioningLogs.createdAt,
        event: provisioningLogs.event,
        message: provisioningLogs.message,
        serverId: provisioningLogs.serverId,
      })
      .from(provisioningLogs)
      .where(eq(provisioningLogs.level, "error"))
      .orderBy(desc(provisioningLogs.createdAt))
      .limit(6),
    db()
      .select({
        id: provisioningLogs.id,
        createdAt: provisioningLogs.createdAt,
        event: provisioningLogs.event,
        message: provisioningLogs.message,
        status: provisioningLogs.status,
        level: provisioningLogs.level,
      })
      .from(provisioningLogs)
      .where(inArray(provisioningLogs.event, ACTIVITY_EVENTS))
      .orderBy(desc(provisioningLogs.createdAt))
      .limit(12),
    db()
      .select({
        day: sql<string>`to_char(date_trunc('day', ${vpnAccounts.activatedAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(vpnAccounts)
      .where(and(isNotNull(vpnAccounts.activatedAt), gte(vpnAccounts.activatedAt, twoWeeksAgo)))
      .groupBy(sql`1`),
    countReportsByStatus(),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((r) => [r.status, r.count])) as Record<string, number>;
  const totalServers = statusCounts.reduce((a, r) => a + r.count, 0);
  const trendMap = new Map(trend.map((t) => [t.day, t.count]));
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(twoWeeksAgo.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    return { day: d, count: trendMap.get(d) ?? 0 };
  });

  return {
    servers: {
      total: totalServers,
      online: byStatus.online ?? 0,
      offline: byStatus.offline ?? 0,
      maintenance: byStatus.maintenance ?? 0,
      full: byStatus.full ?? 0,
      disabled: byStatus.disabled ?? 0,
      pending: byStatus.pending ?? 0,
    },
    accounts: accountCounts[0] ?? { active: 0, today: 0, month: 0, failedToday: 0 },
    /** Start of "today" for the account counters, and the zone it is expressed in. */
    today: { since: localDay, timezone },
    reports,
    protocolUsage,
    capacity,
    recentErrors,
    activity,
    trend: days,
  };
}
