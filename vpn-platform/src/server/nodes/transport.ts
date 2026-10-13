import { isIP, type LookupFunction } from "node:net";
import type { TLSSocket } from "node:tls";
import { Agent, buildConnector, request } from "undici";
import { env, isProduction } from "@/server/env";
import { classifyTransportError, NodeError } from "./errors";
import { assertNodeAddressAllowed } from "./net-guard";
import { NodeHeaders, signRequest } from "./signing";
import { errorEnvelope, successEnvelope } from "./contract";
import type { NodeAuthMethod, NodeTlsMode } from "@/server/db/schema";

/**
 * Everything needed to reach one node. Built from the `servers` + `server_credentials` rows by
 * `loadNodeConnection()`; secrets are decrypted only in memory and never logged.
 */
export interface NodeConnection {
  serverId: string;
  hostname: string;
  /** Admin-configured IP. DNS is pinned to it, so a hostname can never be re-pointed elsewhere. */
  ipAddress: string;
  port: number;
  basePath: string;
  credentialVersion: number;
  auth: { method: NodeAuthMethod; keyId: string | null; secret: string };
  tls: {
    mode: NodeTlsMode;
    serverName?: string | null;
    caPem?: string | null;
    pinnedFingerprintSha256?: string | null;
    clientCertPem?: string | null;
    clientKeyPem?: string | null;
  };
}

export interface NodeRequestOptions {
  method: "GET" | "POST" | "DELETE";
  /** Path relative to the node base path, e.g. "/accounts". Must not contain user-controlled segments
   *  unless they were validated and encodeURIComponent()-ed by the driver. */
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  timeoutMs?: number;
  requestId: string;
  idempotencyKey?: string;
}

export interface NodeResponse {
  status: number;
  data: unknown;
  latencyMs: number;
}

const USER_AGENT = "vaultline-control/1.0";

// ---------------------------------------------------------------------------
// HTTP agents (one per server + credential version + TLS settings)
// ---------------------------------------------------------------------------

const agents = new Map<string, Agent>();
const MAX_AGENTS = 256;

function agentKey(c: NodeConnection) {
  return [c.serverId, c.credentialVersion, c.ipAddress, c.hostname, c.tls.mode, c.tls.serverName ?? ""].join("|");
}

function normalizeFingerprint(fp: string) {
  return fp.replace(/[^A-Fa-f0-9]/g, "").toUpperCase();
}

function pinnedLookup(ip: string): LookupFunction {
  const family = isIP(ip);
  return ((_hostname: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
    if (options?.all) callback(null, [{ address: ip, family }]);
    else callback(null, ip, family);
  }) as unknown as LookupFunction;
}

function getAgent(c: NodeConnection): Agent {
  const key = agentKey(c);
  const existing = agents.get(key);
  if (existing) return existing;

  // Drop agents for older credential versions of the same server.
  for (const [k, a] of agents) {
    if (k.startsWith(`${c.serverId}|`)) {
      agents.delete(k);
      void a.close().catch(() => {});
    }
  }
  if (agents.size >= MAX_AGENTS) {
    const [oldestKey, oldest] = agents.entries().next().value as [string, Agent];
    agents.delete(oldestKey);
    void oldest.close().catch(() => {});
  }

  const hostnameIsIp = isIP(c.hostname) !== 0;
  const servername = c.tls.serverName || (hostnameIsIp ? undefined : c.hostname);
  const base: buildConnector.BuildOptions = {
    timeout: env().NODE_CONNECT_TIMEOUT_MS,
    lookup: pinnedLookup(c.ipAddress),
    ...(servername ? { servername } : {}),
    ...(c.tls.clientCertPem && c.tls.clientKeyPem ? { cert: c.tls.clientCertPem, key: c.tls.clientKeyPem } : {}),
  };

  let connect: buildConnector.connector | buildConnector.BuildOptions;
  switch (c.tls.mode) {
    case "custom_ca":
      connect = { ...base, ca: c.tls.caPem ?? undefined, rejectUnauthorized: true };
      break;
    case "pinned_fingerprint": {
      const expected = normalizeFingerprint(c.tls.pinnedFingerprintSha256 ?? "");
      const inner = buildConnector({ ...base, rejectUnauthorized: false });
      connect = (opts, cb) =>
        inner(opts, (err, socket) => {
          if (err || !socket) return cb(err ?? new Error("connect failed"), null);
          const cert = (socket as TLSSocket).getPeerCertificate?.();
          const actual = cert?.fingerprint256 ? normalizeFingerprint(cert.fingerprint256) : "";
          if (!expected || actual !== expected) {
            socket.destroy();
            const e = new Error("Server certificate fingerprint does not match the pinned value") as Error & { code: string };
            e.code = "ERR_TLS_PIN_MISMATCH";
            return cb(e, null);
          }
          cb(null, socket);
        });
      break;
    }
    default:
      connect = { ...base, rejectUnauthorized: true };
  }

  const agent = new Agent({ connect, keepAliveTimeout: 10_000, keepAliveMaxTimeout: 30_000, connections: 8 });
  agents.set(key, agent);
  return agent;
}

