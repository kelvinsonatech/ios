/**
 * Background worker (separate process from the web app):
 *   npm run worker            (development)
 *   node dist/src/worker/index.mjs   (production build)
 *
 * Consumes two queues so slow VPN servers never block web requests:
 *  - `provisioning`: account creation, uncertain-outcome reconciliation, the one-minute sweeper;
 *  - `maintenance`: scheduled jobs — health monitor tick (30 s), account expiry (1 min) and
 *    health-history retention (hourly). Every job re-reads the database, so duplicates are harmless.
 */
import { Worker } from "bullmq";
import { closeDb } from "@/server/db";
import { closeRedis } from "@/server/redis";
import { errorSummary, logger } from "@/server/logging/logger";
import { closeAllNodeAgents } from "@/server/nodes/transport";
import {
  MAINTENANCE_QUEUE,
  maintenanceQueue,
  PROVISIONING_QUEUE,
  provisioningQueue,
  queueConnection,
  closeQueue,
  type MaintenanceJob,
  type ProvisioningJob,
} from "@/server/provisioning/queue";
import { executeCreate, reconcile, sweep } from "@/server/provisioning/service";
import { expireAccounts, processExpiredRevokes } from "@/server/provisioning/expiry";
import { HEALTH_TICK_MS, purgeHealthHistory, runDueHealthChecks } from "@/server/servers/health";
import { purgeExpiredSessions } from "@/server/auth/session";

const concurrency = Number(process.env.WORKER_CONCURRENCY ?? 8);

const worker = new Worker<ProvisioningJob>(
  PROVISIONING_QUEUE,
  async (job) => {
    const data = job.data;
    switch (data.type) {
      case "create":
        return executeCreate(data.requestId);
      case "reconcile":
        return reconcile(data.requestId);
      case "sweep": {
        const result = await sweep();
        await purgeExpiredSessions();
        if (result.requeued || result.reconciling || result.erased) logger.info("sweep", result);
        return result;
      }
    }
  },
  { connection: queueConnection(), concurrency },
);

// Two slots: a long health tick (many slow servers) never delays expiry, and vice versa.
const maintenance = new Worker<MaintenanceJob>(
  MAINTENANCE_QUEUE,
  async (job) => {
    switch (job.data.type) {
      case "health": {
        const result = await runDueHealthChecks({ concurrency: 8 });
        if (result.failed) logger.info("health tick", result);
        return result;
      }
      case "expiry": {
        const expired = await expireAccounts();
        const revokes = await processExpiredRevokes();
        if (expired.expired || revokes.removed || revokes.retrying || revokes.failed) logger.info("expiry", { ...expired, ...revokes });
        return { ...expired, ...revokes };
      }
      case "purge":
        return { deleted: await purgeHealthHistory() };
    }
  },
  { connection: queueConnection(), concurrency: 2 },
);

for (const w of [worker, maintenance]) {
  w.on("failed", (job, err) => logger.error("job failed", { queue: w.name, jobId: job?.id, type: job?.data.type, ...errorSummary(err) }));
  w.on("error", (err) => logger.error("worker error", { queue: w.name, ...errorSummary(err) }));
}

await provisioningQueue().upsertJobScheduler("sweep-every-minute", { every: 60_000 }, { name: "sweep", data: { type: "sweep" } });
await maintenanceQueue().upsertJobScheduler("health-tick", { every: HEALTH_TICK_MS }, { name: "health", data: { type: "health" } });
await maintenanceQueue().upsertJobScheduler("expiry-every-minute", { every: 60_000 }, { name: "expiry", data: { type: "expiry" } });
await maintenanceQueue().upsertJobScheduler("purge-hourly", { every: 3_600_000 }, { name: "purge", data: { type: "purge" } });
logger.info("worker started", { queues: [PROVISIONING_QUEUE, MAINTENANCE_QUEUE], concurrency });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("worker stopping", { signal });
  await Promise.all([worker.close(), maintenance.close()]);
  await closeQueue();
  await closeAllNodeAgents();
  await closeRedis();
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
