import { afterEach, describe, expect, it } from "vitest";
import { clientIpFromHeaders } from "@/server/auth/request-context";
import { resetEnvCache } from "@/server/env";

const xff = (v: string) => new Headers({ "x-forwarded-for": v });
const withHops = (n: number) => {
  process.env.TRUSTED_PROXY_HOPS = String(n);
  resetEnvCache();
};

describe("clientIpFromHeaders", () => {
  afterEach(() => {
    delete process.env.TRUSTED_PROXY_HOPS;
    resetEnvCache();
  });

  it("Caddy only (1 hop): Caddy replaces untrusted X-Forwarded-For with the peer", () => {
    withHops(1);
    expect(clientIpFromHeaders(xff("198.51.100.7"))).toBe("198.51.100.7");
  });

  it("Cloudflare + Caddy (2 hops): the visitor is the entry Cloudflare added", () => {
    withHops(2);
    // Cloudflare appends the visitor to whatever the visitor sent; Caddy appends the Cloudflare edge.
    expect(clientIpFromHeaders(xff("6.6.6.6, 198.51.100.7, 172.70.1.1"))).toBe("198.51.100.7");
    expect(clientIpFromHeaders(xff("2001:db8::7, 2606:4700::1"))).toBe("2001:db8::7");
  });

  it("2 hops, request that bypassed Cloudflare: Caddy left only the peer, which is used", () => {
    withHops(2);
    expect(clientIpFromHeaders(xff("203.0.113.9"))).toBe("203.0.113.9");
  });

  it("rejects values that are not IP addresses", () => {
    withHops(1);
    expect(clientIpFromHeaders(xff("not-an-ip"))).toBeNull();
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});
