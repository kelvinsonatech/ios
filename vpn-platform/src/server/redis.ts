import { Redis, type RedisOptions } from "ioredis";
import { env } from "@/server/env";
import { logger } from "@/server/logging/logger";

const globalForRedis = globalThis as unknown as { __vlRedis?: Redis };

/** Connection options shared with BullMQ (which needs maxRetriesPerRequest: null). */
export function redisOptions(): RedisOptions {
  return { maxRetriesPerRequest: null, enableReadyCheck: true, lazyConnect: false };
}

/** Shared Redis client (rate limiting, caching, one-time provisioning results). */
export function redis(): Redis {
  if (!globalForRedis.__vlRedis) {
    const client = new Redis(env().REDIS_URL, { ...redisOptions(), maxRetriesPerRequest: 2 });
    client.on("error", (e) => logger.warn("redis error", { error: e.message }));
    globalForRedis.__vlRedis = client;
  }
  return globalForRedis.__vlRedis;
}

export async function closeRedis() {
  await globalForRedis.__vlRedis?.quit().catch(() => {});
  globalForRedis.__vlRedis = undefined;
}
