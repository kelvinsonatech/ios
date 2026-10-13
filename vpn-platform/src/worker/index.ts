/**
 * Background worker (separate process from the web app):
 *   npm run worker            (development)
 *   node dist/src/worker/index.mjs   (production build)
 *
 * Consumes the `provisioning` queue so slow VPN servers never block web requests.
 * PHASE 18/19 will add the scheduled health monitor and expiry synchronisation here.
 */
import { Worker } from "bullmq";
import { closeDb } from "@/server/db";
import { closeRedis } from "@/server/redis";
import { errorSummary, logger } from "@/server/logging/logger";
import { closeAllNodeAgents } from "@/server/nodes/transport";
import { PROVISIONING_QUEUE, provisioningQueue, queueConnection, closeQueue, type ProvisioningJob } from "@/server/provisioning/queue";
import { executeCreate, reconcile, sweep } from "@/server/provisioning/service";
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

worker.on("failed", (job, err) => logger.error("job failed", { jobId: job?.id, type: job?.data.type, ...errorSummary(err) }));
worker.on("error", (err) => logger.error("worker error", errorSummary(err)));

await provisioningQueue().upsertJobScheduler("sweep-every-minute", { every: 60_000 }, { name: "sweep", data: { type: "sweep" } });
logger.info("worker started", { queue: PROVISIONING_QUEUE, concurrency });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info("worker stopping", { signal });
  await worker.close();
  await closeQueue();
  await closeAllNodeAgents();
  await closeRedis();
  await closeDb();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
