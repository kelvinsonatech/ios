import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { protocols, provisioningRequests, servers, vpnAccounts } from "@/server/db/schema";
import { sha256Hex } from "@/server/crypto/hashing";
import { logEvent } from "@/server/logging/events";
import { errorSummary, logger } from "@/server/logging/logger";
import { getNodeDriver } from "@/server/nodes/connection";
import { isNodeError } from "@/server/nodes/errors";
import { releaseCapacity } from "./capacity";

/**
 * Account expiry (roadmap phase 19, website side). Runs every minute in the worker.
 *
 * 1. Active accounts whose expires_at has passed become `expired` and release their capacity slot
 *    (never the creation quota: the quota counts creations). Batches, FOR UPDATE SKIP LOCKED, so
 *    several workers can run it at once without double-processing.
 * 2. When the node does not remove expired accounts itself (capabilities.expiryManagedByNode is not
 *    true), a `revoke` provisioning request is recorded in the same transaction. Its id is the
 *    idempotent request id sent with the predefined revokeAccount operation; failures are retried
 *    with backoff, a 404 means the account is already gone. Nothing secret is involved or logged.
 */

class ServerDeleted extends Error {}

const BATCH_SIZE = 100;
const MAX_BATCHES = 20;
const MAX_REVOKE_ATTEMPTS = 12;
/** A revoke claimed by a worker that died is resent after this long (revoke is idempotent). */
const REVOKE_STALE_MS = 5 * 60_000;

export async function expireAccounts(opts: { now?: Date; batchSize?: number } = {}): Promise<{ expired: number; revokesQueued: number }> {
  const now = opts.now ?? new Date();
  const batchSize = opts.batchSize ?? BATCH_SIZE;
  let expired = 0;
  let revokesQueued = 0;
  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const rows = await db().transaction(async (tx) => {
      const due = await tx
        .select({
          id: vpnAccounts.id,
          serverId: vpnAccounts.serverId,
          protocolId: vpnAccounts.protocolId,
          username: vpnAccounts.username,
          remoteAccountId: vpnAccounts.remoteAccountId,
          capabilities: servers.capabilities,
          serverName: servers.name,
          protocolName: protocols.name,
        })
        .from(vpnAccounts)
        .innerJoin(servers, eq(servers.id, vpnAccounts.serverId))
        .innerJoin(protocols, eq(protocols.id, vpnAccounts.protocolId))
        .where(and(eq(vpnAccounts.status, "active"), lte(vpnAccounts.expiresAt, now)))
        .orderBy(asc(vpnAccounts.expiresAt))
        .limit(batchSize)
        .for("update", { of: vpnAccounts, skipLocked: true });
      if (!due.length) return due;
      await tx
        .update(vpnAccounts)
        .set({ status: "expired" })
        .where(inArray(vpnAccounts.id, due.map((r) => r.id)));
      for (const r of due) await releaseCapacity(tx, r.id);
      const revokes = due.filter((r) => r.remoteAccountId && r.capabilities?.expiryManagedByNode !== true);
      if (revokes.length) {
        const inserted = await tx
          .insert(provisioningRequests)
          .values(
            revokes.map((r) => ({
              idempotencyKey: `expire:${r.id}`,
              operation: "revoke" as const,
              state: "queued" as const,
              accountId: r.id,
              serverId: r.serverId,
              protocolId: r.protocolId,
              inputDigest: sha256Hex(`expire:${r.id}`),
            })),
          )
          .onConflictDoNothing()
          .returning({ id: provisioningRequests.id });
        revokesQueued += inserted.length;
      }
      return due;
    });
    expired += rows.length;
    for (const r of rows) {
      await logEvent({
        event: "account.expired",
        status: "info",
        serverId: r.serverId,
        protocolId: r.protocolId,
        accountId: r.id,
        message: `${r.protocolName} account${r.username ? ` ${r.username}` : ""} on ${r.serverName} expired.`,
        details: { removalByNode: r.capabilities?.expiryManagedByNode === true },
      });
    }
    if (rows.length < batchSize) break;
  }
  return { expired, revokesQueued };
}

