import type { OutputFieldDefinition } from "@/server/db/schema";
import type { Artifact, ProtocolAdapter, SeedField } from "../types";
import {
  AdapterResponseError,
  ConfigReader,
  formatPorts,
  hostOf,
  hostValue,
  normalizePorts,
  portsFrom,
  requireRemoteId,
  resolveExpiry,
  validUri,
  ValuesBuilder,
  yesNo,
} from "./base";
import { linuxUsernameGuard, passwordGuard } from "./guards";

/**
 * Hysteria 1 and Hysteria 2 (QUIC over UDP). The node keeps the accounts in its agent database and
 * authenticates connections itself (external / HTTP auth), so creating an account restarts nothing.
 *
 * Expected `config` (docs/10-script-api-prompt.md section 8):
 *  hysteria:  { host, ip?, port, protocol?, auth, obfs?, obfs_password?, up_mbps?, down_mbps?, alpn?, sni?, insecure?, uri? }
 *  hysteria2: { host, ip?, port, password, obfs?: { type, password }, sni?, insecure?, pin_sha256?, uri? }
 * `port` may be a number, a list or a port-hopping range ("20000-50000").
 * A node-provided `uri` is used verbatim after scheme validation; otherwise the standard share link
 * is assembled (Hysteria 1: hysteria://host:port?..., Hysteria 2: hysteria2://password@host:port/?...).
 */
export type HysteriaVersion = "hysteria" | "hysteria2";

/** Hysteria 1 links require up/down bandwidth; used when the node does not report its own. */
const DEFAULT_MBPS = 100;

const OUTPUTS: Record<HysteriaVersion, OutputFieldDefinition[]> = {
  hysteria: [
    { key: "host", label: "Server", kind: "text", sensitive: false, copyable: true },
    { key: "ip", label: "IP address", kind: "text", sensitive: false, copyable: true, hidden: true },
    { key: "port", label: "Port", kind: "text", sensitive: false, copyable: true },
    { key: "protocol", label: "Protocol", kind: "text", sensitive: false, copyable: true },
    { key: "auth", label: "Auth string", kind: "secret", sensitive: true, copyable: true },
    { key: "obfs", label: "Obfuscation", kind: "text", sensitive: false, copyable: true },
    { key: "obfs_password", label: "Obfuscation password", kind: "secret", sensitive: true, copyable: true },
    { key: "sni", label: "SNI", kind: "text", sensitive: false, copyable: true },
    { key: "alpn", label: "ALPN", kind: "text", sensitive: false, copyable: true },
    { key: "up_mbps", label: "Upload (Mbps)", kind: "text", sensitive: false, copyable: true },
    { key: "down_mbps", label: "Download (Mbps)", kind: "text", sensitive: false, copyable: true },
    { key: "insecure", label: "Allow insecure", kind: "text", sensitive: false, copyable: false },
  ],
  hysteria2: [
    { key: "host", label: "Server", kind: "text", sensitive: false, copyable: true },
    { key: "ip", label: "IP address", kind: "text", sensitive: false, copyable: true, hidden: true },
    { key: "port", label: "Port", kind: "text", sensitive: false, copyable: true },
    { key: "password", label: "Password", kind: "secret", sensitive: true, copyable: true },
    { key: "obfs", label: "Obfuscation", kind: "text", sensitive: false, copyable: true },
    { key: "obfs_password", label: "Obfuscation password", kind: "secret", sensitive: true, copyable: true },
    { key: "sni", label: "SNI", kind: "text", sensitive: false, copyable: true },
    { key: "insecure", label: "Allow insecure", kind: "text", sensitive: false, copyable: false },
    { key: "pin_sha256", label: "Certificate pin (SHA-256)", kind: "text", sensitive: false, copyable: true },
  ],
};

const LABELS: Record<HysteriaVersion, string> = { hysteria: "Hysteria", hysteria2: "Hysteria 2" };

export const HYSTERIA_DEFAULT_FIELDS: SeedField[] = [
  {
    key: "username",
    label: "Username",
    type: "text",
    required: true,
    placeholder: "e.g. traveller",
    helpText: "3–32 lowercase letters, digits or _.",
    options: [],
    validation: { minLength: 3, maxLength: 32 },
  },
  {
    key: "password",
    label: "Password",
    type: "password",
    required: false,
    placeholder: "Leave empty to generate one",
    helpText: "Optional. 6–32 characters; the server generates a strong one when empty.",
    options: [],
    validation: { minLength: 6, maxLength: 32 },
  },
  { key: "duration", label: "Duration", type: "duration", required: true, options: [], validation: {} },
];

const q = encodeURIComponent;

/** Port(s) for a share link: "443", "443,8443" or "20000-50000". */
function linkPort(p: number[] | string): string {
  return Array.isArray(p) ? p.join(",") : p;
}

function bandwidth(cfg: ConfigReader, key: string): number | undefined {
  const n = cfg.int(key);
  return n !== undefined && n > 0 && n <= 100_000 ? n : undefined;
}

