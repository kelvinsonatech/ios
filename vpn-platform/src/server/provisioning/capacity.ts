import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { serverProtocols, servers, vpnAccounts } from "@/server/db/schema";
import { refreshServerStatus } from "@/server/servers/status";
import type { QuotaWindow } from "./quota";

/**
 * Capacity counters include pending accounts, so concurrent requests cannot oversubscribe a server.
 * Reservation happens under row locks in the same transaction that creates the pending account.
 *
 * Three limits apply to every new account:
 *  - the server-wide cap (servers.max_accounts, counts live accounts),
 *  - the per-protocol cap (server_protocols.max_accounts, counts live accounts),
 *  - the creation quota (server_protocols.quota_limit, counts creations per quota window).
 * The quota is reset lazily: a row whose quota_window_start is not the current window's start is
 * treated as 0 used. Usage is tracked even without a limit, so a quota set mid-window is accurate.
 */

export type CapacityRefusal = "server_full" | "protocol_full" | "quota_reached";

export type Reservation =
  | { ok: true; quotaWindowStart: Date }
  | { ok: false; reason: CapacityRefusal; /** When the quota resets (quota_reached only). */ resetsAt: Date | null };

export async function reserveCapacity(tx: Tx, serverId: string, serverProtocolId: string, window: QuotaWindow): Promise<Reservation> {
  const [s] = await tx
    .update(servers)
    .set({ currentAccounts: sql`${servers.currentAccounts} + 1` })
    .where(and(eq(servers.id, serverId), sql`${servers.currentAccounts} < ${servers.maxAccounts}`))
    .returning({ id: servers.id });
  if (!s) return { ok: false, reason: "server_full", resetsAt: null };

  const start = sql`${window.start.toISOString()}::timestamptz`;
  const sameWindow = sql`${serverProtocols.quotaWindowStart} is not distinct from ${start}`;
  const [sp] = await tx
    .update(serverProtocols)
    .set({
      currentAccounts: sql`${serverProtocols.currentAccounts} + 1`,
      quotaUsed: sql`case when ${sameWindow} then ${serverProtocols.quotaUsed} + 1 else 1 end`,
      quotaWindowStart: sql`${start}`,
    })
    .where(
      and(
        eq(serverProtocols.id, serverProtocolId),
        sql`(${serverProtocols.maxAccounts} is null or ${serverProtocols.currentAccounts} < ${serverProtocols.maxAccounts})`,
        sql`(${serverProtocols.quotaLimit} is null or not (${sameWindow}) or ${serverProtocols.quotaUsed} < ${serverProtocols.quotaLimit})`,
      ),
    )
    .returning({ id: serverProtocols.id });
  if (sp) return { ok: true, quotaWindowStart: window.start };

  // Undo the server increment so the function never leaves a partial reservation behind.
  await tx
    .update(servers)
    .set({ currentAccounts: sql`greatest(${servers.currentAccounts} - 1, 0)` })
    .where(eq(servers.id, serverId));
  const [row] = await tx
    .select({ max: serverProtocols.maxAccounts, current: serverProtocols.currentAccounts })
    .from(serverProtocols)
    .where(eq(serverProtocols.id, serverProtocolId));
  if (!row || (row.max !== null && row.current >= row.max)) return { ok: false, reason: "protocol_full", resetsAt: null };
  return { ok: false, reason: "quota_reached", resetsAt: window.end };
}

/**
 * Release an account's slot exactly once (guarded by vpn_accounts.holds_capacity).
 * `refundQuota` gives the creation-quota slot back as well; only for definite provisioning failures
 * (the quota counts creations, so revoked or expired accounts never refund it), and only while the
 * server/protocol is still in the window the account was counted in.
 */
export async function releaseCapacity(tx: Tx, accountId: string, opts: { refundQuota?: boolean } = {}): Promise<boolean> {
  const [acc] = await tx
    .update(vpnAccounts)
    .set({ holdsCapacity: false })
    .where(and(eq(vpnAccounts.id, accountId), eq(vpnAccounts.holdsCapacity, true)))
    .returning({ serverId: vpnAccounts.serverId, protocolId: vpnAccounts.protocolId, quotaWindowStart: vpnAccounts.quotaWindowStart });
  if (!acc) return false;
  await tx
    .update(servers)
    .set({ currentAccounts: sql`greatest(${servers.currentAccounts} - 1, 0)` })
    .where(eq(servers.id, acc.serverId));
  const refund =
    opts.refundQuota && acc.quotaWindowStart
      ? sql`case when ${serverProtocols.quotaWindowStart} = ${acc.quotaWindowStart.toISOString()}::timestamptz
          then greatest(${serverProtocols.quotaUsed} - 1, 0) else ${serverProtocols.quotaUsed} end`
      : sql`${serverProtocols.quotaUsed}`;
  await tx
    .update(serverProtocols)
    .set({ currentAccounts: sql`greatest(${serverProtocols.currentAccounts} - 1, 0)`, quotaUsed: refund })
    .where(and(eq(serverProtocols.serverId, acc.serverId), eq(serverProtocols.protocolId, acc.protocolId)));
  await refreshServerStatus(tx, acc.serverId);
  return true;
}
