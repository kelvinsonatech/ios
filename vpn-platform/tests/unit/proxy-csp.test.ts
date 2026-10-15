import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

/**
 * The edge proxy (src/proxy.ts): per-request CSP nonce, the Turnstile relaxation that only exists
 * while CAPTCHA_PROVIDER=turnstile, and the optimistic admin gate.
 */

function run(path: string, init?: { cookie?: string }) {
  const headers = new Headers();
  if (init?.cookie) headers.set("cookie", init.cookie);
  return proxy(new NextRequest(new URL(path, "http://localhost:3000"), { headers }));
}

/** Directive name -> its source list. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((d) => {
      const [name, ...sources] = d.trim().split(/\s+/);
      return [name!, sources];
    }),
  );
}

describe("proxy: Content-Security-Policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("locks scripts to a fresh nonce and allows no third party by default", () => {
    vi.stubEnv("CAPTCHA_PROVIDER", "none");
    const a = run("/");
    const b = run("/ssh");
    const policy = a.headers.get("content-security-policy")!;
    const csp = directives(policy);
    const nonce = a.headers.get("x-middleware-request-x-nonce");
    expect(nonce).toBeTruthy();
    // The page receives the same nonce and policy through the forwarded request headers.
    expect(a.headers.get("x-middleware-request-content-security-policy")).toBe(policy);
    expect(csp.get("script-src")).toEqual(["'self'", `'nonce-${nonce}'`, "'strict-dynamic'"]);
    expect(b.headers.get("x-middleware-request-x-nonce")).not.toBe(nonce);
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(csp.get("font-src")).toEqual(["'self'", "data:"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
    expect(csp.get("object-src")).toEqual(["'none'"]);
    expect(csp.has("frame-src")).toBe(false);
    expect(policy).not.toContain("cloudflare");
    expect(policy).not.toContain("unsafe-eval");
  });

  it("adds Cloudflare Turnstile (script, XHR, frame) only when the captcha is enabled", () => {
    vi.stubEnv("CAPTCHA_PROVIDER", "turnstile");
    const csp = directives(run("/report").headers.get("content-security-policy")!);
    const origin = "https://challenges.cloudflare.com";
    expect(csp.get("script-src")).toContain(origin);
    expect(csp.get("connect-src")).toEqual(["'self'", origin]);
    expect(csp.get("frame-src")).toEqual([origin]);
    // Nothing else is relaxed.
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  });

  it("upgrades insecure requests only for an https APP_URL outside development", () => {
    vi.stubEnv("APP_URL", "https://vpn.example.com");
    expect(run("/").headers.get("content-security-policy")).toContain("upgrade-insecure-requests");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    expect(run("/").headers.get("content-security-policy")).not.toContain("upgrade-insecure-requests");
  });
});

describe("proxy: admin gate", () => {
  it("sends admin pages without a session cookie to the login page", () => {
    const res = run("/admin/servers?tab=x");
    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/admin/login");
    expect(new URL(res.headers.get("location")!).search).toBe("");
  });

  it("lets the login page and cookie-bearing requests through (real checks happen server side)", () => {
    expect(run("/admin/login").headers.get("location")).toBeNull();
    expect(run("/admin", { cookie: "vl_admin=abc" }).headers.get("location")).toBeNull();
    expect(run("/admin", { cookie: "__Host-vl_admin=abc" }).headers.get("location")).toBeNull();
    expect(run("/admin", { cookie: "other=abc" }).status).toBe(307);
  });
});
