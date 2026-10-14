/**
 * Check a real server's node API from the command line (no database needed):
 *
 *   VPN_NODE_SECRET=<secret> npm run node:check -- --url https://de1.example.com:9443/api/v1 --key-id node-1234abcd
 *     --create ssh,vless   also create (and then delete) a 1-day test account per listed protocol
 *     --create all         ... for every protocol the server reports
 *     --keep               keep the test accounts instead of deleting them (only their ids are printed)
 *
 * It checks request signing and replay protection, validates /info, /health and /protocols against
 * the website's contract schemas, and for every test account: the response shape, idempotent
 * replay, idempotency conflicts, lookup by request id, the website's protocol adapter parsing and
 * deletion. The secret is read from the environment only, and secret values (passwords, UUIDs,
 * keys, share links) are never printed. Uses HTTPS_PROXY / NO_PROXY when set.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { EnvHttpProxyAgent, request } from "undici";
import type { z } from "zod";
import {
  errorEnvelope,
  nodeAccountEnvelopeWire,
  nodeHealthWire,
  nodeInfoWire,
  nodeProtocolsWire,
  successEnvelope,
  toNodeAccount,
} from "@/server/nodes/contract";
import { signRequest } from "@/server/nodes/signing";
import { normalizeIdentifier } from "@/server/protocols/identifiers";
import { PROTOCOL_SEEDS, type ProtocolSeed } from "@/server/protocols/seed-data";
import { getAdapter } from "@/server/provisioning/adapters/registry";
import { presentAccount } from "@/server/provisioning/present";
import type { NormalizedAccountInput, ProtocolDefinition } from "@/server/provisioning/types";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const baseUrl = (arg("url") ?? "").replace(/\/+$/, "");
const keyId = arg("key-id") ?? "";
const secret = process.env.VPN_NODE_SECRET ?? "";
const createArg = arg("create");
const keep = process.argv.includes("--keep");

if (!/^https?:\/\//.test(baseUrl) || !keyId || !secret) {
  console.error("Usage: VPN_NODE_SECRET=<secret> npm run node:check -- --url https://host:port/api/v1 --key-id <id> [--create all|ssh,vless] [--keep]");
  process.exit(2);
}

const dispatcher = new EnvHttpProxyAgent({ connectTimeout: 15_000 });
const results: { check: string; ok: boolean; note?: string }[] = [];

function record(check: string, ok: boolean, note?: string) {
  results.push({ check, ok, note });
  console.log(`${ok ? "  ✓" : "  ✗"} ${check}${note ? ` — ${note}` : ""}`);
}

interface Reply {
  status: number;
  json: unknown;
  text: string;
}

/** Signed (by default) request; `headers` lets a test resend exactly the same signature. */
async function call(
  method: string,
  path: string,
  opts: { body?: unknown; sign?: boolean; headers?: Record<string, string>; secretOverride?: string; now?: Date; idempotencyKey?: string } = {},
): Promise<Reply & { sentHeaders: Record<string, string> }> {
  const url = new URL(baseUrl + path);
  const body = opts.body === undefined ? "" : JSON.stringify(opts.body);
  const headers: Record<string, string> = opts.headers
    ? { ...opts.headers }
    : opts.sign === false
      ? {}
      : signRequest({ secret: opts.secretOverride ?? secret, keyId, method, path: url.pathname + url.search, body, now: opts.now });
  headers["x-request-id"] = randomUUID();
  if (body) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers["idempotency-key"] = opts.idempotencyKey;
  const res = await request(url, {
    method: method as "GET",
    headers,
    body: body || undefined,
    dispatcher,
    headersTimeout: 60_000,
    bodyTimeout: 60_000,
  });
  const text = await res.body.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.statusCode, json, text, sentHeaders: headers };
}

function errorCode(r: Reply): string | undefined {
  const e = errorEnvelope.safeParse(r.json);
  return e.success ? e.data.error.code : undefined;
}

