import { BlockList, isIP } from "node:net";
import { env } from "@/server/env";

/**
 * SSRF guard for node addresses. Server addresses are entered by administrators, but we still
 * refuse loopback, private, link-local (cloud metadata) and other special ranges unless
 * ALLOW_PRIVATE_NODE_ADDRESSES is set (local development, private management networks).
 */
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

export function isRestrictedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 0) return true;
  return blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

export function assertNodeAddressAllowed(ip: string): void {
  if (isIP(ip) === 0) throw new Error("Server IP address is not a valid IPv4/IPv6 address.");
  if (!env().ALLOW_PRIVATE_NODE_ADDRESSES && isRestrictedAddress(ip)) {
    throw new Error(
      "Server IP address is in a private, loopback or reserved range. Set ALLOW_PRIVATE_NODE_ADDRESSES=true only for development or private management networks.",
    );
  }
}
