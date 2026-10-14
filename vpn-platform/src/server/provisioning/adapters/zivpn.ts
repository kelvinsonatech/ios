import type { OutputFieldDefinition } from "@/server/db/schema";
import type { ProtocolAdapter } from "../types";
import { AdapterResponseError, ConfigReader, formatPorts, hostOf, hostValue, portsFrom, requireRemoteId, resolveExpiry, ValuesBuilder } from "./base";
import { HYSTERIA_DEFAULT_FIELDS } from "./hysteria";
import { linuxUsernameGuard, passwordGuard } from "./guards";

/**
 * ZIVPN UDP (a Hysteria-based tunnel used by the ZIVPN app). The app needs the server address, the
 * account's password and the UDP port range; there is no share-link format.
 *
 * Expected `config` (docs/10-script-api-prompt.md section 8):
 *   { host, ip?, password, ports: { udp: "6000-19999" }, obfs? }
 */
const OUTPUTS: OutputFieldDefinition[] = [
  { key: "host", label: "Server", kind: "text", sensitive: false, copyable: true },
  { key: "ip", label: "IP address", kind: "text", sensitive: false, copyable: true, hidden: true },
  { key: "password", label: "Password", kind: "secret", sensitive: true, copyable: true },
  { key: "udp_ports", label: "UDP port range", kind: "text", sensitive: false, copyable: true },
  { key: "obfs", label: "Obfuscation", kind: "text", sensitive: false, copyable: true },
];

export const zivpnAdapter: ProtocolAdapter = {
  key: "zivpn",
  label: "ZIVPN UDP",
  description: "ZIVPN UDP account for the ZIVPN app: server address, password and UDP port range.",
  inputGuards: { username: linuxUsernameGuard, password: passwordGuard },
  requiredInputs: ["username"],
  supportsRenew: true,
  outputFields: OUTPUTS,
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
    const password = cfg.str("password", 256) ?? input.password;
    if (!password) throw new AdapterResponseError("Server did not return the password.");
    const obfs = cfg.str("obfs", 64);
    const v = new ValuesBuilder()
      .set("host", hostOf(cfg, ctx))
      .set("ip", hostValue(cfg, "ip") ?? ctx.server.ipAddress)
      .set("password", password, true)
      .set("udp_ports", formatPorts(portsFrom(cfg, ctx.serverProtocol.ports, "udp", "zivpn")))
      .set("obfs", obfs && /^[A-Za-z0-9_.-]{1,64}$/.test(obfs) ? obfs : undefined);
    return {
      remoteAccountId: requireRemoteId(account),
      username: account.username ?? input.username,
      expiresAt: resolveExpiry(account, input),
      values: v.values,
      artifacts: [],
    };
  },
};
