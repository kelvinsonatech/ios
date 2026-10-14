/**
 * DiceBear styles offered for automatic avatars. Only styles whose artwork license allows commercial
 * use without attribution (CC0 / MIT / "free for personal and commercial use") are listed, so no
 * credit line is required on the site. Safe to import from client components (no DiceBear code).
 */
export const AVATAR_STYLES = {
  thumbs: { label: "Thumbs", license: "CC0 1.0" },
  bottts: { label: "Bottts (robots)", license: "Free for personal and commercial use" },
  "bottts-neutral": { label: "Bottts neutral", license: "Free for personal and commercial use" },
  notionists: { label: "Notionists", license: "CC0 1.0" },
  "notionists-neutral": { label: "Notionists neutral", license: "CC0 1.0" },
  lorelei: { label: "Lorelei", license: "CC0 1.0" },
  "open-peeps": { label: "Open Peeps", license: "CC0 1.0" },
  avataaars: { label: "Avataaars", license: "Free for personal and commercial use" },
  "pixel-art": { label: "Pixel art", license: "CC0 1.0" },
  identicon: { label: "Identicon", license: "CC0 1.0" },
  shapes: { label: "Shapes", license: "CC0 1.0" },
  rings: { label: "Rings", license: "CC0 1.0" },
  glass: { label: "Glass", license: "CC0 1.0" },
  initials: { label: "Initials", license: "CC0 1.0" },
} as const;

export type AvatarStyle = keyof typeof AVATAR_STYLES;
export const AVATAR_STYLE_KEYS = Object.keys(AVATAR_STYLES) as [AvatarStyle, ...AvatarStyle[]];
export const DEFAULT_AVATAR_STYLE: AvatarStyle = "thumbs";
