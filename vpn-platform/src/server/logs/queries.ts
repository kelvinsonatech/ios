import { and, desc, eq, ilike, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, protocols, provisioningLogs, servers, type LogLevel } from "@/server/db/schema";

export const LOG_PAGE_SIZE = 50;

export async function listProvisioningLogs(f: { level?: LogLevel; event?: string; serverId?: string; q?: string; page: number }) {
  const conds: SQL[] = [];
  if (f.level) conds.push(eq(provisioningLogs.level, f.level));
  if (f.event) conds.push(ilike(provisioningLogs.event, `${f.event.replace(/[%_]/g, "")}%`));
  if (f.serverId) conds.push(eq(provisioningLogs.serverId, f.serverId));
  if (f.q) conds.push(ilike(provisioningLogs.message, `%${f.q.replace(/[%_]/g, "")}%`));
  const rows = await db()
    .select({
      id: provisioningLogs.id,
      createdAt: provisioningLogs.createdAt,
      event: provisioningLogs.event,
      level: provisioningLogs.level,
      status: provisioningLogs.status,
      message: provisioningLogs.message,
      durationMs: provisioningLogs.durationMs,
      details: provisioningLogs.details,
      requestId: provisioningLogs.requestId,
      serverId: provisioningLogs.serverId,
      serverName: servers.name,
      protocolName: protocols.name,
    })
    .from(provisioningLogs)
    .leftJoin(servers, eq(servers.id, provisioningLogs.serverId))
    .leftJoin(protocols, eq(protocols.id, provisioningLogs.protocolId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(provisioningLogs.createdAt), desc(provisioningLogs.id))
    .limit(LOG_PAGE_SIZE + 1)
    .offset((f.page - 1) * LOG_PAGE_SIZE);
  return { rows: rows.slice(0, LOG_PAGE_SIZE), hasMore: rows.length > LOG_PAGE_SIZE };
}

export async function listAuditLogs(f: { action?: string; q?: string; page: number }) {
  const conds: SQL[] = [];
  if (f.action) conds.push(ilike(auditLogs.action, `${f.action.replace(/[%_]/g, "")}%`));
  if (f.q) conds.push(sql`(${auditLogs.adminEmail} ilike ${`%${f.q.replace(/[%_]/g, "")}%`} or ${auditLogs.targetId} = ${f.q})`);
  const rows = await db()
    .select()
    .from(auditLogs)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
    .limit(LOG_PAGE_SIZE + 1)
    .offset((f.page - 1) * LOG_PAGE_SIZE);
  return { rows: rows.slice(0, LOG_PAGE_SIZE), hasMore: rows.length > LOG_PAGE_SIZE };
}
