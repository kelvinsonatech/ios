import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/server/db";
import { serverProtocols, servers, vpnAccounts } from "@/server/db/schema";
import { refreshServerStatus } from "@/server/servers/status";

/**
 * Capacity counters include pending accounts, so concurrent requests cannot oversubscribe a server.
 * Reservation happens under row locks in the same transaction that creates the pending account.
 */
export async function reserveCapacity(tx: Tx, serverId: string, serverProtocolId: string): Promise<boolean> {
  const [s] = await tx
    .update(servers)
    .set({ currentAccounts: sql`${servers.currentAccounts} + 1` })
    .where(and(eq(servers.id, serverId), sql`${servers.currentAccounts} < ${servers.maxAccounts}`))
    .returning({ id: servers.id });
  if (!s) return false;
  const [sp] = await tx
    .update(serverProtocols)
    .set({ currentAccounts: sql`${serverProtocols.currentAccounts} + 1` })
    .where(
      and(
        eq(serverProtocols.id, serverProtocolId),
        sql`(${serverProtocols.maxAccounts} is null or ${serverProtocols.currentAccounts} < ${serverProtocols.maxAccounts})`,
      ),
    )
    .returning({ id: serverProtocols.id });
  return !!sp;
}

/** Release an account's slot exactly once (guarded by vpn_accounts.holds_capacity). */
export async function releaseCapacity(tx: Tx, accountId: string): Promise<boolean> {
  const [acc] = await tx
    .update(vpnAccounts)
    .set({ holdsCapacity: false })
    .where(and(eq(vpnAccounts.id, accountId), eq(vpnAccounts.holdsCapacity, true)))
    .returning({ serverId: vpnAccounts.serverId, protocolId: vpnAccounts.protocolId });
  if (!acc) return false;
  await tx
    .update(servers)
    .set({ currentAccounts: sql`greatest(${servers.currentAccounts} - 1, 0)` })
    .where(eq(servers.id, acc.serverId));
  await tx
    .update(serverProtocols)
    .set({ currentAccounts: sql`greatest(${serverProtocols.currentAccounts} - 1, 0)` })
    .where(and(eq(serverProtocols.serverId, acc.serverId), eq(serverProtocols.protocolId, acc.protocolId)));
  await refreshServerStatus(tx, acc.serverId);
  return true;
}
