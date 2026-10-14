import type { OutputFieldDefinition } from "@/server/db/schema";
import { getAdapter } from "@/server/provisioning/adapters/registry";
import type { SeedField } from "@/server/provisioning/types";

export interface ProtocolSeed {
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: "ssh" | "v2ray" | "vpn" | "proxy";
  adapterKey: string;
  nodeIdentifiers: string[];
  displayOrder: number;
  durationOptions: number[];
  defaultDurationDays: number;
  fields: SeedField[];
  outputFields: OutputFieldDefinition[];
}

function seed(
  s: Omit<ProtocolSeed, "fields" | "outputFields" | "durationOptions" | "defaultDurationDays"> &
    Partial<Pick<ProtocolSeed, "durationOptions" | "defaultDurationDays">>,
): ProtocolSeed {
  const adapter = getAdapter(s.adapterKey);
  return {
    durationOptions: [3, 7, 14, 30],
    defaultDurationDays: 7,
    ...s,
    fields: adapter.defaultFields,
    outputFields: adapter.outputFields,
  };
}

/**
 * Built-in protocols. `nodeIdentifiers` are the names a server may report for each protocol; they
 * are editable in Admin → Protocols so the website can match whatever the real script reports.
 */
export const PROTOCOL_SEEDS: ProtocolSeed[] = [
  seed({
    slug: "ssh",
    name: "SSH",
    description: "Classic SSH tunnel accounts with OpenSSH and Dropbear ports.",
    icon: "terminal",
    category: "ssh",
    adapterKey: "ssh",
    nodeIdentifiers: ["ssh", "openssh", "ssh-direct", "dropbear"],
    displayOrder: 10,
  }),
  seed({
    slug: "ssh-ssl",
    name: "SSH SSL",
    description: "SSH wrapped in SSL/TLS (stunnel) for networks that only allow HTTPS-like traffic.",
    icon: "lock",
    category: "ssh",
    adapterKey: "ssh-ssl",
    nodeIdentifiers: ["ssh-ssl", "ssh-tls", "ssh-stunnel", "stunnel", "ssl"],
    displayOrder: 20,
  }),
  seed({
    slug: "ssh-websocket",
    name: "SSH WebSocket",
    description: "SSH over WebSocket, with or without TLS, CDN friendly.",
    icon: "globe",
    category: "ssh",
    adapterKey: "ssh-websocket",
    nodeIdentifiers: ["ssh-websocket", "ssh-ws", "websocket", "ws-ssh"],
    displayOrder: 30,
  }),
  seed({
    slug: "slowdns",
    name: "SlowDNS",
    description: "SSH tunnelled through DNS queries (DNSTT).",
    icon: "radar",
    category: "ssh",
    adapterKey: "slowdns",
    nodeIdentifiers: ["slowdns", "dnstt", "ssh-slowdns", "slow-dns"],
    displayOrder: 40,
  }),
  seed({
    slug: "udp-custom",
    name: "UDP Custom",
    description: "UDP Custom tunnel for HTTP Custom and similar apps.",
    icon: "zap",
    category: "ssh",
    adapterKey: "udp-custom",
    nodeIdentifiers: ["udp-custom", "udpcustom", "udp", "ssh-udp"],
    displayOrder: 50,
  }),
  seed({
    slug: "openvpn",
    name: "OpenVPN",
    description: "OpenVPN with downloadable .ovpn client profiles.",
    icon: "shield",
    category: "vpn",
    adapterKey: "openvpn",
    nodeIdentifiers: ["openvpn", "ovpn"],
    displayOrder: 60,
  }),
  seed({
    slug: "wireguard",
    name: "WireGuard",
    description: "Modern, fast VPN with a QR code for mobile clients.",
    icon: "shield-check",
    category: "vpn",
    adapterKey: "wireguard",
    nodeIdentifiers: ["wireguard", "wg"],
    displayOrder: 70,
  }),
  seed({
    slug: "shadowsocks",
    name: "Shadowsocks",
    description: "Lightweight encrypted proxy with share links.",
    icon: "eye-off",
    category: "proxy",
    adapterKey: "shadowsocks",
    nodeIdentifiers: ["shadowsocks", "ss", "shadowsocks-libev", "ss-xray"],
    displayOrder: 80,
  }),
  seed({
    slug: "vmess",
    name: "VMess",
    description: "V2Ray VMess over WebSocket or gRPC, with TLS.",
    icon: "waypoints",
    category: "v2ray",
    adapterKey: "vmess",
    nodeIdentifiers: ["vmess", "xray-vmess", "v2ray-vmess"],
    displayOrder: 90,
  }),
  seed({
    slug: "vless",
    name: "VLESS",
    description: "Lightweight Xray VLESS over WebSocket or gRPC.",
    icon: "route",
    category: "v2ray",
    adapterKey: "vless",
    nodeIdentifiers: ["vless", "xray-vless", "v2ray-vless"],
    displayOrder: 100,
  }),
  seed({
    slug: "trojan",
    name: "Trojan",
    description: "Trojan protocol that blends in with regular HTTPS traffic.",
    icon: "swords",
    category: "v2ray",
    adapterKey: "trojan",
    nodeIdentifiers: ["trojan", "xray-trojan", "trojan-go", "trojan-ws"],
    displayOrder: 110,
  }),
  seed({
    slug: "hysteria",
    name: "Hysteria",
    description: "Hysteria 1: fast UDP tunnel built on QUIC, with share links and QR codes.",
    icon: "rocket",
    category: "proxy",
    adapterKey: "hysteria",
    nodeIdentifiers: ["hysteria", "hysteria1", "hysteria-udp", "hy1"],
    displayOrder: 112,
  }),
  seed({
    slug: "hysteria2",
    name: "Hysteria 2",
    description: "Hysteria 2 over QUIC: high speed on lossy networks, disguised as HTTP/3.",
    icon: "zap",
    category: "proxy",
    adapterKey: "hysteria2",
    nodeIdentifiers: ["hysteria2", "hy2"],
    displayOrder: 114,
  }),
  seed({
    slug: "zivpn",
    name: "ZIVPN UDP",
    description: "UDP tunnel for the ZIVPN app: server, password and port range.",
    icon: "radio",
    category: "vpn",
    adapterKey: "zivpn",
    nodeIdentifiers: ["zivpn", "zivpn-udp", "udp-zivpn"],
    displayOrder: 116,
  }),
  seed({
    slug: "noobzvpn",
    name: "NoobzVPN",
    description: "NoobzVPN accounts with TCP and SSL ports.",
    icon: "rocket",
    category: "vpn",
    adapterKey: "noobzvpn",
    nodeIdentifiers: ["noobzvpn", "noobzvpns", "noobz"],
    displayOrder: 120,
  }),
];
