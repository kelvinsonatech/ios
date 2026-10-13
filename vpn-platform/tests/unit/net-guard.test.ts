import { describe, expect, it } from "vitest";
import { isRestrictedAddress } from "@/server/nodes/net-guard";

describe("node address guard", () => {
  it.each(["127.0.0.1", "10.1.2.3", "172.16.5.4", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "not-an-ip"])(
    "blocks %s",
    (ip) => expect(isRestrictedAddress(ip)).toBe(true),
  );
  it.each(["8.8.8.8", "123.123.123.123", "1.1.1.1", "::ffff:8.8.8.8", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isRestrictedAddress(ip)).toBe(false));
});
