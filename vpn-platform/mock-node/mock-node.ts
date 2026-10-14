/**
 * MOCK VPN NODE — development and test simulator only.
 *
 * Implements the website's Node API contract v1 (docs/04-node-api-contract.md) with in-memory
 * state so the admin workflow (Add Server → Connect → Detect → Publish) and the provisioning
 * lifecycle can be exercised without a real VPS. It does NOT represent how the real server-side
 * installation script works and runs no system commands.
 */
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer, type ServerResponse } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { randomBytes, randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { verifySignedRequest } from "../src/server/nodes/signing";

export interface MockNodeOptions {
  port?: number;
  host?: string;
  hostname?: string;
  publicIp?: string;
  keyId?: string;
  secret: string;
  authMethod?: "hmac_sha256" | "bearer_token";
  basePath?: string;
  apiVersion?: string;
  agentVersion?: string;
  protocols?: string[];
  tls?: { cert: string; key: string };
  /** Enable unsigned /__mock control endpoints (tests / local dev). */
  control?: boolean;
  /** Artificial delay before every API answer, ms (status page / latency demos). Default 0. */
  latencyMs?: number;
  /** Value reported as capabilities.expiry_managed_by_node (the owner's nodes report false). */
  expiryManagedByNode?: boolean;
  /** ISO country code reported by /info. */
  country?: string;
}

interface MockAccount {
  accountId: string;
  requestId: string;
  digest: string;
  protocol: string;
  username?: string;
  password?: string;
  status: "active" | "revoked" | "expired";
  createdAt: Date;
  expiresAt: Date;
  config: Record<string, unknown>;
}

export interface MockNodeState {
  protocols: string[];
  stopped: Set<string>;
  accounts: Map<string, MockAccount>;
  byRequest: Map<string, string>;
  /** Delay before answering POST /accounts (after the account is created). */
  createDelayMs: number;
  /** Fail the next N create requests with PROVISIONING_FAILED. */
  failNextCreates: number;
  requestLog: { method: string; path: string; status: number }[];
  maintenance: boolean;
  /** Artificial delay before every API answer (±20 % jitter), ms. */
  latencyMs: number;
}

const SSH_FAMILY = new Set(["ssh", "ssh-ws", "ssh-websocket", "stunnel", "ssh-ssl", "slowdns", "udp-custom", "openvpn", "noobzvpn"]);

/**
 * The protocol ids the owner's install script reports (docs/10-script-api-prompt.md section 6).
 * Older/other ids (ssh-ws, stunnel, udp-custom, shadowsocks, wireguard, openvpn, noobzvpn) are still
 * understood when passed in `protocols`.
 */
export const OWNER_PROTOCOLS = ["ssh", "ssh-ssl", "slowdns", "vmess", "vless", "trojan", "hysteria", "hysteria2", "zivpn"];
const DEFAULT_PROTOCOLS = OWNER_PROTOCOLS;

function portsFor(id: string): { ports: Record<string, number[] | string>; transports: string[] } {
  switch (id) {
    case "ssh":
      return { ports: { openssh: [22], dropbear: [109, 143], ws: [80], ws_tls: [443] }, transports: [] };
    case "ssh-ws":
    case "ssh-websocket":
      return { ports: { ws: [80, 8080], ws_tls: [443] }, transports: ["ws"] };
    case "ssh-ssl":
      return { ports: { ssl: [443, 447], ws_tls: [443] }, transports: [] };
    case "stunnel":
      return { ports: { ssl: [443, 777] }, transports: [] };
    case "slowdns":
      return { ports: { slowdns: [53], openssh: [22] }, transports: [] };
    case "hysteria":
      return { ports: { udp: [36712] }, transports: [] };
    case "hysteria2":
      return { ports: { udp: [8443] }, transports: [] };
    case "zivpn":
      return { ports: { udp: "6000-19999" }, transports: [] };
    case "udp-custom":
      return { ports: { udp_custom: "1-65535" }, transports: [] };
    case "vmess":
    case "vless":
    case "trojan":
      return { ports: { tls: [443], none: [80] }, transports: ["ws", "grpc"] };
    case "shadowsocks":
      return { ports: { tcp: [8388] }, transports: [] };
    case "wireguard":
      return { ports: { udp: [51820] }, transports: [] };
    case "openvpn":
      return { ports: { tcp: [1194], udp: [2200], ssl: [990] }, transports: [] };
    case "noobzvpn":
      return { ports: { tcp: [8080], ssl: [8443] }, transports: [] };
    default:
      return { ports: {}, transports: [] };
  }
}

const wgKey = () => randomBytes(32).toString("base64");
const secretFor = () => randomBytes(12).toString("base64url");

interface NodeSecrets {
  slowdnsPublicKey: string;
  hysteriaObfs: string;
  hysteria2Obfs: string;
}

/** Realistic `config` per protocol, following docs/10-script-api-prompt.md section 8. */
function buildConfig(
  protocol: string,
  host: string,
  ip: string,
  secrets: NodeSecrets,
  a: { username?: string; password?: string; transport?: string },
) {
  const base = { host, ip };
  const q = encodeURIComponent;
  switch (protocol) {
    case "ssh":
      return {
        ...base,
        username: a.username,
        password: a.password,
        ports: { openssh: [22], dropbear: [109, 143], ws: [80], ws_tls: [443] },
        payload: `GET / HTTP/1.1[crlf]Host: ${host}[crlf]Upgrade: websocket[crlf][crlf]`,
      };
    case "ssh-ssl":
      return {
        ...base,
        username: a.username,
        password: a.password,
        ports: { ssl: [443, 447], ws_tls: [443] },
        sni: host,
        payload: `GET wss://${host}/ HTTP/1.1[crlf]Host: [host][crlf]Upgrade: websocket[crlf][crlf]`,
      };
    case "slowdns":
      return {
        ...base,
        username: a.username,
        password: a.password,
        ports: { slowdns: [53], openssh: [22] },
        slowdns: { nameserver: `ns-${host}`, public_key: secrets.slowdnsPublicKey },
      };
    case "vmess":
    case "vless":
    case "trojan": {
      const path = `/${protocol}`;
      const cred = protocol === "trojan" ? { password: randomBytes(12).toString("hex") } : { uuid: randomUUID() };
      const conns = [
        { name: "WS TLS", network: "ws", security: "tls", port: 443, path, host_header: host, sni: host },
        { name: "WS", network: "ws", security: "none", port: 80, path, host_header: host },
        { name: "gRPC", network: "grpc", security: "tls", port: 443, service_name: `${protocol}-grpc`, sni: host },
      ];
      return {
        ...base,
        remark: a.username,
        ...cred,
        ...(protocol === "vmess" ? { alter_id: 0 } : {}),
        ...(protocol === "vless" ? { flow: "" } : {}),
        connections: a.transport === "grpc" ? conns.filter((c) => c.network === "grpc") : conns.filter((c) => c.network === "ws"),
      };
    }
    case "hysteria": {
      const auth = a.password ?? secretFor();
      return {
        ...base,
        port: 36712,
        protocol: "udp",
        auth,
        obfs: "xplus",
        obfs_password: secrets.hysteriaObfs,
        up_mbps: 100,
        down_mbps: 100,
        alpn: "hysteria",
        sni: host,
        insecure: true,
        uri: `hysteria://${host}:36712?protocol=udp&auth=${q(auth)}&peer=${host}&insecure=1&upmbps=100&downmbps=100&alpn=hysteria&obfs=xplus&obfsParam=${q(secrets.hysteriaObfs)}#${q(a.username ?? "account")}`,
      };
    }
    case "hysteria2": {
      const password = a.password ?? secretFor();
      return {
        ...base,
        port: 8443,
        password,
        obfs: { type: "salamander", password: secrets.hysteria2Obfs },
        sni: host,
        insecure: false,
        uri: `hysteria2://${q(password)}@${host}:8443/?sni=${host}&obfs=salamander&obfs-password=${q(secrets.hysteria2Obfs)}&insecure=0#${q(a.username ?? "account")}`,
      };
    }
    case "zivpn":
      return { ...base, password: a.password ?? secretFor(), ports: { udp: "6000-19999" }, obfs: "zivpn" };
    case "shadowsocks":
      return { ...base, port: 8388, method: "chacha20-ietf-poly1305", password: randomBytes(12).toString("base64url") };
    case "wireguard": {
      const octet = 2 + Math.floor(Math.random() * 250);
      return {
        interface: { address: `10.66.66.${octet}/32`, dns: "1.1.1.1, 1.0.0.1", private_key: wgKey() },
        peer: { public_key: wgKey(), endpoint: `${host}:51820`, allowed_ips: "0.0.0.0/0, ::/0", persistent_keepalive: 25 },
      };
    }
    case "openvpn":
      return {
        ...base,
        username: a.username,
        password: a.password,
        ports: { tcp: [1194], udp: [2200] },
        configs: ["tcp", "udp"].map((proto) => ({
          name: proto,
          filename: `client-${proto}.ovpn`,
          content: `client\ndev tun\nproto ${proto}\nremote ${host} ${proto === "tcp" ? 1194 : 2200}\nauth-user-pass\nnobind\npersist-key\npersist-tun\nverb 3\n<ca>\n-----BEGIN CERTIFICATE-----\nMOCK\n-----END CERTIFICATE-----\n</ca>\n`,
        })),
      };
    case "noobzvpn":
      return { ...base, username: a.username, password: a.password, ports: { tcp: [8080], ssl: [8443] } };
    default:
      return {
        ...base,
        username: a.username,
        password: a.password,
        ports: {
          openssh: [22],
          dropbear: [109, 143],
          ssl: [443, 777],
          ws: [80, 8080],
          ws_tls: [443],
          udp_custom: "1-65535",
          slowdns: [53, 5300],
        },
        slowdns: { nameserver: `ns.${host}`, public_key: secrets.slowdnsPublicKey },
        payload: `GET / HTTP/1.1[crlf]Host: ${host}[crlf]Upgrade: websocket[crlf][crlf]`,
      };
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}
const ok = (res: ServerResponse, data: unknown, status = 200) => send(res, status, { ok: true, data });
const fail = (res: ServerResponse, status: number, code: string, message: string, retryable = false) =>
  send(res, status, { ok: false, error: { code, message, retryable } });

function readBody(req: IncomingMessage, limit = 65_536): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("too large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function view(a: MockAccount, withConfig: boolean) {
  return {
    account_id: a.accountId,
    request_id: a.requestId,
    protocol: a.protocol,
    username: a.username,
    status: a.status,
    created_at: a.createdAt.toISOString(),
    expires_at: a.expiresAt.toISOString(),
    config: withConfig ? a.config : {},
  };
}

export async function startMockNode(opts: MockNodeOptions) {
  const hostname = opts.hostname ?? "node.test";
  const publicIp = opts.publicIp ?? "203.0.113.10";
  const basePath = (opts.basePath ?? "/api/v1").replace(/\/+$/, "");
  const keyId = opts.keyId ?? "mock-key";
  const state: MockNodeState = {
    protocols: [...(opts.protocols ?? DEFAULT_PROTOCOLS)],
    stopped: new Set(),
    accounts: new Map(),
    byRequest: new Map(),
    createDelayMs: 0,
    failNextCreates: 0,
    requestLog: [],
    maintenance: false,
    latencyMs: Math.max(0, opts.latencyMs ?? 0),
  };
  const secrets: NodeSecrets = {
    slowdnsPublicKey: randomBytes(32).toString("hex"),
    hysteriaObfs: secretFor(),
    hysteria2Obfs: secretFor(),
  };
  const nonces = new Map<string, number>();

  const handler = async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? "/";
    const method = (req.method ?? "GET").toUpperCase();
    const pathOnly = url.split("?")[0]!;
    // "close" also fires when the client gave up (timeout), so every received request is logged.
    res.on("close", () => state.requestLog.push({ method, path: pathOnly, status: res.statusCode }));
    let body = "";
    try {
      body = await readBody(req);
    } catch {
      return fail(res, 413, "VALIDATION_FAILED", "Body too large");
    }

    // ---- test control endpoints (unsigned) ----
    if (opts.control && pathOnly.startsWith("/__mock/")) {
      const input = body ? JSON.parse(body) : {};
      if (pathOnly === "/__mock/protocols") state.protocols = input.protocols;
      if (pathOnly === "/__mock/behaviour") {
        if (typeof input.createDelayMs === "number") state.createDelayMs = input.createDelayMs;
        if (typeof input.failNextCreates === "number") state.failNextCreates = input.failNextCreates;
        if (typeof input.maintenance === "boolean") state.maintenance = input.maintenance;
        if (typeof input.latencyMs === "number") state.latencyMs = Math.max(0, input.latencyMs);
        if (Array.isArray(input.stopped)) state.stopped = new Set(input.stopped.map(String));
      }
      return ok(res, { protocols: state.protocols });
    }

    if (!pathOnly.startsWith(basePath)) return fail(res, 404, "NOT_FOUND", "Unknown path");
    if (state.latencyMs > 0) {
      const jitter = state.latencyMs * (0.8 + Math.random() * 0.4);
      await new Promise((r) => setTimeout(r, Math.round(jitter)));
    }

    // ---- authentication ----
    const headers = Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    if ((opts.authMethod ?? "hmac_sha256") === "bearer_token") {
      if (headers.authorization !== `Bearer ${opts.secret}`) return fail(res, 401, "UNAUTHORIZED", "Invalid token");
    } else {
      const now = Date.now();
      for (const [n, exp] of nonces) if (exp < now) nonces.delete(n);
      const v = verifySignedRequest({
        headers,
        method,
        path: url,
        body,
        resolveSecret: (id) => (id === keyId ? opts.secret : undefined),
        seenNonce: (n) => {
          if (nonces.has(n)) return true;
          nonces.set(n, now + 600_000);
          return false;
        },
      });
      if (!v.ok) return fail(res, 401, v.code, "Signature verification failed");
    }

    const route = pathOnly.slice(basePath.length) || "/";
    const json = () => (body ? (JSON.parse(body) as Record<string, unknown>) : {});

    if (method === "GET" && route === "/info") {
      return ok(res, {
        api_version: opts.apiVersion ?? "1.0",
        agent_version: opts.agentVersion ?? "1.0.0",
        status: state.maintenance ? "maintenance" : "online",
        hostname,
        public_ip: publicIp,
        country: opts.country ?? "SG",
        server_time: new Date().toISOString(),
        protocols: state.protocols,
        capabilities: {
          idempotency: true,
          lookup_by_request_id: true,
          renew: true,
          list_accounts: true,
          restart_agent: true,
          expiry_managed_by_node: opts.expiryManagedByNode ?? false,
        },
      });
    }
    if (method === "GET" && route === "/health") {
      return ok(res, {
        status: "online",
        uptime_seconds: Math.floor(process.uptime()) + 86_400,
        cpu_percent: 12.5,
        memory: { used_bytes: 812_000_000, total_bytes: 2_048_000_000 },
        disk: { used_bytes: 9_400_000_000, total_bytes: 40_000_000_000 },
        load: [0.21, 0.18, 0.12],
        services: Object.fromEntries(state.protocols.map((p) => [p, state.stopped.has(p) ? "stopped" : "running"])),
      });
    }
    if (method === "GET" && route === "/protocols") {
      return ok(res, {
        protocols: state.protocols.map((id) => {
          const meta = portsFor(id);
          const count = [...state.accounts.values()].filter((a) => a.protocol === id && a.status === "active").length;
          return { id, installed: true, running: !state.stopped.has(id), ...meta, current_accounts: count, max_accounts: null, metadata: {} };
        }),
      });
    }
    if (method === "GET" && route === "/stats") {
      const active = [...state.accounts.values()].filter((a) => a.status === "active");
      const byProtocol: Record<string, number> = {};
      for (const a of active) byProtocol[a.protocol] = (byProtocol[a.protocol] ?? 0) + 1;
      return ok(res, { accounts_total: active.length, accounts_by_protocol: byProtocol, online_users: Math.min(active.length, 3), bandwidth: { rx_bytes: 1e9, tx_bytes: 4e9 } });
    }
    if (method === "POST" && route === "/accounts") {
      const input = json();
      const requestId = String(input.request_id ?? headers["idempotency-key"] ?? "");
      const protocol = String(input.protocol ?? "");
      const digest = JSON.stringify([protocol, input.username, input.duration_days]);
      if (!requestId) return fail(res, 422, "VALIDATION_FAILED", "request_id is required");
      const existingId = state.byRequest.get(requestId);
      if (existingId) {
        const existing = state.accounts.get(existingId)!;
        if (existing.digest !== digest) return fail(res, 409, "IDEMPOTENCY_CONFLICT", "request_id reused with a different payload");
        return ok(res, { account: view(existing, true), replayed: true });
      }
      if (!state.protocols.includes(protocol)) return fail(res, 422, "PROTOCOL_UNAVAILABLE", `Protocol ${protocol} is not installed`);
      if (state.failNextCreates > 0) {
        state.failNextCreates -= 1;
        return fail(res, 500, "PROVISIONING_FAILED", "Simulated failure", true);
      }
      const username = typeof input.username === "string" ? input.username : undefined;
      if (username) {
        const family = SSH_FAMILY.has(protocol) ? "ssh" : protocol;
        const clash = [...state.accounts.values()].some(
          (a) => a.status === "active" && a.username === username && (SSH_FAMILY.has(a.protocol) ? "ssh" : a.protocol) === family,
        );
        if (clash) return fail(res, 409, "USERNAME_TAKEN", "Username already exists");
      }
      const days = Number(input.duration_days ?? 7);
      const options = (input.options ?? {}) as Record<string, string>;
      const account: MockAccount = {
        accountId: `acc_${randomBytes(6).toString("hex")}`,
        requestId,
        digest,
        protocol,
        username,
        password: typeof input.password === "string" ? input.password : undefined,
        status: "active",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + days * 86_400_000),
        config: buildConfig(protocol, hostname, publicIp, secrets, {
          username,
          password: typeof input.password === "string" ? input.password : undefined,
          transport: options.transport,
        }),
      };
      state.accounts.set(account.accountId, account);
      state.byRequest.set(requestId, account.accountId);
      if (state.createDelayMs > 0) await new Promise((r) => setTimeout(r, state.createDelayMs));
      return ok(res, { account: view(account, true), replayed: false }, 201);
    }
    const byReq = /^\/accounts\/by-request\/([^/]+)$/.exec(route);
    if (method === "GET" && byReq) {
      const id = state.byRequest.get(decodeURIComponent(byReq[1]!));
      return id ? ok(res, { account: view(state.accounts.get(id)!, true) }) : fail(res, 404, "ACCOUNT_NOT_FOUND", "No account for this request");
    }
    const renew = /^\/accounts\/([^/]+)\/renew$/.exec(route);
    if (method === "POST" && renew) {
      const a = state.accounts.get(decodeURIComponent(renew[1]!));
      if (!a || a.status === "revoked") return fail(res, 404, "ACCOUNT_NOT_FOUND", "Unknown account");
      const days = Number(json().duration_days ?? 7);
      a.expiresAt = new Date(Math.max(a.expiresAt.getTime(), Date.now()) + days * 86_400_000);
      a.status = "active";
      return ok(res, { account: view(a, false) });
    }
    const one = /^\/accounts\/([^/]+)$/.exec(route);
    if (one) {
      const a = state.accounts.get(decodeURIComponent(one[1]!));
      if (method === "GET") return a ? ok(res, { account: view(a, false) }) : fail(res, 404, "ACCOUNT_NOT_FOUND", "Unknown account");
      if (method === "DELETE") {
        if (!a || a.status === "revoked") return fail(res, 404, "ACCOUNT_NOT_FOUND", "Unknown account");
        a.status = "revoked";
        return ok(res, { revoked: true });
      }
    }
    if (method === "GET" && route === "/accounts") {
      return ok(res, { accounts: [...state.accounts.values()].map((a) => view(a, false)), next_cursor: null });
    }
    if (method === "POST" && route === "/agent/restart") return ok(res, { accepted: true }, 202);
    return fail(res, 404, "NOT_FOUND", "Unknown route");
  };

  const listener = (req: IncomingMessage, res: ServerResponse) => {
    handler(req, res).catch(() => {
      if (!res.headersSent) fail(res, 500, "INTERNAL", "Internal error");
    });
  };
  const server: HttpServer = opts.tls ? createHttpsServer({ cert: opts.tls.cert, key: opts.tls.key }, listener) : createHttpServer(listener);
  await new Promise<void>((resolve) => server.listen(opts.port ?? 0, opts.host ?? "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    state,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
