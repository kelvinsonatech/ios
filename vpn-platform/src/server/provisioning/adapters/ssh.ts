import type { OutputFieldDefinition } from "@/server/db/schema";
import type { ProtocolAdapter, SeedField } from "../types";
import {
  AdapterResponseError,
  ConfigReader,
  formatPorts,
  hostOf,
  hostValue,
  portsFrom,
  requireRemoteId,
  resolveExpiry,
  ValuesBuilder,
} from "./base";
import { linuxUsernameGuard, passwordGuard } from "./guards";

/**
 * SSH-family adapter. SSH, SSH SSL, SSH WebSocket, SlowDNS and UDP Custom all provision a system
 * account on the node; they differ in which connection details are emphasised.
 *
 * Expected `config` from the node (docs/10-script-api-prompt.md section 8):
 * {
 *   host, ip?, username?, password?,
 *   ports?: { openssh, dropbear, ssl, ws, ws_tls, udp_custom, slowdns },   // number[] or "1-65535"
 *   sni?: string                                                         // ssh-ssl
 *   slowdns?: { nameserver, public_key },
 *   payload?: string,                                                    // HTTP payload template
 *   payloads?: [{ name, value }]                                         // several templates
 * }
 * Missing ports fall back to the ports the node advertised during capability detection.
 * Payloads keep the script's own tokens ([crlf], [host], ...) because the client apps expand them.
 */
export type SshVariant = "ssh" | "ssh-ssl" | "ssh-websocket" | "slowdns" | "udp-custom";

const ALL_OUTPUTS: OutputFieldDefinition[] = [
  { key: "host", label: "Host", kind: "text", sensitive: false, copyable: true },
  { key: "ip", label: "IP address", kind: "text", sensitive: false, copyable: true },
  { key: "username", label: "Username", kind: "text", sensitive: false, copyable: true },
  { key: "password", label: "Password", kind: "secret", sensitive: true, copyable: true },
  { key: "openssh_ports", label: "SSH port", kind: "text", sensitive: false, copyable: true },
  { key: "dropbear_ports", label: "Dropbear port", kind: "text", sensitive: false, copyable: true },
  { key: "ssl_ports", label: "SSL/TLS port", kind: "text", sensitive: false, copyable: true },
  { key: "ws_ports", label: "WebSocket port", kind: "text", sensitive: false, copyable: true },
  { key: "ws_tls_ports", label: "WebSocket TLS port", kind: "text", sensitive: false, copyable: true },
  { key: "udp_custom_ports", label: "UDP port range", kind: "text", sensitive: false, copyable: true },
  { key: "slowdns_ports", label: "SlowDNS port", kind: "text", sensitive: false, copyable: true },
  { key: "slowdns_nameserver", label: "SlowDNS nameserver", kind: "text", sensitive: false, copyable: true },
  { key: "slowdns_public_key", label: "SlowDNS public key", kind: "text", sensitive: false, copyable: true },
  { key: "sni", label: "SNI", kind: "text", sensitive: false, copyable: true },
  { key: "payload", label: "Payload", kind: "multiline", sensitive: false, copyable: true },
  { key: "udp_custom_config", label: "UDP Custom config", kind: "secret", sensitive: true, copyable: true },
];

const VISIBLE: Record<SshVariant, string[]> = {
  ssh: [
    "host", "ip", "username", "password", "openssh_ports", "dropbear_ports", "ssl_ports", "ws_ports",
    "ws_tls_ports", "udp_custom_ports", "slowdns_nameserver", "slowdns_public_key", "payload",
  ],
  "ssh-ssl": ["host", "ip", "username", "password", "ssl_ports", "ws_tls_ports", "sni", "payload"],
  "ssh-websocket": ["host", "ip", "username", "password", "ws_ports", "ws_tls_ports", "payload"],
  slowdns: ["host", "ip", "username", "password", "slowdns_nameserver", "slowdns_public_key", "slowdns_ports", "openssh_ports", "payload"],
  "udp-custom": ["host", "ip", "username", "password", "udp_custom_ports", "udp_custom_config", "payload"],
};

