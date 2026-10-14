/**
 * "How to connect" content for the public protocol pages (/<protocol>#guide) and the highlight
 * bullets on protocol cards. Keyed by protocol family; guideFor() resolves a protocol slug (or, for
 * slugs an admin invented, a keyword in the slug/name) to a family. Links point only to official
 * project pages or official store listings; apps without a link we are sure of are named only.
 * Client-safe: plain data, no imports.
 */

export type Platform = "android" | "ios" | "windows" | "macos" | "linux";

export const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "android", label: "Android" },
  { key: "ios", label: "iPhone & iPad" },
  { key: "windows", label: "Windows" },
  { key: "macos", label: "macOS" },
  { key: "linux", label: "Linux" },
];

export interface ClientApp {
  name: string;
  /** Official download page; omitted when we are not certain of the official link. */
  url?: string;
  note?: string;
}

export interface ProtocolGuide {
  family: GuideFamily;
  /** Short family name shown above the guide ("SSH tunnel"). */
  label: string;
  /** One or two sentences: what the protocol is good for. */
  summary: string;
  /** Four short selling points for cards and the "What is …" panel. */
  highlights: string[];
  /** Practical tips shown next to the highlights. */
  tips: string[];
  apps: Partial<Record<Platform, ClientApp[]>>;
  /** 3–5 short setup steps. */
  steps: string[];
}

export type GuideFamily =
  | "ssh"
  | "ssh-ssl"
  | "ssh-websocket"
  | "slowdns"
  | "udp-custom"
  | "zivpn"
  | "hysteria"
  | "hysteria2"
  | "v2ray"
  | "trojan"
  | "shadowsocks"
  | "wireguard"
  | "openvpn"
  | "noobzvpn"
  | "generic";

// Official links (kept in one place so they are easy to review).
const L = {
  httpCustom: "https://play.google.com/store/apps/details?id=xyz.easypro.httpcustom",
  httpInjector: "https://play.google.com/store/apps/details?id=com.evozi.injector",
  v2rayNG: "https://github.com/2dust/v2rayNG",
  v2rayN: "https://github.com/2dust/v2rayN",
  nekoBox: "https://github.com/MatsuriDayo/NekoBoxForAndroid",
  hiddify: "https://github.com/hiddify/hiddify-app",
  clashVerge: "https://github.com/clash-verge-rev/clash-verge-rev",
  shadowrocket: "https://apps.apple.com/app/shadowrocket/id932747118",
  singBox: "https://sing-box.sagernet.org/",
  hysteria: "https://github.com/apernet/hysteria",
  hysteria2Docs: "https://v2.hysteria.network/",
  wireguard: "https://www.wireguard.com/install/",
  openvpnConnect: "https://openvpn.net/client/",
  tunnelblick: "https://tunnelblick.net/",
  shadowsocks: "https://shadowsocks.org/",
  shadowsocksAndroid: "https://github.com/shadowsocks/shadowsocks-android",
  shadowsocksWindows: "https://github.com/shadowsocks/shadowsocks-windows",
  outline: "https://getoutline.org/",
  bitvise: "https://www.bitvise.com/ssh-client",
  putty: "https://www.chiark.greenend.org.uk/~sgtatham/putty/",
  termius: "https://termius.com/",
  dnstt: "https://www.bamsoftware.com/software/dnstt/",
} as const;

const xrayApps: ProtocolGuide["apps"] = {
  android: [
    { name: "v2rayNG", url: L.v2rayNG },
    { name: "NekoBox", url: L.nekoBox },
    { name: "Hiddify", url: L.hiddify },
  ],
  ios: [{ name: "Shadowrocket", url: L.shadowrocket, note: "Paid" }, { name: "Streisand" }, { name: "V2Box" }],
  windows: [
    { name: "v2rayN", url: L.v2rayN },
    { name: "Hiddify", url: L.hiddify },
    { name: "Clash Verge Rev", url: L.clashVerge },
  ],
  macos: [
    { name: "Hiddify", url: L.hiddify },
    { name: "Clash Verge Rev", url: L.clashVerge },
  ],
  linux: [
    { name: "Hiddify", url: L.hiddify },
    { name: "sing-box", url: L.singBox, note: "Command line" },
  ],
};