export async function closeAllNodeAgents() {
  const all = [...agents.values()];
  agents.clear();
  await Promise.allSettled(all.map((a) => a.close()));
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

function buildPath(c: NodeConnection, path: string, query?: NodeRequestOptions["query"]) {
  const base = c.basePath.replace(/\/+$/, "");
  const qs = query
    ? Object.entries(query)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join("&")
    : "";
  return `${base}${path}${qs ? `?${qs}` : ""}`;
}

async function readLimited(body: AsyncIterable<Uint8Array>, limit: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of body) {
    total += chunk.byteLength;
    if (total > limit) {
      throw new NodeError({
        kind: "protocol",
        code: "RESPONSE_TOO_LARGE",
        delivery: "maybe",
        safeMessage: "The server's response exceeded the maximum allowed size.",
      });
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Perform one signed request against a node and return the parsed `data` of a success envelope.
 * Throws NodeError for every failure, classified for the provisioning lifecycle.
 */
export async function nodeRequest(c: NodeConnection, opts: NodeRequestOptions): Promise<NodeResponse> {
  if (c.tls.mode === "insecure_http" && isProduction() && !env().ALLOW_INSECURE_NODE_HTTP) {
    throw new NodeError({
      kind: "config",
      code: "INSECURE_TRANSPORT_FORBIDDEN",
      delivery: "not_sent",
      safeMessage: "Plain HTTP is not allowed for node APIs in production. Use HTTPS (custom CA or pinned certificate).",
    });
  }
  try {
    assertNodeAddressAllowed(c.ipAddress);
  } catch (e) {
    throw new NodeError({ kind: "blocked", code: "ADDRESS_BLOCKED", delivery: "not_sent", safeMessage: (e as Error).message });
  }

  const scheme = c.tls.mode === "insecure_http" ? "http" : "https";
  const host = isIP(c.hostname) === 6 ? `[${c.hostname}]` : c.hostname;
  const path = buildPath(c, opts.path, opts.query);
  const url = `${scheme}://${host}:${c.port}${path}`;
  const body = opts.body === undefined ? "" : JSON.stringify(opts.body);

  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": USER_AGENT,
    [NodeHeaders.requestId]: opts.requestId,
  };
  if (body) headers["content-type"] = "application/json";
  if (opts.idempotencyKey) headers[NodeHeaders.idempotencyKey] = opts.idempotencyKey;

  if (c.auth.method === "hmac_sha256") {
    Object.assign(
      headers,
      signRequest({ secret: c.auth.secret, keyId: c.auth.keyId ?? c.serverId, method: opts.method, path, body }),
    );
  } else {
    headers.authorization = `Bearer ${c.auth.secret}`;
  }

  const timeoutMs = opts.timeoutMs ?? env().NODE_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();

  let statusCode: number;
  let text: string;
  let contentType: string;
  try {
    const res = await request(url, {
      method: opts.method,
      headers,
      body: body || undefined,
      dispatcher: getAgent(c),
      signal: controller.signal,
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
      // undici's request() never follows redirects; a 3xx is treated as an error below.
    });
    statusCode = res.statusCode;
    contentType = String(res.headers["content-type"] ?? "");
    text = await readLimited(res.body, env().NODE_MAX_RESPONSE_BYTES);
  } catch (e) {
    throw classifyTransportError(e, { aborted: controller.signal.aborted });
  } finally {
    clearTimeout(timer);
  }
  const latencyMs = Math.round(performance.now() - started);

  let json: unknown;
  try {
    json = contentType.includes("json") || text.startsWith("{") ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }

  const err = errorEnvelope.safeParse(json);
  if (err.success) {
    const { code, message, retryable } = err.data.error;
    const auth = statusCode === 401 || statusCode === 403;
    throw new NodeError({
      kind: auth ? "auth" : "remote",
      code,
      status: statusCode,
      delivery: "processed",
      retryable,
      // Node messages are untrusted: keep them short and plain.
      safeMessage: auth
        ? `The server rejected our credentials (${code}). Check the API key/secret and the server clock.`
        : `Server error ${code}${message ? `: ${message.replace(/[^\x20-\x7E]/g, "").slice(0, 200)}` : ""}`,
    });
  }

  if (statusCode < 200 || statusCode >= 300) {
    const gateway = statusCode === 502 || statusCode === 503 || statusCode === 504;
    throw new NodeError({
      kind: statusCode === 401 || statusCode === 403 ? "auth" : "http",
      code: `HTTP_${statusCode}`,
      status: statusCode,
      delivery: gateway || statusCode >= 500 ? "maybe" : "processed",
      retryable: statusCode >= 500,
      safeMessage:
        statusCode === 404
          ? "The server's management API returned 404. Check the API port and base path."
          : `The server's management API returned HTTP ${statusCode}.`,
    });
  }

  const ok = successEnvelope.safeParse(json);
  if (!ok.success) {
    throw new NodeError({
      kind: "protocol",
      code: "INVALID_ENVELOPE",
      status: statusCode,
      delivery: "maybe",
      safeMessage: "The server responded, but not in the expected API format (missing {\"ok\": true, \"data\": ...}).",
    });
  }
  return { status: statusCode, data: ok.data.data, latencyMs };
}
