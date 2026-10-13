import { eq, sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import {
  servers,
  type ServerCompatibility,
  type ServerHealthStatus,
  type ServerLifecycle,
  type ServerStatus,
} from "@/server/db/schema";

/**
 * Effective public status of a server, derived from the admin-controlled lifecycle, the observed
 * health, script compatibility and capacity. `refreshServerStatus` is the SQL twin of this function.
 */
export function computeServerStatus(s: {
  lifecycle: ServerLifecycle;
  healthStatus: ServerHealthStatus;
  compatibility: ServerCompatibility;
  currentAccounts: number;
  maxAccounts: number;
}): ServerStatus {
  if (s.lifecycle === "draft") return "pending";
  if (s.lifecycle === "disabled") return "disabled";
  if (s.lifecycle === "maintenance") return "maintenance";
  if (s.healthStatus === "offline" || s.healthStatus === "unknown" || s.compatibility === "unsupported") return "offline";
  if (s.currentAccounts >= s.maxAccounts) return "full";
  return "online";
}

const STATUS_SQL = sql`(case
  when ${servers.lifecycle} = 'draft' then 'pending'
  when ${servers.lifecycle} = 'disabled' then 'disabled'
  when ${servers.lifecycle} = 'maintenance' then 'maintenance'
  when ${servers.healthStatus} in ('offline', 'unknown') or ${servers.compatibility} = 'unsupported' then 'offline'
  when ${servers.currentAccounts} >= ${servers.maxAccounts} then 'full'
  else 'online' end)::server_status`;

/** Recompute and store the effective status. Returns the previous and new status. */
export async function refreshServerStatus(
  tx: DbOrTx,
  serverId: string,
): Promise<{ previous: ServerStatus; current: ServerStatus } | null> {
  const [before] = await tx.select({ status: servers.status }).from(servers).where(eq(servers.id, serverId)).for("update");
  if (!before) return null;
  const [after] = await tx
    .update(servers)
    .set({ status: STATUS_SQL })
    .where(eq(servers.id, serverId))
    .returning({ status: servers.status });
  return { previous: before.status, current: after!.status };
}

export const STATUS_LABELS: Record<ServerStatus, string> = {
  pending: "Pending setup",
  online: "Online",
  offline: "Offline",
  maintenance: "Maintenance",
  disabled: "Disabled",
  full: "Full",
};