function dataOf<T extends z.ZodTypeAny>(r: Reply, schema: T): { ok: true; data: z.infer<T> } | { ok: false; why: string } {
  const env = successEnvelope.safeParse(r.json);
  if (!env.success) return { ok: false, why: `not a success envelope (HTTP ${r.status}): ${r.text.slice(0, 160)}` };
  const parsed = schema.safeParse(env.data.data);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 4).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return { ok: false, why: `does not match the contract: ${issues.join("; ")}` };
  }
  return { ok: true, data: parsed.data };
}

function seedFor(protocolId: string): ProtocolSeed | undefined {
  const key = normalizeIdentifier(protocolId);
  return PROTOCOL_SEEDS.find((s) => [s.slug, ...s.nodeIdentifiers].some((i) => normalizeIdentifier(i) === key));
}

function definitionOf(seed: ProtocolSeed): ProtocolDefinition {
  return {
    id: "node-check",
    slug: seed.slug,
    name: seed.name,
    adapterKey: seed.adapterKey,
    durationOptions: seed.durationOptions,
    defaultDurationDays: seed.defaultDurationDays,
    fields: seed.fields.map((f, i) => ({ ...f, displayOrder: i })),
    outputFields: seed.outputFields,
  };
}

/** Which inputs the website sends per protocol (see docs/10-script-api-prompt.md, section 7). */
function testInput(protocolId: string): NormalizedAccountInput {
  const id = normalizeIdentifier(protocolId);
  const username = `chk${randomBytes(4).toString("hex").slice(0, 6)}`;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const password = Array.from(randomBytes(16), (b) => alphabet[b % alphabet.length]).join("");
  const sshFamily = ["ssh", "ssh-ssl", "slowdns", "ssh-websocket", "udp-custom"].includes(seedFor(id)?.slug ?? id);
  return { username, password: sshFamily ? password : undefined, durationDays: 1, options: {} };
}

/** Keys the API prompt asks for on protocols the website has no adapter for yet. */
const EXPECTED_KEYS: Record<string, string[]> = {
  hysteria: ["host", "port", "auth", "uri"],
  hysteria2: ["host", "port", "password", "uri"],
  zivpn: ["host", "password", "ports"],
};

function describeValue(v: string, sensitive: boolean): string {
  if (sensitive) return `•••• (${v.length} chars)`;
  const one = v.replace(/\s+/g, " ");
  return one.length > 70 ? `${one.slice(0, 67)}…` : one;
}