export function createHysteriaAdapter(version: HysteriaVersion): ProtocolAdapter {
  const label = LABELS[version];
  return {
    key: version,
    label,
    description: `${label} account (UDP/QUIC) authenticated by the node agent. Returns a share link with a QR code.`,
    inputGuards: { username: linuxUsernameGuard, password: passwordGuard },
    requiredInputs: ["username"],
    supportsRenew: true,
    outputFields: OUTPUTS[version],
    defaultFields: HYSTERIA_DEFAULT_FIELDS,

    buildSpec(input, ctx) {
      return {
        protocol: ctx.serverProtocol.nodeIdentifier ?? ctx.protocol.slug,
        username: input.username,
        password: input.password,
        durationDays: input.durationDays,
        options: input.options,
      };
    },

    parseAccount(account, ctx, input) {
      const cfg = new ConfigReader(account.config);
      const host = hostOf(cfg, ctx);
      const port = normalizePorts(cfg.get("port")) ?? portsFrom(cfg, ctx.serverProtocol.ports, "udp", version);
      if (port === undefined) throw new AdapterResponseError("Server did not return the port.");
      const username = account.username ?? input.username;
      const remark = cfg.str("remark", 64) ?? username ?? "account";
      const sni = hostValue(cfg, "sni");
      const insecure = yesNo(cfg.get("insecure"));
      const v = new ValuesBuilder()
        .set("host", host)
        .set("ip", hostValue(cfg, "ip") ?? ctx.server.ipAddress)
        .set("port", formatPorts(port))
        .set("sni", sni)
        .set("insecure", insecure);

      let built: string;
      if (version === "hysteria") {
        const auth = cfg.str("auth", 256) ?? cfg.str("password", 256) ?? input.password;
        if (!auth) throw new AdapterResponseError("Server did not return the auth string.");
        const protocol = cfg.str("protocol", 16)?.toLowerCase();
        const obfs = cfg.str("obfs", 32);
        const obfsPassword = cfg.str("obfs_password", 256);
        const alpn = cfg.str("alpn", 64);
        const up = bandwidth(cfg, "up_mbps");
        const down = bandwidth(cfg, "down_mbps");
        v.set("protocol", protocol && /^[a-z0-9-]{2,16}$/.test(protocol) ? protocol : undefined)
          .set("auth", auth, true)
          .set("obfs", obfsPassword ? (obfs ?? "xplus") : undefined)
          .set("obfs_password", obfsPassword, true)
          .set("alpn", alpn)
          .set("up_mbps", up)
          .set("down_mbps", down);
        const params = new URLSearchParams();
        if (protocol) params.set("protocol", protocol);
        params.set("auth", auth);
        if (sni) params.set("peer", sni);
        if (insecure) params.set("insecure", insecure === "Yes" ? "1" : "0");
        params.set("upmbps", String(up ?? DEFAULT_MBPS));
        params.set("downmbps", String(down ?? DEFAULT_MBPS));
        if (alpn) params.set("alpn", alpn);
        if (obfsPassword) {
          params.set("obfs", obfs ?? "xplus");
          params.set("obfsParam", obfsPassword);
        }
        built = `hysteria://${host}:${linkPort(port)}?${params.toString()}#${q(remark)}`;
      } else {
        const password = cfg.str("password", 256) ?? cfg.str("auth", 256) ?? input.password;
        if (!password) throw new AdapterResponseError("Server did not return the password.");
        const obfsObj = cfg.obj("obfs");
        const obfsType = obfsObj.str("type", 32) ?? cfg.str("obfs", 32);
        const obfsPassword = obfsObj.str("password", 256) ?? cfg.str("obfs_password", 256);
        const pin = cfg.str("pin_sha256", 128)?.toLowerCase().replace(/:/g, "");
        const pinOk = pin && /^[0-9a-f]{64}$/.test(pin) ? pin : undefined;
        v.set("password", password, true)
          .set("obfs", obfsType)
          .set("obfs_password", obfsPassword, true)
          .set("pin_sha256", pinOk);
        const params = new URLSearchParams();
        if (sni) params.set("sni", sni);
        if (obfsType && obfsPassword) {
          params.set("obfs", obfsType);
          params.set("obfs-password", obfsPassword);
        }
        if (insecure) params.set("insecure", insecure === "Yes" ? "1" : "0");
        if (pinOk) params.set("pinSHA256", pinOk);
        const query = params.toString();
        built = `hysteria2://${q(password)}@${host}:${linkPort(port)}/${query ? `?${query}` : ""}#${q(remark)}`;
      }

      const uri = validUri(cfg.str("uri", 4096), version) ?? built;
      const artifacts: Artifact[] = [{ key: "link", label: `${label} link`, kind: "uri", content: uri, qr: true, sensitive: true }];
      return {
        remoteAccountId: requireRemoteId(account),
        username,
        expiresAt: resolveExpiry(account, input),
        values: v.values,
        artifacts,
      };
    },
  };
}
