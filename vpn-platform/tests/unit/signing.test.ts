import { describe, expect, it } from "vitest";
import { signRequest, verifySignedRequest } from "@/server/nodes/signing";

const secret = "node-secret-0123456789";
function verify(headers: Record<string, string>, overrides: Partial<{ method: string; path: string; body: string; now: Date }> = {}, seen = new Set<string>()) {
  return verifySignedRequest({
    headers,
    method: overrides.method ?? "POST",
    path: overrides.path ?? "/api/v1/accounts",
    body: overrides.body ?? '{"a":1}',
    resolveSecret: (id) => (id === "k1" ? secret : undefined),
    seenNonce: (n) => (seen.has(n) ? true : (seen.add(n), false)),
    now: overrides.now,
  });
}

describe("HMAC request signing", () => {
  const headers = signRequest({ secret, keyId: "k1", method: "POST", path: "/api/v1/accounts", body: '{"a":1}' });

  it("verifies a correctly signed request", () => {
    expect(verify(headers)).toEqual({ ok: true });
  });
  it("rejects a modified body, path or method", () => {
    expect(verify(headers, { body: '{"a":2}' })).toMatchObject({ ok: false, code: "INVALID_SIGNATURE" });
    expect(verify(headers, { path: "/api/v1/accounts?x=1" })).toMatchObject({ ok: false, code: "INVALID_SIGNATURE" });
    expect(verify(headers, { method: "DELETE" })).toMatchObject({ ok: false, code: "INVALID_SIGNATURE" });
  });
  it("rejects unknown keys and stale timestamps", () => {
    expect(verify({ ...headers, "x-node-key-id": "other" })).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(verify(headers, { now: new Date(Date.now() + 10 * 60_000) })).toMatchObject({ ok: false, code: "CLOCK_SKEW" });
  });
  it("rejects replayed nonces", () => {
    const seen = new Set<string>();
    expect(verify(headers, {}, seen).ok).toBe(true);
    expect(verify(headers, {}, seen)).toMatchObject({ ok: false, code: "REPLAYED_NONCE" });
  });
  it("does not record nonces of forged requests", () => {
    const seen = new Set<string>();
    verify({ ...headers, "x-node-signature": "v1=" + "0".repeat(64) }, {}, seen);
    expect(seen.size).toBe(0);
  });
});
