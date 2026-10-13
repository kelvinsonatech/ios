import type { ProtocolAdapter } from "../types";
import { SSH_DEFAULT_FIELDS } from "./ssh";
import { ConfigReader, formatPorts, hostOf, portsFrom, requireRemoteId, resolveExpiry, ValuesBuilder } from "./base";
import { linuxUsernameGuard, passwordGuard } from "./guards";

/** NoobzVPN. Expected `config`: { host, username?, password?, ports?: { tcp, ssl } }. */
export const noobzvpnAdapter: ProtocolAdapter = {
  key: "noobzvpn",
  label: "NoobzVPN",
  description: "NoobzVPN account (username/password with TCP and SSL ports).",
  inputGuards: { username: linuxUsernameGuard, password: passwordGuard },
  requiredInputs: ["username", "password"],
  supportsRenew: true,
  outputFields: [
    { key: "host", label: "Host", kind: "text", sensitive: false, copyable: true },
    { key: "username", label: "Username", kind: "text", sensitive: false, copyable: true },
    { key: "password", label: "Password", kind: "secret", sensitive: true, copyable: true },
    { key: "tcp_ports", label: "TCP port", kind: "text", sensitive: false, copyable: true },
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
    const ports = ctx.serverProtocol.ports;
    const v = new ValuesBuilder()
      .set("host", hostOf(cfg, ctx))
      .set("username", cfg.str("username", 64) ?? account.username ?? input.username)
      .set("password", cfg.str("password", 128) ?? input.password, true)
      .set("tcp_ports", formatPorts(portsFrom(cfg, ports, "tcp")))
      .set("ssl_ports", formatPorts(portsFrom(cfg, ports, "ssl", "tls")));
    return {
      remoteAccountId: requireRemoteId(account),
      username: account.username ?? input.username,
      expiresAt: resolveExpiry(account, input),
      values: v.values,
      artifacts: [],
    };
  },
};
