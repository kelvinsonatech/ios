import { db, type DbOrTx } from "@/server/db";
import { provisioningLogs, type LogLevel } from "@/server/db/schema";
import { logger } from "./logger";
import { redactObject } from "./redact";

/** Operational event types shown in Admin → Logs and the dashboard activity feed. */
export type ProvisioningEvent =
  | "server.added"
  | "server.updated"
  | "server.deleted"
  | "server.connected"
  | "server.connection_failed"
  | "server.synced"
  | "server.sync_failed"
  | "server.published"
  | "server.lifecycle_changed"
  | "server.credentials_rotated"
  | "server.protocols_updated"
  | "server.offline"
  | "server.restored"
  | "server.agent_restart"
  | "protocol.created"
  | "protocol.updated"
  | "account.requested"
  | "account.created"
  | "account.failed"
  | "account.uncertain"
  | "account.revoked"
  | "account.expired"
  | "account.renewed";

export interface LogEventInput {
  event: ProvisioningEvent;
  message: string;
  level?: LogLevel;
  status?: "success" | "failure" | "info";
  serverId?: string | null;
  protocolId?: string | null;
  accountId?: string | null;
  requestId?: string | null;
  adminId?: string | null;
  details?: Record<string, unknown>;
  durationMs?: number;
}

/** Record an operational event. Never throws: logging must not break the operation itself. */
export async function logEvent(input: LogEventInput, tx: DbOrTx = db()): Promise<void> {
  try {
    await tx.insert(provisioningLogs).values({
      event: input.event,
      level: input.level ?? (input.status === "failure" ? "error" : "info"),
      status: input.status ?? "info",
      serverId: input.serverId ?? null,
      protocolId: input.protocolId ?? null,
      accountId: input.accountId ?? null,
      requestId: input.requestId ?? null,
      adminId: input.adminId ?? null,
      message: input.message.slice(0, 1000),
      details: redactObject(input.details),
      durationMs: input.durationMs,
    });
  } catch (e) {
    logger.error("failed to write provisioning log", { event: input.event, error: (e as Error).message });
  }
}
