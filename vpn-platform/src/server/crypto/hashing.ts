import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
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

/**
 * Keyed hash of a client's network: lets us rate-limit / investigate abuse without storing raw IPs.
 * IPv6 clients are hashed by their /64 prefix (one home line or VPS gets a whole /64, so per-address
 * limits could be bypassed by rotating addresses); IPv4 and IPv4-mapped addresses by the address.
 */
export function hashClientIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return hmacSha256Hex(env().IP_HASH_SECRET, clientNetwork(ip)).slice(0, 32);
}

/** "2001:db8:1:2::5" → "2001:db8:1:2::/64"; "::ffff:198.51.100.7" → "198.51.100.7". */
export function clientNetwork(ip: string): string {
  let a = ip.trim().toLowerCase();
  const zone = a.indexOf("%");
  if (zone >= 0) a = a.slice(0, zone);
  if (a.startsWith("[") && a.endsWith("]")) a = a.slice(1, -1);
  if (isIPv4(a)) return a;
  if (!isIPv6(a)) return a;
  if (a.startsWith("::ffff:") && isIPv4(a.slice(7))) return a.slice(7);
  // Expand "::" and an embedded dotted IPv4 tail to eight hextets, keep the first four.
  const v4 = a.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const [b0, b1, b2, b3] = v4[1]!.split(".").map(Number) as [number, number, number, number];
    a = a.slice(0, -v4[1]!.length) + ((b0 << 8) | b1).toString(16) + ":" + ((b2 << 8) | b3).toString(16);
  }
  const [head = "", tail] = a.split("::");
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const groups = tail !== undefined ? [...h, ...Array(8 - h.length - t.length).fill("0"), ...t] : h;
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
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
