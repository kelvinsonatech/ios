import type { Metadata } from "next";

/**
 * SEO helpers for the public site: absolute URLs from APP_URL, per-page metadata with canonical
 * links and Open Graph defaults, and link safety for admin-entered URLs. No server imports, so it
 * is safe in client code too (APP_URL is only defined on the server; links fall back to relative).
 */

const FALLBACK_ORIGIN = "http://localhost:3000";

/** Absolute site origin without a trailing slash ("https://example.com"). */
export function siteOrigin(): string {
  const raw = process.env.APP_URL || FALLBACK_ORIGIN;
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return FALLBACK_ORIGIN;
  }
}

/** Absolute URL for a site path ("/vless" → "https://example.com/vless"). */
export function absoluteUrl(path = "/"): string {
  return new URL(path, `${siteOrigin()}/`).toString();
}

/**
 * Metadata for one public page. `title` is the page part only (the root layout's template appends
 * the site name); `path` becomes the canonical URL and og:url.
 */
export function pageMetadata({
  title,
  description,
  path,
  siteName,
  noIndex,
}: {
  title: string;
  description: string;
  path: string;
  siteName?: string;
  noIndex?: boolean;
}): Metadata {
  const fullTitle = siteName ? `${title} · ${siteName}` : title;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      title: fullTitle,
      description,
      ...(siteName ? { siteName } : {}),
      locale: "en_US",
    },
    twitter: { card: "summary", title: fullTitle, description },
    ...(noIndex ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * Only same-site paths and https:// links from settings are ever rendered as hrefs; anything else
 * (javascript:, data:, protocol-relative //host, http://) is dropped. Settings are validated on save
 * too; this is the second line of defence at render time.
 */
export function safeHref(url: string | null | undefined): string | null {
  if (!url) return null;
  const v = url.trim();
  if (/^\/(?!\/)[\w\-./?=&#%~+]*$/.test(v)) return v;
  if (/^https:\/\/[^\s"'<>\\]+$/.test(v)) {
    try {
      return new URL(v).protocol === "https:" ? v : null;
    } catch {
      return null;
    }
  }
  return null;
}

/** True when an href points to another site (render with target=_blank rel="noopener noreferrer"). */
export function isExternalHref(href: string): boolean {
  return /^https?:\/\//.test(href);
}

/** mailto: link for a validated contact address (no header injection: only the address itself). */
export function mailtoHref(email: string | null | undefined): string | null {
  if (!email || !/^[^\s@<>()"',;:\\]+@[^\s@<>()"',;:\\]+\.[^\s@<>()"',;:\\]+$/.test(email)) return null;
  return `mailto:${email}`;
}