async function main() {
  console.log(`Node API check: ${baseUrl} (key id ${keyId})\n`);

  // 1. Authentication
  console.log("Authentication");
  try {
    const unsigned = await call("GET", "/info", { sign: false });
    record("unsigned request is refused", unsigned.status === 401, `HTTP ${unsigned.status} ${errorCode(unsigned) ?? ""}`.trim());
  } catch (e) {
    record("server reachable", false, `${(e as Error).message}. Check the URL, DNS and that the firewall allows this machine's IP on the API port.`);
    return;
  }
  const wrong = await call("GET", "/info", { secretOverride: `${secret}x` });
  record("wrong secret is refused", wrong.status === 401 && errorCode(wrong) === "INVALID_SIGNATURE", `HTTP ${wrong.status} ${errorCode(wrong) ?? ""}`.trim());
  const stale = await call("GET", "/info", { now: new Date(Date.now() - 10 * 60_000) });
  record("10-minute-old timestamp is refused", stale.status === 401 && errorCode(stale) === "CLOCK_SKEW", `HTTP ${stale.status} ${errorCode(stale) ?? ""}`.trim());
  const first = await call("GET", "/info");
  const replay = await call("GET", "/info", { headers: first.sentHeaders });
  record("valid signature is accepted", first.status === 200, `HTTP ${first.status} ${errorCode(first) ?? ""}`.trim());
  record("replayed nonce is refused", replay.status === 401 && errorCode(replay) === "REPLAYED_NONCE", `HTTP ${replay.status} ${errorCode(replay) ?? ""}`.trim());

  // 2. Server information
  console.log("\nServer information");
  const info = dataOf(first, nodeInfoWire);
  if (!info.ok) {
    record("GET /info matches the contract", false, info.why);
    return;
  }
  const i = info.data;
  record("GET /info matches the contract", true, `api ${i.api_version}, agent ${i.agent_version}, status ${i.status}, hostname ${i.hostname}`);
  record("API version is supported (1.x)", /^1\./.test(i.api_version), i.api_version);
  console.log(`    protocols: ${i.protocols.join(", ") || "(none)"}`);
  console.log(`    capabilities: ${Object.entries(i.capabilities).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  for (const p of i.protocols) {
    const s = seedFor(p);
    console.log(`    ${p} → ${s ? `website protocol "${s.name}" (${s.slug})` : "no website protocol yet (needs adding)"}`);
  }
  if (i.server_time) {
    const skew = Math.round((i.server_time.getTime() - Date.now()) / 1000);
    record("server clock within 60 s", Math.abs(skew) <= 60, `${skew >= 0 ? "+" : ""}${skew} s`);
  }

  const health = await call("GET", "/health");
  const h = dataOf(health, nodeHealthWire);
  record("GET /health matches the contract", h.ok, h.ok ? `status ${h.data.status}, services ${Object.entries(h.data.services).map(([k, v]) => `${k}:${v}`).join(" ") || "(none)"}` : h.why);

  const protos = await call("GET", "/protocols");
  const pr = dataOf(protos, nodeProtocolsWire);
  const portsById = new Map<string, { ports: Record<string, number[] | string>; transports: string[] }>();
  if (pr.ok) {
    for (const p of pr.data.protocols) portsById.set(normalizeIdentifier(p.id), { ports: p.ports, transports: p.transports });
    record("GET /protocols matches the contract", true, pr.data.protocols.map((p) => `${p.id}${p.running === false ? " (stopped)" : ""}`).join(", "));
  } else {
    record("GET /protocols matches the contract", protos.status === 404 || protos.status === 501, pr.why);
  }

  // 3. Test accounts
  if (!createArg) {
    console.log("\n(No accounts created. Add --create all or --create ssh,vless to test account creation.)");
    return;
  }
  const targets = createArg === "all" ? i.protocols : createArg.split(",").map((s) => s.trim()).filter(Boolean);
  for (const protocolId of targets) {
    console.log(`\nAccount test: ${protocolId}`);
    const input = testInput(protocolId);
    const requestId = randomUUID();
    const body = {
      request_id: requestId,
      protocol: protocolId,
      ...(input.username ? { username: input.username } : {}),
      ...(input.password ? { password: input.password } : {}),
      duration_days: input.durationDays,
      options: input.options,
    };
    const started = Date.now();
    const created = await call("POST", "/accounts", { body, idempotencyKey: requestId });
    const env = dataOf(created, nodeAccountEnvelopeWire);
    if (created.status !== 201 || !env.ok) {
      record("create account", false, env.ok ? `HTTP ${created.status}` : `HTTP ${created.status}: ${env.why}`);
      continue;
    }
    const acc = env.data.account;
    record("create account", true, `HTTP 201 in ${Date.now() - started} ms, account ${acc.account_id}, user ${acc.username ?? "-"}, expires ${acc.expires_at?.toISOString() ?? "?"}`);
    record("response echoes the request id", acc.request_id === undefined || acc.request_id === requestId);

    const again = await call("POST", "/accounts", { body, idempotencyKey: requestId });
    const againEnv = dataOf(again, nodeAccountEnvelopeWire);
    record(
      "retry with the same request id returns the same account",
      again.status === 200 && againEnv.ok && againEnv.data.replayed === true && againEnv.data.account.account_id === acc.account_id,
      `HTTP ${again.status}${againEnv.ok ? `, replayed=${againEnv.data.replayed}, account ${againEnv.data.account.account_id}` : ""}`,
    );

    const conflict = await call("POST", "/accounts", { body: { ...body, username: `${input.username}x` }, idempotencyKey: requestId });
    record("same request id with other details is refused", conflict.status === 409 && errorCode(conflict) === "IDEMPOTENCY_CONFLICT", `HTTP ${conflict.status} ${errorCode(conflict) ?? ""}`.trim());
    const stray = dataOf(conflict, nodeAccountEnvelopeWire);
    if (stray.ok && stray.data.account.account_id !== acc.account_id && !keep) {
      await call("DELETE", `/accounts/${encodeURIComponent(stray.data.account.account_id)}`, { idempotencyKey: randomUUID() });
      console.log("    (deleted the extra account the conflict test created)");
    }

    const lookup = await call("GET", `/accounts/by-request/${requestId}`);
    const lookupEnv = dataOf(lookup, nodeAccountEnvelopeWire);
    record("lookup by request id finds it", lookup.status === 200 && lookupEnv.ok && lookupEnv.data.account.account_id === acc.account_id, `HTTP ${lookup.status}`);

    // What the website would show the user
    const seed = seedFor(protocolId);
    if (seed) {
      try {
        const def = definitionOf(seed);
        const sp = portsById.get(normalizeIdentifier(protocolId));
        const ctx = {
          protocol: def,
          server: { id: "node-check", name: "node-check", hostname: i.hostname || new URL(baseUrl).hostname, ipAddress: i.public_ip ?? "0.0.0.0" },
          serverProtocol: { nodeIdentifier: protocolId, ports: sp?.ports ?? {}, transports: sp?.transports ?? [], metadata: {} },
        };
        const provisioned = getAdapter(def.adapterKey).parseAccount(toNodeAccount(acc), ctx, input);
        const shown = presentAccount(def, provisioned, { id: "node-check", name: "node-check" });
        record(`website can read it (${seed.name} adapter)`, true, `${shown.fields.length} fields, ${shown.artifacts.length} links/files`);
        for (const f of shown.fields) console.log(`      ${f.label}: ${describeValue(f.value, f.sensitive)}`);
        for (const a of shown.artifacts) console.log(`      ${a.label}: ${a.kind}${a.filename ? ` ${a.filename}` : ""}${a.qr ? " (QR)" : ""}`);
      } catch (e) {
        record(`website can read it (${seed.name} adapter)`, false, (e as Error).message);
      }
    } else {
      const expected = EXPECTED_KEYS[normalizeIdentifier(protocolId)] ?? [];
      const missing = expected.filter((k) => acc.config[k] === undefined || acc.config[k] === "");
      record(
        "config has the keys from the API prompt",
        missing.length === 0,
        `keys: ${Object.keys(acc.config).join(", ") || "(none)"}${missing.length ? `; missing: ${missing.join(", ")}` : ""}`,
      );
      console.log("    (the website has no adapter for this protocol yet; it will be added in the build)");
    }

    if (keep) {
      console.log(`    kept: account ${acc.account_id}`);
      continue;
    }
    const del = await call("DELETE", `/accounts/${encodeURIComponent(acc.account_id)}`, { idempotencyKey: randomUUID() });
    record("delete account", del.status === 200, `HTTP ${del.status} ${errorCode(del) ?? ""}`.trim());
    const del2 = await call("DELETE", `/accounts/${encodeURIComponent(acc.account_id)}`, { idempotencyKey: randomUUID() });
    record("second delete says not found", del2.status === 404, `HTTP ${del2.status} ${errorCode(del2) ?? ""}`.trim());
  }
}

main()
  .catch((e) => {
    console.error(`\nUnexpected error: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed${failed.length ? `; failed: ${failed.map((f) => f.check).join("; ")}` : ""}`);
    if (failed.length) process.exitCode = 1;
    await dispatcher.close();
  });
