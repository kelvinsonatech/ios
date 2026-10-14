import { createAvatar, type Style } from "@dicebear/core";
import {
  avataaars,
  bottts,
  botttsNeutral,
  glass,
  identicon,
  initials,
  lorelei,
  notionists,
  notionistsNeutral,
  openPeeps,
  pixelArt,
  rings,
  shapes,
  thumbs,
} from "@dicebear/collection";
import { DEFAULT_AVATAR_STYLE, type AvatarStyle } from "@/lib/avatar-styles";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const STYLES: Record<AvatarStyle, Style<any>> = {
  thumbs,
  bottts,
  "bottts-neutral": botttsNeutral,
  notionists,
  "notionists-neutral": notionistsNeutral,
  lorelei,
  "open-peeps": openPeeps,
  avataaars,
  "pixel-art": pixelArt,
  identicon,
  shapes,
  rings,
  glass,
  initials,
};

const cache = new Map<string, string>();
const CACHE_MAX = 2000;

/**
 * Deterministic DiceBear avatar as an SVG data URI (generated locally: no third-party request, so
 * nothing about the user leaves the server and the CSP stays `img-src 'self' data:`).
 * The same seed always yields the same avatar.
 */
export function avatarDataUri(seed: string, style: AvatarStyle = DEFAULT_AVATAR_STYLE): string {
  const key = `${style}\u0000${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const uri = createAvatar(STYLES[style] ?? STYLES[DEFAULT_AVATAR_STYLE], { seed, size: 128 }).toDataUri();
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, uri);
  return uri;
}

/** Avatar of a VPN account. Seeded by the account id so the user's result page and the admin list match. */
export function accountAvatar(accountId: string, style?: AvatarStyle): string {
  return avatarDataUri(`account:${accountId}`, style);
}

/** Avatar of an administrator. */
export function adminAvatar(adminId: string, style?: AvatarStyle): string {
  return avatarDataUri(`admin:${adminId}`, style);
}
