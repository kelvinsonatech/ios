import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(key: string | Buffer, input: string | Buffer): string {
  return createHmac("sha256", key).update(input).digest("hex");
}

/** URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Keyed hash of a client IP: lets us rate-limit / investigate abuse without storing raw IPs. */
export function hashClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmacSha256Hex(env().IP_HASH_SECRET, ip).slice(0, 32);
}

/** Stable JSON (sorted keys) for digests. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
}
