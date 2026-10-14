import { COUNTRIES, countryName } from "./countries";

/** Server URL segment, e.g. "de1" in /vless/germany/de1. */
export const SERVER_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Lowercase ASCII words joined by hyphens ("Côte d’Ivoire" → "cote-d-ivoire"). */
export function slugify(input: string, max = 48): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Public URL segment for a country code: "GB" → "united-kingdom". */
export function countrySlug(code: string): string {
  return slugify(countryName(code));
}

const BY_SLUG = new Map(COUNTRIES.map((c) => [slugify(c.name), c.code]));

/** Reverse of countrySlug(); null for unknown slugs. */
export function countryCodeFromSlug(slug: string): string | null {
  return BY_SLUG.get(slug) ?? null;
}