/**
 * Send queued node-side removals of expired accounts. Each request is claimed atomically
 * (queued → in_flight), sent with its own id as the idempotency key and retried with exponential
 * backoff (1, 2, 4 … 60 minutes) until MAX_REVOKE_ATTEMPTS.
 */
export async function processExpiredRevokes(opts: { limit?: number } = {}): Promise<{ removed: number; retrying: number; failed: number }> {
  await db()
    .update(provisioningRequests)
    .set({ state: "queued" })
    .where(
      and(
        eq(provisioningRequests.operation, "revoke"),
        eq(provisioningRequests.state, "in_flight"),
        sql`${provisioningRequests.updatedAt} < ${new Date(Date.now() - REVOKE_STALE_MS).toISOString()}::timestamptz`,
      ),
    );
  const due = db()
    .select({ id: provisioningRequests.id })
    .from(provisioningRequests)
    .where(
      and(
        eq(provisioningRequests.operation, "revoke"),
        eq(provisioningRequests.state, "queued"),
        sql`(${provisioningRequests.attempts} = 0 or ${provisioningRequests.updatedAt} < now() - least(power(2, ${provisioningRequests.attempts} - 1), 60) * interval '1 minute')`,
      ),
    )
    .orderBy(asc(provisioningRequests.createdAt))
    .limit(opts.limit ?? 50)
    .for("update", { skipLocked: true });
  const claimed = await db()
    .update(provisioningRequests)
    .set({ state: "in_flight", attempts: sql`${provisioningRequests.attempts} + 1`, startedAt: sql`coalesce(${provisioningRequests.startedAt}, now())` })
    .where(inArray(provisioningRequests.id, due))
    .returning();

  const result = { removed: 0, retrying: 0, failed: 0 };
  for (const req of claimed) {
    const [acc] = await db()
      .select({ remoteAccountId: vpnAccounts.remoteAccountId, username: vpnAccounts.username, serverDeletedAt: servers.deletedAt })
      .from(vpnAccounts)
      .innerJoin(servers, eq(servers.id, vpnAccounts.serverId))
      .where(eq(vpnAccounts.id, req.accountId ?? ""))
      .limit(1);
    const done = async (state: "succeeded" | "failed", code: string | null, message: string | null) =>
      db()
        .update(provisioningRequests)
        .set({ state, completedAt: new Date(), errorCode: code, errorMessage: message })
        .where(eq(provisioningRequests.id, req.id));
    if (!acc?.remoteAccountId) {
      await done("succeeded", null, null);
      result.removed++;
      continue;
    }
    try {
      if (acc.serverDeletedAt) throw new ServerDeleted();
      const { driver } = await getNodeDriver(req.serverId);
      await driver.revokeAccount(acc.remoteAccountId, req.id); // 404 → already gone (driver)
      await done("succeeded", null, null);
      result.removed++;
    } catch (e) {
      const deleted = e instanceof ServerDeleted;
      const code = isNodeError(e) ? e.code : deleted ? "SERVER_DELETED" : "UNEXPECTED";
      const message = isNodeError(e) ? e.safeMessage : deleted ? "The server was deleted." : "Unexpected error.";
      if (!isNodeError(e) && !deleted) logger.warn("expired account removal failed", { requestId: req.id, ...errorSummary(e) });
      if (deleted || req.attempts >= MAX_REVOKE_ATTEMPTS) {
        await done("failed", code, message);
        result.failed++;
        await logEvent({
          event: "account.expired",
          status: "failure",
          level: "warning",
          serverId: req.serverId,
          protocolId: req.protocolId,
          accountId: req.accountId,
          requestId: req.id,
          message: `Expired account${acc.username ? ` ${acc.username}` : ""} could not be removed from the server: ${message}`,
          details: { code, attempts: req.attempts },
        });
      } else {
        await db()
          .update(provisioningRequests)
          .set({ state: "queued", errorCode: code, errorMessage: message })
          .where(eq(provisioningRequests.id, req.id));
        result.retrying++;
      }
    }
  }
  return result;
}
