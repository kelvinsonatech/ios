import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/server/db";
import { protocols, serverProtocols, serverReports } from "@/server/db/schema";
import { redis } from "@/server/redis";
import { resetEnvCache } from "@/server/env";
import { executeCreate } from "@/server/provisioning/service";
import { publishServer } from "@/server/servers/service";
import { syncServer } from "@/server/servers/sync";
import { clearPublicCache } from "@/server/public/cache";
import { POST as createAccount } from "@/app/api/public/accounts/route";
import { GET as accountStatus } from "@/app/api/public/accounts/[requestId]/route";
import { GET as statusRoute } from "@/app/api/public/status/route";
import { POST as createReportRoute } from "@/app/api/public/reports/route";
import { GET as protocolsRoute } from "@/app/api/public/protocols/route";
import { GET as protocolRoute } from "@/app/api/public/protocols/[slug]/route";
import { GET as serversRoute } from "@/app/api/public/servers/route";
import type { AccountStatusResponse, CreateAccountResponse, PublicApiError, StatusPageData } from "@/lib/public/types";
import { actor, createServer, resetDatabase, setSettings, startNode, teardown } from "../helpers";

// Route handlers call connection() (request-time rendering), which needs a Next request scope.
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), connection: async () => {} }));

const ORIGIN = "http://localhost:3000";
let ipCounter = 0;
const nextIp = () => `192.0.2.${++ipCounter}`;

function post(path: string, body: unknown, opts: { origin?: string | null; ip?: string; contentType?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": opts.contentType ?? "application/json", "x-forwarded-for": opts.ip ?? nextIp() };
  if (opts.origin !== null) headers.origin = opts.origin ?? ORIGIN;
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: opts.raw ?? JSON.stringify(body) });
}

const params = <T>(p: T) => ({ params: Promise.resolve(p) });

