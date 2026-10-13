import type { OutputFieldDefinition } from "@/server/db/schema";
import type { Artifact, ProtocolAdapter, SeedField } from "../types";
import {
  AdapterResponseError,
  ConfigReader,
  hostOf,
  requireRemoteId,
  resolveExpiry,
  validUri,
  ValuesBuilder,
} from "./base";
import { remarkGuard, transportGuard } from "./guards";

/**
 * VMess / VLESS / Trojan (Xray / V2Ray family).
 *
 * Expected `config` from the node (contract v1, aligned with the real script in PHASE 11):
 * {
 *   host, ip?, remark?,
 *   uuid?            (vmess, vless)   — credential
 *   password?        (trojan)         — credential
 *   alter_id?, flow?,
 *   connections: [{ name?, network: "ws"|"grpc"|"tcp"|"httpupgrade"|..., security: "tls"|"none"|"reality",
 *                   port, path?, host_header?, sni?, service_name?, uri? }]
 * }
 * The node is authoritative: when it supplies `uri` we use it verbatim (after scheme validation);
 * otherwise a standard share link is assembled from the node-provided values.
 */
export type V2rayFamily = "vmess" | "vless" | "trojan";

type Conn = {
  name?: string;
  network: string;
  security: string;
  port: number;
  path?: string;
  hostHeader?: string;
  sni?: string;
  serviceName?: string;
  uri?: string;
};

const OUTPUTS = (family: V2rayFamily): OutputFieldDefinition[] => [
  { key: "host", label: "Domain", kind: "text", sensitive: false, copyable: true },
  { key: "ip", label: "IP address", kind: "text", sensitive: false, copyable: true, hidden: true },
  { key: "remark", label: "Remark", kind: "text", sensitive: false, copyable: true },
  family === "trojan"
    ? { key: "password", label: "Password", kind: "secret", sensitive: true, copyable: true }
    : { key: "uuid", label: "UUID", kind: "secret", sensitive: true, copyable: true },
  ...(family === "vmess" ? [{ key: "alter_id", label: "Alter ID", kind: "text", sensitive: false, copyable: true } as const] : []),
  ...(family === "vless" ? [{ key: "flow", label: "Flow", kind: "text", sensitive: false, copyable: true, hidden: true } as const] : []),
  { key: "tls_ports", label: "TLS port", kind: "text", sensitive: false, copyable: true },
  { key: "none_tls_ports", label: "Non-TLS port", kind: "text", sensitive: false, copyable: true },
  { key: "networks", label: "Network", kind: "text", sensitive: false, copyable: false },
  { key: "path", label: "Path", kind: "text", sensitive: false, copyable: true },
  { key: "service_name", label: "gRPC service name", kind: "text", sensitive: false, copyable: true },
  { key: "sni", label: "SNI", kind: "text", sensitive: false, copyable: true },
];

export const V2RAY_DEFAULT_FIELDS: SeedField[] = [
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "e.g. traveller",
    helpText: "Used as the account remark.",
    options: [],
    validation: { minLength: 3, maxLength: 32 },
  },
  {
    key: "transport",
    label: "Transport",
    type: "select",
    required: true,
    options: [
      { value: "ws", label: "WebSocket" },
      { value: "grpc", label: "gRPC" },
    ],
    validation: {},
    defaultValue: "ws",
  },
  { key: "duration", label: "Duration", type: "duration", required: true, options: [], validation: {} },
];

function readConnections(cfg: ConfigReader): Conn[] {
  const out: Conn[] = [];
  for (const raw of cfg.array("connections")) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const c = new ConfigReader(raw as Record<string, unknown>);
    const port = c.int("port");
    const network = c.str("network", 32)?.toLowerCase();
    if (!port || port < 1 || port > 65535 || !network) continue;
    out.push({
      name: c.str("name", 64),
      network,
      security: (c.str("security", 16) ?? "none").toLowerCase(),
      port,
      path: c.str("path", 256),
      hostHeader: c.str("host_header", 253),
      sni: c.str("sni", 253),
      serviceName: c.str("service_name", 128),
      uri: c.str("uri", 4096),
    });
  }
  return out;
}

const q = encodeURIComponent;

