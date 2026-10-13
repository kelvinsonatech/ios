import { redis } from "@/server/redis";
import { logger } from "@/server/logging/logger";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window resets. */
  resetSeconds: number;
}

/**
 * Fixed-window rate limiter backed by Redis.
 * `failMode` decides what happens when Redis is unavailable:
 *  - "open":   allow (admin login — the database lockout still protects accounts),
 *  - "closed": deny  (public account creation).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
  failMode: "open" | "closed" = "closed",
): Promise<RateLimitResult> {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const redisKey = `rl:${key}:${bucket}`;
  try {
    const res = await redis().multi().incr(redisKey).expire(redisKey, windowSeconds + 5).exec();
    const count = Number(res?.[0]?.[1] ?? 0);
    const resetSeconds = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSeconds };
  } catch (e) {
    logger.error("rate limiter unavailable", { key, error: (e as Error).message, failMode });
    return { allowed: failMode === "open", remaining: 0, resetSeconds: windowSeconds };
  }
}

export async function resetRateLimit(key: string, windowSeconds: number) {
  const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
  await redis().del(`rl:${key}:${bucket}`).catch(() => {});
}