const tunnelApps: ProtocolGuide["apps"] = {
  android: [
    { name: "HTTP Custom", url: L.httpCustom },
    { name: "HTTP Injector", url: L.httpInjector },
  ],
  ios: [{ name: "NPV Tunnel" }],
  windows: [
    { name: "Bitvise SSH Client", url: L.bitvise },
    { name: "PuTTY", url: L.putty },
  ],
  macos: [{ name: "Terminal (built-in ssh)", note: "ssh -D 1080 user@host" }, { name: "Termius", url: L.termius }],
  linux: [{ name: "OpenSSH client (built-in)", note: "ssh -D 1080 user@host" }],
};

const GUIDES: Record<GuideFamily, Omit<ProtocolGuide, "family">> = {
  ssh: {
    label: "SSH tunnel",
    summary:
      "A classic encrypted SSH tunnel. Works with OpenSSH, Dropbear and WebSocket ports, so it fits almost any network and the most popular tunnelling apps.",
    highlights: [
      "Encrypted end to end with standard SSH",
      "OpenSSH, Dropbear and WebSocket ports",
      "Works with HTTP Custom, HTTP Injector and more",
      "Username and password, nothing to install on the server side",
    ],
    tips: [
      "Use one account per device: logging in twice disconnects the first session.",
      "If a port is blocked on your network, try another listed port or WebSocket.",
      "Copy the payload exactly as shown, including the [crlf] markers.",
    ],
    apps: tunnelApps,
    steps: [
      "Create an account on a server near you and keep the page open.",
      "Open your tunnelling app and choose SSH (or SSH + WebSocket).",
      "Enter host, port, username and password from your account card.",
      "Paste the payload if your network needs one, then connect.",
    ],
  },
  "ssh-ssl": {
    label: "SSH over SSL/TLS",
    summary:
      "SSH wrapped in a TLS layer (stunnel) with an optional HTTP payload and SNI, so the connection looks like ordinary HTTPS traffic.",
    highlights: [
      "SSH inside TLS, looks like regular HTTPS",
      "Custom SNI and HTTP payload support",
      "Ideal for networks that only allow port 443",
      "Works with HTTP Custom and HTTP Injector",
    ],
    tips: [
      "Set the SNI to the server host unless you know a host your network allows.",
      "Keep the [crlf] markers in the payload: the app converts them to line breaks.",
      "One device per account; a second login drops the first.",
    ],
    apps: tunnelApps,
    steps: [
      "Create an account and copy the host, SSL port, username and password.",
      "In your app choose SSH + SSL/TLS (stunnel) mode.",
      "Enter the SNI and, if needed, the payload from your account card.",
      "Save the profile and tap connect.",
    ],
  },
  "ssh-websocket": {
    label: "SSH over WebSocket",
    summary: "SSH carried inside a WebSocket connection, with or without TLS. Friendly to CDNs and HTTP proxies.",
    highlights: [
      "SSH inside WebSocket, plain or TLS",
      "Passes through CDNs and HTTP proxies",
      "Custom payloads for restrictive networks",
      "Works with popular tunnelling apps",
    ],
    tips: [
      "Use port 80 for plain WebSocket and 443 for WebSocket over TLS.",
      "The payload must include the Upgrade: websocket header.",
      "One device per account.",
    ],
    apps: tunnelApps,
    steps: [
      "Create an account and note the WebSocket ports.",
      "In your app choose SSH + WebSocket (or SSH + WS + SSL for port 443).",
      "Enter host, port, username, password and the payload.",
      "Connect and check the log for a successful handshake.",
    ],
  },
  slowdns: {
    label: "SlowDNS (DNSTT)",
    summary:
      "SSH tunnelled through DNS queries with DNSTT. Slower than direct SSH, but it can work where only DNS traffic gets through.",
    highlights: [
      "Tunnels SSH through DNS queries",
      "Can work where other ports are blocked",
      "Encrypted with the server's DNSTT public key",
      "Supported by HTTP Custom and DNSTT clients",
    ],
    tips: [
      "Expect lower speeds than direct SSH: DNS packets are small.",
      "Copy the nameserver and public key exactly; one wrong character breaks the tunnel.",
      "Try a different DNS resolver in the app if the connection stalls.",
    ],
    apps: {
      android: [{ name: "HTTP Custom", url: L.httpCustom, note: "SlowDNS mode" }],
      ios: [{ name: "NPV Tunnel" }],
      windows: [{ name: "dnstt-client", url: L.dnstt, note: "Command line" }],
      macos: [{ name: "dnstt-client", url: L.dnstt, note: "Command line" }],
      linux: [{ name: "dnstt-client", url: L.dnstt, note: "Command line" }],
    },
    steps: [
      "Create an account and copy the nameserver (NS) and public key.",
      "In your app choose SlowDNS / DNSTT mode.",
      "Enter the nameserver, public key, username and password.",
      "Pick a DNS resolver (for example your network's own) and connect.",
    ],
  },
  "udp-custom": {
    label: "UDP Custom",
    summary: "An SSH account used over a custom UDP transport, popular for gaming and calls on mobile networks.",
    highlights: [
      "Low-latency UDP transport",
      "Good for games, voice and video calls",
      "Wide UDP port range",
      "Supported by HTTP Custom",
    ],
    tips: ["Use the exact UDP port range shown on the server card.", "One device per account."],
    apps: { android: [{ name: "HTTP Custom", url: L.httpCustom, note: "UDP Custom mode" }] },
    steps: [
      "Create an account and copy host, UDP ports, username and password.",
      "In HTTP Custom enable UDP Custom.",
      "Enter the account as host:ports@username:password.",
      "Connect.",
    ],
  },
  zivpn: {
    label: "ZIVPN UDP",
    summary: "A fast UDP tunnel for the ZIVPN app. You only need the server address, your password and the UDP port range.",
    highlights: [
      "Fast UDP tunnel",
      "Simple setup: address, password, port range",
      "Good for mobile data and gaming",
      "Obfuscated traffic",
    ],
    tips: ["Use the full UDP port range shown on the card.", "If the app asks for obfs, use the value from your account."],
    apps: { android: [{ name: "ZIVPN Tunnel" }] },
    steps: [
      "Create an account and copy the server address and password.",
      "Open the ZIVPN app and add a new server.",
      "Enter address, password and UDP port range.",
      "Save and connect.",
    ],
  },
  hysteria: {
    label: "Hysteria",
    summary: "Hysteria 1: a QUIC-based proxy tuned for lossy, high-latency networks. Fast where TCP tunnels struggle.",
    highlights: [
      "QUIC-based, fast on unstable networks",
      "Congestion control tuned for packet loss",
      "Optional obfuscation",
      "Share link for one-tap import",
    ],
    tips: ["Set realistic upload and download speeds in the app.", "Import the share link instead of typing values by hand."],
    apps: {
      android: [{ name: "NekoBox", url: L.nekoBox }],
      ios: [{ name: "Shadowrocket", url: L.shadowrocket, note: "Paid" }],
      windows: [{ name: "Hysteria client", url: L.hysteria, note: "Official, command line" }],
      macos: [{ name: "Hysteria client", url: L.hysteria, note: "Official, command line" }],
      linux: [{ name: "Hysteria client", url: L.hysteria, note: "Official, command line" }],
    },
    steps: [
      "Create an account and copy the hysteria:// link (or scan its QR code).",
      "Import it in your app from the clipboard or QR scanner.",
      "Adjust upload/download speeds to match your connection.",
      "Connect.",
    ],
  },
  hysteria2: {
    label: "Hysteria 2",
    summary: "Hysteria 2 runs over QUIC and masquerades as HTTP/3. Very fast, especially on mobile and long-distance links.",
    highlights: [
      "QUIC / HTTP/3 transport",
      "Excellent speed on lossy networks",
      "Salamander obfuscation support",
      "One-tap import with a share link",
    ],
    tips: ["Import the hysteria2:// link or scan its QR code.", "If UDP is blocked on your network, use a TCP protocol instead."],
    apps: {
      android: [
        { name: "NekoBox", url: L.nekoBox },
        { name: "Hiddify", url: L.hiddify },
        { name: "v2rayNG", url: L.v2rayNG },
      ],
      ios: [{ name: "Shadowrocket", url: L.shadowrocket, note: "Paid" }, { name: "Streisand" }],
      windows: [
        { name: "v2rayN", url: L.v2rayN },
        { name: "Hiddify", url: L.hiddify },
      ],
      macos: [{ name: "Hiddify", url: L.hiddify }],
      linux: [
        { name: "Hysteria 2 client", url: L.hysteria2Docs, note: "Official" },
        { name: "Hiddify", url: L.hiddify },
      ],
    },
    steps: [
      "Create an account and copy the hysteria2:// link.",
      "Import it from the clipboard or scan the QR code.",
      "Connect and allow the VPN permission prompt.",
    ],
  },
  v2ray: {
    label: "V2Ray / Xray",
    summary:
      "VMess and VLESS run on Xray with WebSocket, gRPC and TLS transports. Flexible, fast and supported by many free apps on every platform.",
    highlights: [
      "WebSocket, gRPC and TLS transports",
      "Works behind CDNs with a custom SNI / bug host",
      "Share links and QR codes for one-tap import",
      "Free apps on every platform",
    ],
    tips: [
      "VLESS is lighter than VMess; both are equally easy to set up.",
      "Use the TLS link (port 443) unless your network needs plain WebSocket.",
      "Add a bug host as SNI only if you know your network allows it.",
    ],
    apps: xrayApps,
    steps: [
      "Create an account and pick the connection you want (WS TLS, WS or gRPC).",
      "Copy its share link or scan the QR code.",
      "In your app choose Import from clipboard (or scan QR).",
      "Select the new profile and connect.",
    ],
  },
  trojan: {
    label: "Trojan",
    summary: "Trojan imitates normal HTTPS traffic, which makes it hard to tell apart from regular browsing. Runs on Xray with TLS.",
    highlights: [
      "Looks like ordinary HTTPS traffic",
      "TLS on port 443 with WebSocket or gRPC",
      "Custom SNI / bug host",
      "Share links and QR codes",
    ],
    tips: ["Keep the SNI equal to the server host unless you use a bug host.", "Import the trojan:// link instead of typing it."],
    apps: xrayApps,
    steps: [
      "Create an account and copy the trojan:// link.",
      "Import it in your app from the clipboard or QR code.",
      "Connect and check that the status turns green.",
    ],
  },
  shadowsocks: {
    label: "Shadowsocks",
    summary: "A lightweight encrypted proxy. Simple to set up, light on battery and supported by many open-source clients.",
    highlights: ["Lightweight and fast", "Modern AEAD ciphers", "ss:// share links and QR codes", "Open-source clients everywhere"],
    tips: ["Import the ss:// link; the cipher and password come with it.", "Outline also opens ss:// links."],
    apps: {
      android: [
        { name: "Shadowsocks for Android", url: L.shadowsocksAndroid },
        { name: "Outline", url: L.outline },
      ],
      ios: [
        { name: "Outline", url: L.outline },
        { name: "Shadowrocket", url: L.shadowrocket, note: "Paid" },
      ],
      windows: [
        { name: "Shadowsocks for Windows", url: L.shadowsocksWindows },
        { name: "Outline", url: L.outline },
      ],
      macos: [{ name: "Outline", url: L.outline }],
      linux: [{ name: "Outline", url: L.outline }, { name: "Shadowsocks clients", url: L.shadowsocks }],
    },
    steps: ["Create an account and copy the ss:// link.", "Open your client and add a server from the clipboard or QR code.", "Connect."],
  },
  wireguard: {
    label: "WireGuard",
    summary: "A modern, minimal VPN protocol with state-of-the-art cryptography. Fast to connect and easy on the battery.",
    highlights: ["Modern, audited cryptography", "Very fast handshakes", "Config file or QR code", "Official apps for every platform"],
    tips: ["Scan the QR code on mobile; import the .conf file on desktop.", "Each config works on one device at a time."],
    apps: {
      android: [{ name: "WireGuard", url: L.wireguard }],
      ios: [{ name: "WireGuard", url: L.wireguard }],
      windows: [{ name: "WireGuard", url: L.wireguard }],
      macos: [{ name: "WireGuard", url: L.wireguard }],
      linux: [{ name: "wireguard-tools", url: L.wireguard }],
    },
    steps: [
      "Create an account and download the .conf file (or keep the QR code on screen).",
      "In the WireGuard app tap + and import the file or scan the QR code.",
      "Activate the tunnel.",
    ],
  },
  openvpn: {
    label: "OpenVPN",
    summary: "The long-standing open-source VPN. Import the .ovpn profile and connect over TCP or UDP.",
    highlights: ["Battle-tested open-source VPN", "TCP and UDP modes", "One .ovpn profile file", "Clients for every platform"],
    tips: ["Try the TCP profile if UDP is blocked.", "Keep your username and password ready if the profile asks for them."],
    apps: {
      android: [{ name: "OpenVPN Connect", url: L.openvpnConnect }],
      ios: [{ name: "OpenVPN Connect", url: L.openvpnConnect }],
      windows: [{ name: "OpenVPN Connect", url: L.openvpnConnect }],
      macos: [
        { name: "OpenVPN Connect", url: L.openvpnConnect },
        { name: "Tunnelblick", url: L.tunnelblick },
      ],
      linux: [{ name: "openvpn (package manager)", note: "sudo openvpn --config file.ovpn" }],
    },
    steps: ["Create an account and download the .ovpn file.", "Import it in OpenVPN Connect.", "Enter your username and password if asked, then connect."],
  },
  noobzvpn: {
    label: "NoobzVPN",
    summary: "A lightweight tunnel with TCP and SSL ports, set up with a username and password in the NoobzVPN app.",
    highlights: ["Simple username and password", "TCP and SSL ports", "Light on data", "Quick to set up"],
    tips: ["Use the SSL port on networks that only allow HTTPS."],
    apps: { android: [{ name: "NoobzVPN app" }] },
    steps: ["Create an account and copy host, port, username and password.", "Add a new server in the NoobzVPN app.", "Connect."],
  },
  generic: {
    label: "VPN account",
    summary: "Create an account, then import the details into a compatible client app.",
    highlights: ["Created on the server in seconds", "Shown once, never stored", "Copy buttons, QR codes and files", "Free apps for every platform"],
    tips: ["Save your details right after creating the account: they are shown only once."],
    apps: {},
    steps: [
      "Pick a server and create your account.",
      "Copy the details, scan the QR code or download the file.",
      "Import them into a compatible app and connect.",
    ],
  },
};