function buildUri(family: V2rayFamily, cred: string, host: string, remark: string, c: Conn, alterId?: number, flow?: string): string {
  if (family === "vmess") {
    const json = {
      v: "2",
      ps: remark,
      add: host,
      port: String(c.port),
      id: cred,
      aid: String(alterId ?? 0),
      scy: "auto",
      net: c.network,
      type: "none",
      host: c.hostHeader ?? (c.network === "ws" ? host : ""),
      path: c.network === "grpc" ? (c.serviceName ?? "") : (c.path ?? ""),
      tls: c.security === "tls" ? "tls" : "",
      sni: c.sni ?? (c.security === "tls" ? host : ""),
    };
    return `vmess://${Buffer.from(JSON.stringify(json)).toString("base64")}`;
  }
  const params = new URLSearchParams();
  if (family === "vless") params.set("encryption", "none");
  if (flow) params.set("flow", flow);
  params.set("type", c.network);
  params.set("security", c.security === "tls" || c.security === "reality" ? c.security : "none");
  if (c.path) params.set("path", c.path);
  if (c.hostHeader) params.set("host", c.hostHeader);
  if (c.serviceName) params.set("serviceName", c.serviceName);
  if (c.security === "tls") params.set("sni", c.sni ?? host);
  return `${family}://${q(cred)}@${host}:${c.port}?${params.toString()}#${q(remark)}`;
}

function uniq<T>(xs: (T | undefined)[]): T[] {
  return [...new Set(xs.filter((x): x is T => x !== undefined))];
}

export function createV2rayAdapter(family: V2rayFamily): ProtocolAdapter {
  const label = family === "vmess" ? "VMess" : family === "vless" ? "VLESS" : "Trojan";
  return {
    key: family,
    label,
    description: `${label} account on the node's Xray/V2Ray core. Returns share links and QR codes.`,
    inputGuards: { username: remarkGuard, transport: transportGuard },
    requiredInputs: ["username"],
    supportsRenew: true,
    outputFields: OUTPUTS(family),
    defaultFields: V2RAY_DEFAULT_FIELDS,

    buildSpec(input, ctx) {
      const transport = input.options.transport;
      const offered = ctx.serverProtocol.transports;
      if (transport && offered.length > 0 && !offered.includes(transport)) {
        throw new AdapterResponseError(`This server does not offer the "${transport}" transport.`);
      }
      return {
        protocol: ctx.serverProtocol.nodeIdentifier ?? ctx.protocol.slug,
        username: input.username,
        durationDays: input.durationDays,
        options: input.options,
      };
    },

    parseAccount(account, ctx, input) {
      const cfg = new ConfigReader(account.config);
      const host = hostOf(cfg, ctx);
      const remark = cfg.str("remark", 64) ?? account.username ?? input.username ?? "account";
      const cred = family === "trojan" ? cfg.str("password", 256) : cfg.str("uuid", 64);
      if (!cred) throw new AdapterResponseError(`Server did not return the ${family === "trojan" ? "password" : "UUID"}.`);
      if (family !== "trojan" && !/^[0-9a-fA-F-]{32,36}$/.test(cred)) throw new AdapterResponseError("Server returned an invalid UUID.");
      const alterId = cfg.int("alter_id");
      const flow = cfg.str("flow", 64);
      const conns = readConnections(cfg);

      const artifacts: Artifact[] = [];
      conns.forEach((c, i) => {
        const uri = validUri(c.uri, family) ?? buildUri(family, cred, host, remark, c, alterId, flow);
        const name = c.name ?? `${c.network.toUpperCase()} ${c.security === "none" ? "" : c.security.toUpperCase()}`.trim();
        artifacts.push({ key: `link_${i + 1}`, label: `${label} ${name}`, kind: "uri", content: uri, qr: true, sensitive: true });
      });
      // Links supplied directly as config.links: [{ name, uri }]
      for (const raw of cfg.array("links")) {
        const r = new ConfigReader((raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>);
        const uri = validUri(r.str("uri", 4096), family);
        if (uri && !artifacts.some((a) => a.content === uri)) {
          artifacts.push({ key: `link_${artifacts.length + 1}`, label: `${label} ${r.str("name", 64) ?? ""}`.trim(), kind: "uri", content: uri, qr: true, sensitive: true });
        }
      }
      if (artifacts.length === 0) throw new AdapterResponseError("Server did not return any connection details.");

      const v = new ValuesBuilder()
        .set("host", host)
        .set("ip", cfg.str("ip", 64) ?? ctx.server.ipAddress)
        .set("remark", remark)
        .set(family === "trojan" ? "password" : "uuid", cred, true)
        .set("alter_id", family === "vmess" ? (alterId ?? 0) : undefined)
        .set("flow", flow)
        .set("tls_ports", uniq(conns.filter((c) => c.security !== "none").map((c) => c.port)).join(", "))
        .set("none_tls_ports", uniq(conns.filter((c) => c.security === "none").map((c) => c.port)).join(", "))
        .set("networks", uniq(conns.map((c) => c.network)).join(", "))
        .set("path", uniq(conns.map((c) => c.path)).join(", "))
        .set("service_name", uniq(conns.map((c) => c.serviceName)).join(", "))
        .set("sni", uniq(conns.map((c) => c.sni)).join(", "));

      return {
        remoteAccountId: requireRemoteId(account),
        username: account.username ?? input.username,
        expiresAt: resolveExpiry(account, input),
        values: v.values,
        artifacts,
      };
    },
  };
}
