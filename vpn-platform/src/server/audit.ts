import { db, type DbOrTx } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import { logger } from "@/server/logging/logger";
import { redactObject } from "@/server/logging/redact";

export interface AuditActor {
  adminId: string | null;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
}

export const systemActor: AuditActor = { adminId: null, email: "system", ip: null, userAgent: null };

/** Append-only audit trail of administrator actions. Details are redacted. */
export async function audit(
  actor: AuditActor,
  action: string,
  opts: { targetType?: string; targetId?: string; success?: boolean; details?: Record<string, unknown> } = {},
  tx: DbOrTx = db(),
): Promise<void> {
  try {
    await tx.insert(auditLogs).values({
      adminId: actor.adminId,
      adminEmail: actor.email,
      action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      success: opts.success ?? true,
      ip: actor.ip,
      userAgent: actor.userAgent?.slice(0, 300) ?? null,
      details: redactObject(opts.details),
    });
  } catch (e) {
    logger.error("failed to write audit log", { action, error: (e as Error).message });
  }
}
