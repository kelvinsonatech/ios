import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { captchaEnabled, captchaSiteKey, TURNSTILE_VERIFY_URL, verifyCaptcha } from "@/server/captcha";
import { env, resetEnvCache } from "@/server/env";

const vars = ["CAPTCHA_PROVIDER", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY"] as const;
const saved: Partial<Record<(typeof vars)[number], string | undefined>> = {};

function useTurnstile() {
  process.env.CAPTCHA_PROVIDER = "turnstile";
  process.env.TURNSTILE_SITE_KEY = "0x4AAAAAAA-site";
  process.env.TURNSTILE_SECRET_KEY = "0x4AAAAAAA-secret";
  resetEnvCache();
}

function answer(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("captcha (Cloudflare Turnstile)", () => {
  beforeEach(() => {
    for (const k of vars) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of vars) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    resetEnvCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("provider none accepts everything without calling out", async () => {
    delete process.env.CAPTCHA_PROVIDER;
    resetEnvCache();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(captchaEnabled()).toBe(false);
    expect(captchaSiteKey()).toBeNull();
    expect(await verifyCaptcha(null, "203.0.113.9")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("turnstile requires both keys", () => {
    process.env.CAPTCHA_PROVIDER = "turnstile";
    delete process.env.TURNSTILE_SECRET_KEY;
    process.env.TURNSTILE_SITE_KEY = "site";
    resetEnvCache();
    expect(() => env()).toThrow(/TURNSTILE_SECRET_KEY is required/);
  });

  it("posts secret, token and client IP form-encoded and accepts success", async () => {
    useTurnstile();
    const fetchMock = vi.fn(async () => answer({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(captchaSiteKey()).toBe("0x4AAAAAAA-site");
    expect(await verifyCaptcha("token-123", "203.0.113.9")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(TURNSTILE_VERIFY_URL);
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/x-www-form-urlencoded");
    const body = new URLSearchParams(String(init.body));
    expect(Object.fromEntries(body)).toEqual({ secret: "0x4AAAAAAA-secret", response: "token-123", remoteip: "203.0.113.9" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fails closed: rejected token, HTTP error, bad JSON, network error, timeout", async () => {
    useTurnstile();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    const cases: (() => Promise<Response>)[] = [
      async () => answer({ success: false, "error-codes": ["invalid-input-response"] }),
      async () => answer({ success: false, "error-codes": ["invalid-input-secret"] }),
      async () => answer({ success: true }, 500),
      async () => new Response("<html>", { status: 200 }),
      async () => answer({ success: "true" }),
      async () => {
        throw new TypeError("fetch failed");
      },
      async () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    ];
    for (const impl of cases) {
      vi.stubGlobal("fetch", vi.fn(impl));
      expect(await verifyCaptcha("token-123", null)).toBe(false);
    }
  });

  it("rejects missing or oversized tokens without calling out", async () => {
    useTurnstile();
    const fetchMock = vi.fn(async () => answer({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha(null, null)).toBe(false);
    expect(await verifyCaptcha("", null)).toBe(false);
    expect(await verifyCaptcha("x".repeat(5000), null)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("omits remoteip when the client IP is unknown", async () => {
    useTurnstile();
    const fetchMock = vi.fn(async () => answer({ success: true }));
    vi.stubGlobal("fetch", fetchMock);
    await verifyCaptcha("t", null);
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(new URLSearchParams(String(init.body)).has("remoteip")).toBe(false);
  });
});
