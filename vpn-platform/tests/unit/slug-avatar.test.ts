import { describe, expect, it } from "vitest";
import { countryCodeFromSlug, countrySlug, slugify } from "@/lib/slug";
import { avatarDataUri } from "@/server/avatar";
import { AVATAR_STYLE_KEYS } from "@/lib/avatar-styles";

describe("slugs", () => {
  it("builds readable country slugs and reverses them", () => {
    expect(countrySlug("GB")).toBe("united-kingdom");
    expect(countrySlug("us")).toBe("united-states");
    expect(countryCodeFromSlug("germany")).toBe("DE");
    expect(countryCodeFromSlug("atlantis")).toBeNull();
    expect(slugify("Côte d’Ivoire")).toBe("cote-d-ivoire");
  });
});

describe("avatars", () => {
  it("is deterministic per seed and differs between seeds", () => {
    const a = avatarDataUri("alice");
    expect(a).toMatch(/^data:image\/svg\+xml;/);
    expect(avatarDataUri("alice")).toBe(a);
    expect(avatarDataUri("bob")).not.toBe(a);
  });
  it("renders every offered style", () => {
    for (const s of AVATAR_STYLE_KEYS) expect(avatarDataUri("seed", s)).toMatch(/^data:image\/svg\+xml;/);
  });
});