const SLUG_FAMILY: Record<string, GuideFamily> = {
  ssh: "ssh",
  "ssh-dropbear": "ssh",
  dropbear: "ssh",
  "ssh-ssl": "ssh-ssl",
  "ssh-tls": "ssh-ssl",
  stunnel: "ssh-ssl",
  "ssh-websocket": "ssh-websocket",
  "ssh-ws": "ssh-websocket",
  sshws: "ssh-websocket",
  slowdns: "slowdns",
  "ssh-dnstt": "slowdns",
  dnstt: "slowdns",
  "udp-custom": "udp-custom",
  "ssh-udp": "udp-custom",
  zivpn: "zivpn",
  hysteria: "hysteria",
  hysteria2: "hysteria2",
  vmess: "v2ray",
  vless: "v2ray",
  trojan: "trojan",
  trojanvpn: "trojan",
  shadowsocks: "shadowsocks",
  wireguard: "wireguard",
  openvpn: "openvpn",
  noobzvpn: "noobzvpn",
};

/** Ordered keyword fallbacks for slugs an admin created (first match wins). */
const KEYWORDS: [RegExp, GuideFamily][] = [
  [/hysteria\s*-?2|hy2/i, "hysteria2"],
  [/hysteria/i, "hysteria"],
  [/zivpn/i, "zivpn"],
  [/slow\s*-?dns|dnstt/i, "slowdns"],
  [/udp/i, "udp-custom"],
  [/ssl|tls|stunnel/i, "ssh-ssl"],
  [/websocket|\bws\b/i, "ssh-websocket"],
  [/vmess|vless|v2ray|xray/i, "v2ray"],
  [/trojan/i, "trojan"],
  [/shadowsocks|\bss\b/i, "shadowsocks"],
  [/wireguard|\bwg\b/i, "wireguard"],
  [/openvpn|ovpn/i, "openvpn"],
  [/noobz/i, "noobzvpn"],
  [/ssh|dropbear/i, "ssh"],
];

export function guideFamily(slug: string, name = ""): GuideFamily {
  const direct = SLUG_FAMILY[slug.toLowerCase()];
  if (direct) return direct;
  const text = `${slug} ${name}`;
  return KEYWORDS.find(([re]) => re.test(text))?.[1] ?? "generic";
}

/** Guide for a protocol slug (with its display name as an extra hint). */
export function guideFor(slug: string, name = ""): ProtocolGuide {
  const family = guideFamily(slug, name);
  return { family, ...GUIDES[family] };
}
