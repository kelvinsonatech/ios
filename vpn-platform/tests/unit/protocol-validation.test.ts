import { describe, expect, it } from "vitest";
import { isReservedProtocolSlug, protocolSchema, RESERVED_PROTOCOL_SLUGS } from "@/server/protocols/validation";

const base = {
  name: "Protocol X",
  slug: "protocol-x",
  description: "",
  icon: "shield",
  category: "vpn",
  adapterKey: "generic",
  nodeIdentifiers: ["protocol-x"],
  enabled: true,
  displayOrder: 10,
  durationOptions: [3, 7],
  defaultDurationDays: 7,
  maxAccountsPerIpPerDay: 3,
  fields: [],
  outputFields: [],
};

describe("protocol slugs", () => {
  it("accepts a normal slug", () => {
    expect(protocolSchema.safeParse(base).success).toBe(true);
  });
  it.each(["about", "contact", "privacy", "terms", "acceptable-use", "report", "server-status", "my-accounts", "admin", "api"])(
    "rejects the public route %s",
    (slug) => {
      const r = protocolSchema.safeParse({ ...base, slug });
      expect(r.success).toBe(false);
      expect(r.error?.issues.some((i) => i.path[0] === "slug" && /reserved/i.test(i.message))).toBe(true);
    },
  );
  it("rejects reserved names regardless of case and whitespace", () => {
    expect(protocolSchema.safeParse({ ...base, slug: " Server-Status " }).success).toBe(false);
    expect(isReservedProtocolSlug("ADMIN")).toBe(true);
  });
  it("rejects framework paths and files", () => {
    for (const slug of ["sitemap.xml", "robots.txt", "_next"]) {
      expect(isReservedProtocolSlug(slug)).toBe(true);
      expect(protocolSchema.safeParse({ ...base, slug }).success).toBe(false);
    }
  });
  it("covers every static public route listed in the product spec", () => {
    const spec = ["about", "contact", "privacy", "terms", "acceptable-use", "report", "server-status", "my-accounts", "admin", "api", "sitemap.xml", "robots.txt", "_next"];
    for (const slug of spec) expect(RESERVED_PROTOCOL_SLUGS).toContain(slug);
  });
  it("does not reserve similar but distinct names", () => {
    expect(isReservedProtocolSlug("reports")).toBe(false);
    expect(isReservedProtocolSlug("api-proxy")).toBe(false);
    expect(RESERVED_PROTOCOL_SLUGS).toContain("server-status");
  });
});
