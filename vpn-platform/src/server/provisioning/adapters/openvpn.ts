import type { Artifact, ProtocolAdapter } from "../types";
import { SSH_DEFAULT_FIELDS } from "./ssh";
import {
  AdapterResponseError,
  ConfigReader,
  fileArtifact,
  formatPorts,
  hostOf,
  portsFrom,
  requireRemoteId,
  resolveExpiry,
  ValuesBuilder,
} from "./base";
import { linuxUsernameGuard, passwordGuard } from "./guards";

/**
 * OpenVPN. The node generates the client configuration(s).
 * Expected `config`:
 * { host, username?, password?, ports?: { tcp, udp, ssl, ws },
 *   configs?: [{ name, filename, content }] | ovpn?: "client\n..." }
 */
function validOvpn(text: string | undefined): text is string {
  return !!text && /^\s*client\b/m.test(text) && /^\s*remote\s+\S+/m.test(text);
}

export const openvpnAdapter: ProtocolAdapter = {
  key: "openvpn",
  label: "OpenVPN",
  description: "OpenVPN account with downloadable .ovpn client configuration(s).",
  inputGuards: { username: linuxUsernameGuard, password: passwordGuard },
  requiredInputs: ["username", "password"],
  supportsRenew: true,
  outputFields: [
    { key: "host", label: "Host", kind: "text", sensitive: false, copyable: true },
    { key: "username", label: "Username", kind: "text", sensitive: false, copyable: true },
    { key: "password", label: "Password", kind: "secret", sensitive: true, copyable: true },
    { key: "tcp_ports", label: "TCP port", kind: "text", sensitive: false, copyable: true },
    { key: "udp_ports", label: "UDP port", kind: "text", sensitive: false, copyable: true },
    { key: "ssl_ports", label: "SSL port", kind: "text", sensitive: false, copyable: true },
  ],
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
    const artifacts: Artifact[] = [];
    for (const raw of cfg.array("configs")) {
      const c = new ConfigReader((raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>);
      const content = c.text("content", 65_536);
      if (!validOvpn(content)) continue;
      const name = c.str("name", 32) ?? `config-${artifacts.length + 1}`;
      artifacts.push(
        fileArtifact({
          key: `ovpn_${artifacts.length + 1}`,
          label: `OpenVPN ${name.toUpperCase()}`,
          content,
          filename: c.str("filename", 64) ?? `${ctx.server.name}-${name}.ovpn`,
          mimeType: "application/x-openvpn-profile",
          qr: false,
          sensitive: true,
        }),
      );
    }
    const single = cfg.text("ovpn", 65_536);
    if (artifacts.length === 0 && validOvpn(single)) {
      artifacts.push(
        fileArtifact({
          key: "ovpn_1",
          label: "OpenVPN configuration",
          content: single,
          filename: `${ctx.server.name}.ovpn`,
          mimeType: "application/x-openvpn-profile",
          qr: false,
          sensitive: true,
        }),
      );
    }
    if (artifacts.length === 0) throw new AdapterResponseError("Server did not return an OpenVPN configuration.");

    const ports = ctx.serverProtocol.ports;
    const v = new ValuesBuilder()
      .set("host", hostOf(cfg, ctx))
      .set("username", cfg.str("username", 64) ?? account.username ?? input.username)
      .set("password", cfg.str("password", 128) ?? input.password, true)
      .set("tcp_ports", formatPorts(portsFrom(cfg, ports, "tcp")))
      .set("udp_ports", formatPorts(portsFrom(cfg, ports, "udp")))
      .set("ssl_ports", formatPorts(portsFrom(cfg, ports, "ssl")));

    return {
      remoteAccountId: requireRemoteId(account),
      username: account.username ?? input.username,
      expiresAt: resolveExpiry(account, input),
      values: v.values,
      artifacts,
    };
  },
};
