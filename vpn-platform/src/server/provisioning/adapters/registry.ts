import type { ProtocolAdapter } from "../types";
import { genericAdapter } from "./generic";
import { noobzvpnAdapter } from "./noobzvpn";
import { openvpnAdapter } from "./openvpn";
import { shadowsocksAdapter } from "./shadowsocks";
import { createSshAdapter } from "./ssh";
import { createV2rayAdapter } from "./v2ray";
import { wireguardAdapter } from "./wireguard";

/**
 * Protocol adapter registry. `protocols.adapter_key` selects the adapter.
 * A new protocol either reuses an adapter (e.g. "generic") or registers a new one here.
 */
const adapters: ProtocolAdapter[] = [
  createSshAdapter("ssh"),
  createSshAdapter("ssh-ssl"),
  createSshAdapter("ssh-websocket"),
  createSshAdapter("slowdns"),
  createSshAdapter("udp-custom"),
  openvpnAdapter,
  wireguardAdapter,
  shadowsocksAdapter,
  createV2rayAdapter("vmess"),
  createV2rayAdapter("vless"),
  createV2rayAdapter("trojan"),
  noobzvpnAdapter,
  genericAdapter,
];

const byKey = new Map(adapters.map((a) => [a.key, a]));

export function getAdapter(key: string): ProtocolAdapter {
  const a = byKey.get(key);
  if (!a) throw new Error(`No protocol adapter registered for "${key}"`);
  return a;
}

export function hasAdapter(key: string) {
  return byKey.has(key);
}

export function listAdapters(): Pick<ProtocolAdapter, "key" | "label" | "description" | "supportsRenew" | "requiredInputs">[] {
  return adapters.map(({ key, label, description, supportsRenew, requiredInputs }) => ({
    key,
    label,
    description,
    supportsRenew,
    requiredInputs,
  }));
}
