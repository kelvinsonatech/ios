import { Queue, type ConnectionOptions } from "bullmq";
import { Redis } from "ioredis";
import { env } from "@/server/env";

export const PROVISIONING_QUEUE = "provisioning";

export type ProvisioningJob =
  | { type: "create"; requestId: string }
  | { type: "reconcile"; requestId: string }
  | { type: "sweep" };

const g = globalThis as unknown as { __vlQueue?: Queue<ProvisioningJob>; __vlQueueConn?: Redis };

export function queueConnection(): ConnectionOptions {
  g.__vlQueueConn ??= new Redis(env().REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: false });
  return g.__vlQueueConn;
}

export function provisioningQueue(): Queue<ProvisioningJob> {
  g.__vlQueue ??= new Queue<ProvisioningJob>(PROVISIONING_QUEUE, {
    connection: queueConnection(),
    defaultJobOptions: { attempts: 1, removeOnComplete: { count: 1000 }, removeOnFail: { count: 5000 } },
  });
  return g.__vlQueue;
}

/**
 * Enqueue a provisioning step. The database is the source of truth: every handler re-checks the
 * request state before acting, so duplicate jobs are harmless, and if Redis loses a job the
 * sweeper re-enqueues requests stuck in queued/in_flight/uncertain.
 */
export async function enqueueProvisioning(job: ProvisioningJob, opts: { delayMs?: number } = {}) {
  await provisioningQueue().add(job.type, job, { delay: opts.delayMs });
}

export async function closeQueue() {
  await g.__vlQueue?.close();
  g.__vlQueueConn?.disconnect();
  g.__vlQueue = undefined;
  g.__vlQueueConn = undefined;
}
