import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Request signing for the node API (HMAC-SHA256).
 *
 * Canonical string (newline separated):
 *   VL1-HMAC-SHA256
 *   <HTTP METHOD, upper case>
 *   <request path including base path and query string, exactly as sent>
 *   <unix timestamp, seconds>
 *   <nonce>
 *   <hex SHA-256 of the raw request body ("" for no body)>
 *
 * Headers sent:
 *   X-Node-Key-Id, X-Node-Timestamp, X-Node-Nonce, X-Node-Signature: v1=<hex>
 *
 * Nodes must reject requests whose timestamp differs from their clock by more than
 * MAX_CLOCK_SKEW_SECONDS and remember nonces for at least that long to block replays.
 * This module is dependency-free so the same code can be reused by a node-side agent.
 */
export const SIGNATURE_SCHEME = "VL1-HMAC-SHA256";
export const MAX_CLOCK_SKEW_SECONDS = 300;

export const NodeHeaders = {
  keyId: "x-node-key-id",
  timestamp: "x-node-timestamp",
  nonce: "x-node-nonce",
  signature: "x-node-signature",
  requestId: "x-request-id",
  idempotencyKey: "idempotency-key",
} as const;

export interface CanonicalParts {
  method: string;
  path: string;
  timestamp: string;
  nonce: string;
  body: string | Buffer;
}

export function bodyDigest(body: string | Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

export function canonicalString(p: CanonicalParts): string {
  return [SIGNATURE_SCHEME, p.method.toUpperCase(), p.path, p.timestamp, p.nonce, bodyDigest(p.body)].join("\n");
}

export function computeSignature(secret: string, p: CanonicalParts): string {
  return createHmac("sha256", secret).update(canonicalString(p)).digest("hex");
}

export function signRequest(opts: {
  secret: string;
  keyId: string;
  method: string;
  path: string;
  body: string;
  now?: Date;
}): Record<string, string> {
  const timestamp = Math.floor((opts.now ?? new Date()).getTime() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const signature = computeSignature(opts.secret, { method: opts.method, path: opts.path, timestamp, nonce, body: opts.body });
  return {
    [NodeHeaders.keyId]: opts.keyId,
    [NodeHeaders.timestamp]: timestamp,
    [NodeHeaders.nonce]: nonce,
    [NodeHeaders.signature]: `v1=${signature}`,
  };
}

export type VerifyResult = { ok: true } | { ok: false; code: "INVALID_SIGNATURE" | "CLOCK_SKEW" | "REPLAYED_NONCE" | "UNAUTHORIZED" };

/**
 * Verification helper for node-side implementations (used by the mock node and tests).
 * `seenNonce` must atomically record the nonce and return true if it was already present.
 */
export function verifySignedRequest(opts: {
  headers: Record<string, string | undefined>;
  method: string;
  path: string;
  body: string | Buffer;
  resolveSecret: (keyId: string) => string | undefined;
  seenNonce: (nonce: string) => boolean;
  now?: Date;
}): VerifyResult {
  const keyId = opts.headers[NodeHeaders.keyId];
  const timestamp = opts.headers[NodeHeaders.timestamp];
  const nonce = opts.headers[NodeHeaders.nonce];
  const signature = opts.headers[NodeHeaders.signature];
  if (!keyId || !timestamp || !nonce || !signature?.startsWith("v1=")) return { ok: false, code: "UNAUTHORIZED" };
  if (!/^\d{1,12}$/.test(timestamp) || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce)) return { ok: false, code: "UNAUTHORIZED" };
  const secret = opts.resolveSecret(keyId);
  if (!secret) return { ok: false, code: "UNAUTHORIZED" };
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (Math.abs(nowSec - Number(timestamp)) > MAX_CLOCK_SKEW_SECONDS) return { ok: false, code: "CLOCK_SKEW" };
  const expected = computeSignature(secret, { method: opts.method, path: opts.path, timestamp, nonce, body: opts.body });
  const given = signature.slice(3);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(given, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, code: "INVALID_SIGNATURE" };
  // Record the nonce only after the signature checks out, so forged requests cannot fill the cache.
  if (opts.seenNonce(nonce)) return { ok: false, code: "REPLAYED_NONCE" };
  return { ok: true };
}
