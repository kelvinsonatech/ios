import { describe, expect, it } from "vitest";
import { clientNetwork, hashClientIp } from "@/server/crypto/hashing";

describe("clientNetwork", () => {
  it("keeps IPv4 addresses and unwraps IPv4-mapped IPv6", () => {
    expect(clientNetwork("198.51.100.7")).toBe("198.51.100.7");
    expect(clientNetwork("::ffff:198.51.100.7")).toBe("198.51.100.7");
  });

  it("reduces IPv6 to its /64 prefix in one canonical form", () => {
    expect(clientNetwork("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(clientNetwork("2001:0DB8:0001:0002:ffff:aaaa:bbbb:cccc")).toBe("2001:db8:1:2::/64");
    expect(clientNetwork("2001:db8::5")).toBe("2001:db8:0:0::/64");
    expect(clientNetwork("::1")).toBe("0:0:0:0::/64");
    expect(clientNetwork("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
    expect(clientNetwork("64:ff9b::198.51.100.7")).toBe("64:ff9b:0:0::/64");
  });

  it("leaves anything that is not an IP unchanged", () => {
    expect(clientNetwork("unknown")).toBe("unknown");
  });
});

describe("hashClientIp", () => {
  it("gives every address in one IPv6 /64 the same hash, and different /64s different hashes", () => {
    const a = hashClientIp("2001:db8:1:2::1");
    expect(a).toBe(hashClientIp("2001:db8:1:2:abcd::99"));
    expect(a).not.toBe(hashClientIp("2001:db8:1:3::1"));
    expect(hashClientIp("198.51.100.7")).not.toBe(hashClientIp("198.51.100.8"));
    expect(hashClientIp(null)).toBeNull();
  });
});
