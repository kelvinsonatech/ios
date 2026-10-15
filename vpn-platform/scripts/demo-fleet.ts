/**
 * The demo fleet shared by `npm run demo:nodes` (mock nodes) and `npm run demo:seed` (database).
 * Development only: every node is an in-memory MOCK on 127.0.0.1 (ports 8451–8460) that runs no
 * system commands. Several demo servers may share one mock process; each signs with its own key id
 * and the mock answers with that server's hostname (MockNodeOptions.virtualHosts).
 */
import { OWNER_PROTOCOLS } from "../mock-node/mock-node";

/** Same secret for every demo node (dev only). Override with MOCK_NODE_SECRET (16+ characters). */
export const DEMO_SECRET =
  process.env.MOCK_NODE_SECRET && process.env.MOCK_NODE_SECRET.length >= 16 ? process.env.MOCK_NODE_SECRET : "vaultline-demo-node-secret-0001";

/** Written into servers.notes; demo:seed only ever updates servers carrying it. */
export const DEMO_MARKER = "Demo server created by npm run demo:seed (mock node, development only).";

/** A port nothing listens on: the "offline" demo server points here after it was published. */
export const DEMO_CLOSED_PORT = 8450;

export interface DemoHost {
  /** HMAC key id this server signs with (unique per server). */
  keyId: string;
  name: string;
  slug: string;
  countryCode: string;
  city: string;
  region: string;
  hostname: string;
  maxAccounts: number;
  /** online (default), maintenance (admin switch) or offline (moved to DEMO_CLOSED_PORT after publishing). */
  state?: "online" | "maintenance" | "offline";
}

export interface DemoNode {
  port: number;
  /** Artificial round-trip delay (± 20 % jitter), so the status page shows realistic latencies. */
  latencyMs: number;
  protocols: string[];
  /** Installed but stopped services (shown as "service stopped" publicly). */
  stopped?: string[];
  hosts: DemoHost[];
}

const ALL = OWNER_PROTOCOLS;

export const DEMO_FLEET: DemoNode[] = [
  {
    port: 8451,
    latencyMs: 160,
    protocols: ALL,
    hosts: [
      { keyId: "demo-de1", name: "Germany 01", slug: "de1", countryCode: "DE", city: "Frankfurt", region: "Europe", hostname: "de1.vaultline.test", maxAccounts: 500 },
      {
        keyId: "demo-de2",
        name: "Germany 02",
        slug: "de2",
        countryCode: "DE",
        city: "Nuremberg",
        region: "Europe",
        hostname: "de2.vaultline.test",
        maxAccounts: 300,
        state: "maintenance",
      },
    ],
  },
  {
    port: 8452,
    latencyMs: 165,
    protocols: ["ssh", "ssh-ssl", "slowdns", "vmess", "vless", "trojan", "hysteria2"],
    hosts: [{ keyId: "demo-nl1", name: "Netherlands 01", slug: "nl1", countryCode: "NL", city: "Amsterdam", region: "Europe", hostname: "nl1.vaultline.test", maxAccounts: 500 }],
  },
  {
    port: 8453,
    latencyMs: 170,
    protocols: ["ssh", "ssh-ssl", "vless", "trojan", "hysteria", "hysteria2", "zivpn"],
    stopped: ["hysteria"],
    hosts: [{ keyId: "demo-fr1", name: "France 01", slug: "fr1", countryCode: "FR", city: "Paris", region: "Europe", hostname: "fr1.vaultline.test", maxAccounts: 400 }],
  },
  {
    port: 8454,
    latencyMs: 190,
    protocols: ["ssh", "ssh-ssl", "slowdns", "vmess", "vless", "hysteria2", "zivpn"],
    hosts: [
      { keyId: "demo-fi1", name: "Finland 01", slug: "fi1", countryCode: "FI", city: "Helsinki", region: "Europe", hostname: "fi1.vaultline.test", maxAccounts: 400 },
      { keyId: "demo-se1", name: "Sweden 01", slug: "se1", countryCode: "SE", city: "Stockholm", region: "Europe", hostname: "se1.vaultline.test", maxAccounts: 400 },
    ],
  },
  {
    port: 8455,
    latencyMs: 175,
    protocols: ["ssh", "ssh-ssl", "slowdns", "vmess", "vless", "trojan"],
    hosts: [{ keyId: "demo-gb1", name: "United Kingdom 01", slug: "gb1", countryCode: "GB", city: "London", region: "Europe", hostname: "gb1.vaultline.test", maxAccounts: 500 }],
  },
  {
    port: 8456,
    latencyMs: 210,
    protocols: ALL,
    hosts: [
      { keyId: "demo-us1", name: "USA 01", slug: "us1", countryCode: "US", city: "New York", region: "North America", hostname: "us1.vaultline.test", maxAccounts: 600 },
      { keyId: "demo-ca1", name: "Canada 01", slug: "ca1", countryCode: "CA", city: "Toronto", region: "North America", hostname: "ca1.vaultline.test", maxAccounts: 300 },
      {
        keyId: "demo-us2",
        name: "USA 02",
        slug: "us2",
        countryCode: "US",
        city: "Los Angeles",
        region: "North America",
        hostname: "us2.vaultline.test",
        maxAccounts: 400,
        state: "offline",
      },
    ],
  },
  {
    port: 8457,
    latencyMs: 12,
    protocols: ALL,
    hosts: [{ keyId: "demo-sg1", name: "Singapore 01", slug: "sg1", countryCode: "SG", city: "Singapore", region: "Asia", hostname: "sg1.vaultline.test", maxAccounts: 600 }],
  },
  {
    port: 8458,
    latencyMs: 70,
    protocols: ["ssh", "ssh-ssl", "vmess", "vless", "trojan", "hysteria2", "zivpn"],
    hosts: [{ keyId: "demo-jp1", name: "Japan 01", slug: "jp1", countryCode: "JP", city: "Tokyo", region: "Asia", hostname: "jp1.vaultline.test", maxAccounts: 500 }],
  },
  {
    port: 8459,
    latencyMs: 185,
    protocols: ["ssh", "ssh-ssl", "slowdns", "vless", "trojan", "zivpn"],
    hosts: [{ keyId: "demo-pl1", name: "Poland 01", slug: "pl1", countryCode: "PL", city: "Warsaw", region: "Europe", hostname: "pl1.vaultline.test", maxAccounts: 300 }],
  },
  {
    port: 8460,
    latencyMs: 95,
    protocols: ["ssh", "slowdns", "vmess", "vless", "trojan", "hysteria", "hysteria2"],
    hosts: [{ keyId: "demo-au1", name: "Australia 01", slug: "au1", countryCode: "AU", city: "Sydney", region: "Oceania", hostname: "au1.vaultline.test", maxAccounts: 400 }],
  },
];
