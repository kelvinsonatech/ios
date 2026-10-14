import type { NodeAccount } from "@/server/nodes/contract";
import type { PortMap } from "@/server/db/schema";
import type { AdapterContext, Artifact, NormalizedAccountInput, OutputValue } from "../types";

/** The node returned an account we cannot present (missing/invalid protocol-specific values). */
export class AdapterResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdapterResponseError";
  }
}

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

/** Read values from an untrusted `config` object with type and size checks. */
export class ConfigReader {
  constructor(private readonly config: Record<string, unknown>) {}

  get(path: string): unknown {
    let cur: unknown = this.config;
    for (const part of path.split(".")) {
      if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
      cur = (cur as Record<string, unknown>)[part];
    }
    return cur;
  }

  str(path: string, max = 512): string | undefined {
    const v = this.get(path);
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v !== "string") return undefined;
    const s = v.trim();
    if (!s || s.length > max || CONTROL.test(s) || /[\r\n]/.test(s)) return undefined;
    return s;
  }

  /** Multi-line text (config files). */
  text(path: string, max = 65_536): string | undefined {
    const v = this.get(path);
    if (typeof v !== "string") return undefined;
    if (!v.trim() || v.length > max || CONTROL.test(v)) return undefined;
    return v.replace(/\r\n/g, "\n");
  }

  int(path: string): number | undefined {
    const v = this.get(path);
    const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v;
    return typeof n === "number" && Number.isInteger(n) ? n : undefined;
  }

  ports(path: string): number[] | string | undefined {
    return normalizePorts(this.get(path));
  }

  array(path: string): unknown[] {
    const v = this.get(path);
    return Array.isArray(v) ? v.slice(0, 32) : [];
  }

  obj(path: string): ConfigReader {
    const v = this.get(path);
    return new ConfigReader(v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
  }
}

export function normalizePorts(v: unknown): number[] | string | undefined {
  if (typeof v === "number" && Number.isInteger(v) && v > 0 && v < 65536) return [v];
  if (typeof v === "string" && /^\d{1,5}(-\d{1,5})?$/.test(v.trim())) return v.trim();
  if (Array.isArray(v)) {
    const ports = v.filter((p): p is number => typeof p === "number" && Number.isInteger(p) && p > 0 && p < 65536);
    return ports.length ? [...new Set(ports)].slice(0, 32) : undefined;
  }
  return undefined;
}

export function formatPorts(p: number[] | string | undefined): string | undefined {
  if (p === undefined) return undefined;
  return Array.isArray(p) ? p.join(", ") : p;
}

/** Port lookup: account config first, then what the node advertised during capability detection. */
export function portsFrom(cfg: ConfigReader, ctxPorts: PortMap, ...keys: string[]): number[] | string | undefined {
  for (const k of keys) {
    const fromCfg = cfg.ports(`ports.${k}`);
    if (fromCfg !== undefined) return fromCfg;
  }
  for (const k of keys) {
    const fromCtx = normalizePorts(ctxPorts[k]);
    if (fromCtx !== undefined) return fromCtx;
  }
  return undefined;
}

export class ValuesBuilder {
  readonly values: Record<string, OutputValue> = {};
  set(key: string, value: string | number | undefined | null, sensitive = false) {
    if (value === undefined || value === null || value === "") return this;
    this.values[key] = { value: String(value), sensitive };
    return this;
  }
}

const URI_SCHEMES: Record<string, string[]> = {
  vmess: ["vmess://"],
  vless: ["vless://"],
  trojan: ["trojan://", "trojan-go://"],
  shadowsocks: ["ss://"],
  hysteria: ["hysteria://"],
  hysteria2: ["hysteria2://", "hy2://"],
};

export function validUri(uri: unknown, family: keyof typeof URI_SCHEMES): string | undefined {
  if (typeof uri !== "string") return undefined;
  const s = uri.trim();
  if (s.length > 4096 || /\s/.test(s) || CONTROL.test(s)) return undefined;
  return URI_SCHEMES[family]!.some((p) => s.toLowerCase().startsWith(p)) ? s : undefined;
}

export function resolveExpiry(account: NodeAccount, input: NormalizedAccountInput, now = new Date()): Date {
  if (account.expiresAt && account.expiresAt.getTime() > now.getTime() - 60_000) return account.expiresAt;
  return new Date(now.getTime() + input.durationDays * 86_400_000);
}

const HOSTNAME = /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*\.?$/;
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6 = /^[0-9A-Fa-f:]{2,39}$/;

/** A DNS name or an IP address (values from the node end up in share links and app configs). */
export function isHost(v: string | undefined): v is string {
  if (!v) return false;
  if (v.includes(":")) return IPV6.test(v);
  // All-numeric names are only valid as IPv4 addresses ("999.1.1.1" is neither).
  return /^[\d.]+$/.test(v) ? IPV4.test(v) : HOSTNAME.test(v);
}

/** Read a host value and accept it only when it is a valid hostname or IP address. */
export function hostValue(cfg: ConfigReader, path: string): string | undefined {
  const v = cfg.str(path, 253);
  return isHost(v) ? v : undefined;
}

export function hostOf(cfg: ConfigReader, ctx: AdapterContext): string {
  return hostValue(cfg, "host") ?? hostValue(cfg, "domain") ?? ctx.server.hostname;
}

/** "Yes"/"No" for boolean-ish node values ("1", "true", 1, true); undefined when absent. */
export function yesNo(v: unknown): string | undefined {
  if (v === true || v === 1 || v === "1" || v === "true") return "Yes";
  if (v === false || v === 0 || v === "0" || v === "false") return "No";
  return undefined;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 64) || "config";
}

export function fileArtifact(a: Omit<Artifact, "kind">): Artifact {
  return { ...a, kind: "file", filename: a.filename ? sanitizeFilename(a.filename) : undefined };
}

export function requireRemoteId(account: NodeAccount): string {
  if (!account.accountId) throw new AdapterResponseError("Server did not return an account id.");
  return account.accountId;
}