describe("public API route handlers", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  let serverId: string;

  const accountBody = (input: Record<string, string>, extra: Record<string, unknown> = {}) => ({
    serverId,
    protocol: "vless",
    input,
    idempotencyKey: randomUUID().replace(/-/g, ""),
    ...extra,
  });

  beforeAll(async () => {
    await resetDatabase();
    node = await startNode();
    const s = await createServer(node.port, { name: "API DE", countryCode: "DE", hostname: "de1.vpn.example" });
    await syncServer(s.id);
    await publishServer(s.id, actor);
    serverId = s.id;
  });
  beforeEach(async () => {
    await redis().flushdb();
    clearPublicCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await node.close();
    await teardown();
  });

  it("creates an account (202), then delivers the result with an avatar to the claim-token holder only", async () => {
    const res = await createAccount(post("/api/public/accounts", accountBody({ username: "api_user", transport: "ws", duration: "7" })));
    expect(res.status).toBe(202);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const created = (await res.json()) as CreateAccountResponse;
    expect(created).toMatchObject({ state: "queued", requestId: expect.any(String), claimToken: expect.stringMatching(/^[0-9a-f]{64}$/) });

    const poll = (token: string | null) =>
      accountStatus(
        new Request(`${ORIGIN}/api/public/accounts/${created.requestId}`, { headers: token ? { "x-claim-token": token } : {} }),
        params({ requestId: created.requestId }),
      );
    expect(await (await poll(created.claimToken)).json()).toEqual({ status: "pending" });

    await executeCreate(created.requestId);
    const ok = await poll(created.claimToken);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    const body = (await ok.json()) as AccountStatusResponse;
    expect(body.status).toBe("active");
    const account = body.status === "active" ? body.account! : null;
    expect(account?.avatar).toMatch(/^data:image\/svg\+xml/);
    expect(account?.protocol).toEqual({ slug: "vless", name: "VLESS" });
    expect(account?.artifacts[0]?.content).toMatch(/^vless:\/\//);
    expect(account?.fields.find((f) => f.key === "host")?.value).toBe("node.test");

    expect((await poll("0".repeat(64))).status).toBe(404);
    expect((await poll(null)).status).toBe(404);
    const unknown = await accountStatus(new Request(`${ORIGIN}/api/public/accounts/x`, { headers: { "x-claim-token": created.claimToken } }), params({ requestId: "x" }));
    expect(unknown.status).toBe(404);
    // Malformed ids of UUID length are a clean 404, not a database error.
    const dashes = "-".repeat(36);
    const malformed = await accountStatus(new Request(`${ORIGIN}/api/public/accounts/${dashes}`, { headers: { "x-claim-token": created.claimToken } }), params({ requestId: dashes }));
    expect(malformed.status).toBe(404);
  });

  it("a retry with the same idempotency key returns the same request", async () => {
    const body = accountBody({ username: "api_retry", transport: "ws", duration: "7" });
    const ip = nextIp();
    const a = (await (await createAccount(post("/api/public/accounts", body, { ip }))).json()) as CreateAccountResponse;
    const b = (await (await createAccount(post("/api/public/accounts", body, { ip }))).json()) as CreateAccountResponse;
    expect(b.requestId).toBe(a.requestId);
    expect(b.claimToken).toBe(a.claimToken);
  });

  it("validation errors: 422 with field errors, 400 for malformed requests", async () => {
    const res = await createAccount(post("/api/public/accounts", accountBody({ username: "root", transport: "ws", duration: "5", sni_bug: "not a host" })));
    expect(res.status).toBe(422);
    const body = (await res.json()) as PublicApiError;
    expect(body.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(body.error.fieldErrors ?? {}).sort()).toEqual(["duration", "sni_bug", "username"]);

    for (const bad of [{}, { ...accountBody({}), serverId: "nope" }, { ...accountBody({}), protocol: "../x" }, { ...accountBody({}), extra: 1 }, { ...accountBody({}), idempotencyKey: "short" }]) {
      const r = await createAccount(post("/api/public/accounts", bad));
      expect(r.status).toBe(400);
      expect(((await r.json()) as PublicApiError).error.code).toBe("INVALID_REQUEST");
    }
    expect((await createAccount(post("/api/public/accounts", null, { raw: "{not json" }))).status).toBe(400);
    expect((await createAccount(post("/api/public/accounts", null, { raw: "[1,2]" }))).status).toBe(400);
  });

  it("rejects cross-origin, origin-less, non-JSON and oversized requests before doing anything", async () => {
    const body = accountBody({ username: "api_csrf", transport: "ws", duration: "7" });
    const evil = await createAccount(post("/api/public/accounts", body, { origin: "https://evil.example" }));
    expect(evil.status).toBe(403);
    expect(((await evil.json()) as PublicApiError).error.code).toBe("FORBIDDEN_ORIGIN");
    expect((await createAccount(post("/api/public/accounts", body, { origin: null }))).status).toBe(403);
    expect((await createAccount(post("/api/public/accounts", body, { origin: "null" }))).status).toBe(403);
    expect((await createAccount(post("/api/public/accounts", body, { contentType: "text/plain" }))).status).toBe(415);
    expect((await createAccount(post("/api/public/accounts", body, { contentType: "application/x-www-form-urlencoded" }))).status).toBe(415);
    const huge = await createAccount(post("/api/public/accounts", null, { raw: JSON.stringify({ ...body, pad: "x".repeat(20_000) }) }));
    expect(huge.status).toBe(413);
    expect(await db().select().from(serverReports)).toHaveLength(0);
  });

  it("captcha: Turnstile failures are 403 CAPTCHA_FAILED; success proceeds", async () => {
    const saved = { p: process.env.CAPTCHA_PROVIDER, s: process.env.TURNSTILE_SITE_KEY, k: process.env.TURNSTILE_SECRET_KEY };
    process.env.CAPTCHA_PROVIDER = "turnstile";
    process.env.TURNSTILE_SITE_KEY = "site-key";
    process.env.TURNSTILE_SECRET_KEY = "secret-key";
    resetEnvCache();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }), { status: 200 })));
      const denied = await createAccount(post("/api/public/accounts", accountBody({ username: "api_captcha", transport: "ws", duration: "7" }, { captchaToken: "tok" })));
      expect(denied.status).toBe(403);
      expect(((await denied.json()) as PublicApiError).error.code).toBe("CAPTCHA_FAILED");

      const missing = await createAccount(post("/api/public/accounts", accountBody({ username: "api_captcha", transport: "ws", duration: "7" })));
      expect(missing.status).toBe(403);

      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed"))));
      const down = await createAccount(post("/api/public/accounts", accountBody({ username: "api_captcha", transport: "ws", duration: "7" }, { captchaToken: "tok" })));
      expect(down.status).toBe(403);

      const turnstile = vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 }));
      vi.stubGlobal("fetch", turnstile);
      const ok = await createAccount(post("/api/public/accounts", accountBody({ username: "api_captcha", transport: "ws", duration: "7" }, { captchaToken: "tok" })));
      expect(ok.status).toBe(202);
      expect(turnstile).toHaveBeenCalledTimes(1);

      const report = await createReportRoute(post("/api/public/reports", { serverId: null, protocol: null, category: "other", message: "Captcha check for reports", contactEmail: null }));
      expect(report.status).toBe(403);
    } finally {
      for (const [k, v] of [["CAPTCHA_PROVIDER", saved.p], ["TURNSTILE_SITE_KEY", saved.s], ["TURNSTILE_SECRET_KEY", saved.k]] as const) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
      resetEnvCache();
    }
  });

  it("rate limits: 429 with Retry-After", async () => {
    const ip = nextIp();
    let last: Response | null = null;
    for (let i = 0; i < 6; i++) {
      last = await createAccount(post("/api/public/accounts", accountBody({ username: `api_rl_${i}`, transport: "ws", duration: "7" }), { ip }));
      if (last.status === 429) break;
    }
    expect(last!.status).toBe(429);
    const retryAfter = Number(last!.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThan(0);
    expect(((await last!.json()) as PublicApiError).error).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: retryAfter });
  });

  it("quota reached: 409 with resetsAt", async () => {
    const [vless] = await db().select().from(protocols).where(eq(protocols.slug, "vless"));
    await db()
      .update(serverProtocols)
      .set({ quotaLimit: 1, quotaUsed: 1, quotaWindowStart: null })
      .where(and(eq(serverProtocols.serverId, serverId), eq(serverProtocols.protocolId, vless!.id)));
    // First request in the (new) window takes the only slot, the next one is refused.
    expect((await createAccount(post("/api/public/accounts", accountBody({ username: "api_quota_1", transport: "ws", duration: "7" })))).status).toBe(202);
    const res = await createAccount(post("/api/public/accounts", accountBody({ username: "api_quota_2", transport: "ws", duration: "7" })));
    expect(res.status).toBe(409);
    const body = (await res.json()) as PublicApiError;
    expect(body.error.code).toBe("QUOTA_REACHED");
    expect(new Date(body.error.resetsAt!).getTime()).toBeGreaterThan(Date.now());
    await db()
      .update(serverProtocols)
      .set({ quotaLimit: null })
      .where(and(eq(serverProtocols.serverId, serverId), eq(serverProtocols.protocolId, vless!.id)));
  });

  it("unknown server or protocol: 404", async () => {
    const res = await createAccount(post("/api/public/accounts", { ...accountBody({ username: "api_x", duration: "7" }), protocol: "no-such-protocol" }));
    expect(res.status).toBe(404);
    expect(((await res.json()) as PublicApiError).error.code).toBe("PROTOCOL_NOT_FOUND");
    // A real protocol this server does not offer.
    const other = await createAccount(post("/api/public/accounts", { ...accountBody({ username: "api_x", password: "S3cure-pass", duration: "7" }), protocol: "noobzvpn" }));
    expect(other.status).toBe(409);
    expect(((await other.json()) as PublicApiError).error.code).toBe("PROTOCOL_UNAVAILABLE");
    const gone = await createAccount(post("/api/public/accounts", { ...accountBody({ username: "api_x", transport: "ws", duration: "7" }), serverId: randomUUID() }));
    expect(gone.status).toBe(404);
    expect(((await gone.json()) as PublicApiError).error.code).toBe("SERVER_NOT_FOUND");
  });

  it("status endpoint: cacheable, no IPs, ports or credentials; hostnames only when enabled", async () => {
    await setSettings({ display: { showHostnames: false, showStats: true } });
    const res = await statusRoute();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/public, max-age=5/);
    const text = await res.text();
    const data = JSON.parse(text) as StatusPageData;
    expect(data.sections.length).toBeGreaterThan(0);
    expect(text).not.toMatch(/127\.0\.0\.1|de1\.vpn\.example|mock-key|secret/i);
    expect(text).not.toContain(`:${node.port}`);

    await setSettings({ display: { showHostnames: true, showStats: true } });
    clearPublicCache();
    const shown = await (await statusRoute()).text();
    expect(shown).toContain("de1.vpn.example");
    expect(shown).not.toMatch(/127\.0\.0\.1/);
    await setSettings({});
  });

  it("protocol and server listings keep working on the new catalogue", async () => {
    const list = await protocolsRoute();
    expect(list.headers.get("cache-control")).toMatch(/max-age=30/);
    const { protocols: items } = (await list.json()) as { protocols: { slug: string }[] };
    expect(items.map((p) => p.slug)).toContain("vless");
    const one = await protocolRoute(new Request(`${ORIGIN}/api/public/protocols/vless`), params({ slug: "vless" }));
    expect(one.status).toBe(200);
    expect(((await one.json()) as { countries: { slug: string }[] }).countries.map((c) => c.slug)).toEqual(["germany"]);
    expect((await protocolRoute(new Request(`${ORIGIN}/api/public/protocols/nope`), params({ slug: "nope" }))).status).toBe(404);
    const servers = await serversRoute();
    expect(servers.status).toBe(200);
    expect(await servers.text()).not.toMatch(/127\.0\.0\.1/);
  });

  it("reports: 201, validation 422, cross-origin 403 and 3 per hour per IP", async () => {
    const ip = nextIp();
    const report = (extra: Record<string, unknown> = {}) => ({ serverId, protocol: "vless", category: "slow", message: "Very slow in the evening.", contactEmail: null, ...extra });
    const ok = await createReportRoute(post("/api/public/reports", report(), { ip }));
    expect(ok.status).toBe(201);
    expect((await ok.json()) as { id: string }).toMatchObject({ id: expect.any(String) });

    const bad = await createReportRoute(post("/api/public/reports", report({ message: "short", contactEmail: "nope" }), { ip: nextIp() }));
    expect(bad.status).toBe(422);
    expect(Object.keys(((await bad.json()) as PublicApiError).error.fieldErrors ?? {}).sort()).toEqual(["contactEmail", "message"]);

    expect((await createReportRoute(post("/api/public/reports", report(), { origin: "https://evil.example" }))).status).toBe(403);

    await createReportRoute(post("/api/public/reports", report(), { ip }));
    await createReportRoute(post("/api/public/reports", report(), { ip }));
    const limited = await createReportRoute(post("/api/public/reports", report(), { ip }));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    const stored = await db().select().from(serverReports);
    expect(stored).toHaveLength(3);
    expect(stored.every((r) => r.clientIpHash && !r.clientIpHash.includes(ip))).toBe(true);
  });
});