/** Output keys added after the first release; seedProtocols() appends them to existing protocols. */
export const SSH_UPGRADE_OUTPUTS = ["sni", "payload"];

/** One payload, or several as "Name:" blocks separated by a blank line. */
function readPayload(cfg: ConfigReader): string | undefined {
  const blocks: string[] = [];
  for (const raw of cfg.array("payloads")) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = new ConfigReader(raw as Record<string, unknown>);
    const value = r.text("value", 2048)?.trim();
    if (!value) continue;
    const name = r.str("name", 48);
    blocks.push(name ? `${name}:\n${value}` : value);
  }
  if (blocks.length) return blocks.slice(0, 8).join("\n\n");
  return cfg.text("payload", 2048)?.trim() || undefined;
}

const LABELS: Record<SshVariant, string> = {
  ssh: "SSH",
  "ssh-ssl": "SSH over SSL/TLS",
  "ssh-websocket": "SSH over WebSocket",
  slowdns: "SSH over SlowDNS",
  "udp-custom": "UDP Custom",
};

export const SSH_DEFAULT_FIELDS: SeedField[] = [
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
    required: true,
    placeholder: "6–32 characters",
    helpText: null,
    options: [],
    validation: { minLength: 6, maxLength: 32 },
  },
  { key: "duration", label: "Duration", type: "duration", required: true, options: [], validation: {} },
];

export function createSshAdapter(variant: SshVariant): ProtocolAdapter {
  const visible = new Set(VISIBLE[variant]);
  return {
    key: variant,
    label: LABELS[variant],
    description: "Creates a system account on the node; output emphasises the " + LABELS[variant] + " connection details.",
    inputGuards: { username: linuxUsernameGuard, password: passwordGuard },
    requiredInputs: ["username", "password"],
    supportsRenew: true,
    outputFields: ALL_OUTPUTS.map((f) => ({ ...f, hidden: !visible.has(f.key) })),
    defaultFields: SSH_DEFAULT_FIELDS,

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
      const username = cfg.str("username", 64) ?? account.username ?? input.username;
      if (!username) throw new AdapterResponseError("Server did not return a username.");
      const password = cfg.str("password", 128) ?? input.password;
      const host = hostOf(cfg, ctx);
      const ports = ctx.serverProtocol.ports;
      const udp = portsFrom(cfg, ports, "udp_custom", "udp");

      const v = new ValuesBuilder()
        .set("host", host)
        .set("ip", hostValue(cfg, "ip") ?? ctx.server.ipAddress)
        .set("username", username)
        .set("password", password, true)
        .set("openssh_ports", formatPorts(portsFrom(cfg, ports, "openssh", "ssh")))
        .set("dropbear_ports", formatPorts(portsFrom(cfg, ports, "dropbear")))
        .set("ssl_ports", formatPorts(portsFrom(cfg, ports, "ssl", "stunnel", "tls")))
        .set("ws_ports", formatPorts(portsFrom(cfg, ports, "ws", "websocket")))
        .set("ws_tls_ports", formatPorts(portsFrom(cfg, ports, "ws_tls", "wss")))
        .set("udp_custom_ports", formatPorts(udp))
        .set("slowdns_ports", formatPorts(portsFrom(cfg, ports, "slowdns", "dns")))
        .set("slowdns_nameserver", hostValue(cfg, "slowdns.nameserver"))
        .set("slowdns_public_key", cfg.str("slowdns.public_key", 256))
        .set("sni", hostValue(cfg, "sni"))
        .set("payload", readPayload(cfg));

      if (variant === "udp-custom" && password && udp !== undefined) {
        const range = Array.isArray(udp) ? udp.join(",") : udp;
        v.set("udp_custom_config", `${host}:${range}@${username}:${password}`, true);
      }

      return {
        remoteAccountId: requireRemoteId(account),
        username,
        expiresAt: resolveExpiry(account, input),
        values: v.values,
        artifacts: [],
      };
    },
  };
}
