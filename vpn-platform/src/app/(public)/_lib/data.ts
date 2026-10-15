import { cache } from "react";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";
import { SERVER_SLUG_PATTERN } from "@/lib/slug";
import type { CountryPageData, ProtocolPageData, PublicProtocolSummary, PublicSiteSettings, ServerPageData, SiteStats, StatusPageData } from "@/lib/public/types";
import { getCountryPage, getProtocolPage, getPublicSiteSettings, getServerPage, getSiteStats, getStatusPage, listProtocolSummaries } from "@/server/public/catalog";
import { getSiteSettings } from "@/server/settings/service";
import { quotaWindow } from "@/server/provisioning/quota";
import { errorSummary, logger } from "@/server/logging/logger";

/**
 * Request-scoped loaders shared by the public layout and pages (React cache() dedupes the calls
 * within one render). Each one degrades instead of throwing, so a database outage still renders
 * the site chrome with empty states rather than a crash.
 */

function toPublic(s: typeof DEFAULT_SITE_SETTINGS): PublicSiteSettings {
  return {
    siteName: s.siteName,
    tagline: s.tagline,
    seoDescription: s.seoDescription,
    announcement: s.announcement,
    contact: s.contact,
    rules: s.rules,
    avatarStyle: s.avatarStyle,
    display: s.display,
    quota: { resetTimes: s.quota.resetTimes, timezone: s.quota.timezone },
    captchaSiteKey: null,
  };
}

export const loadSettings = cache(async (): Promise<PublicSiteSettings> => {
  try {
    return await getPublicSiteSettings();
  } catch (e) {
    logger.warn("public site: settings unavailable, using stored/default settings", errorSummary(e));
    try {
      return toPublic(await getSiteSettings());
    } catch {
      return toPublic(DEFAULT_SITE_SETTINGS);
    }
  }
});

export const loadProtocols = cache(async (): Promise<PublicProtocolSummary[]> => {
  try {
    return await listProtocolSummaries();
  } catch (e) {
    logger.warn("public site: protocol list unavailable", errorSummary(e));
    return [];
  }
});

export const loadStats = cache(async (): Promise<SiteStats | null> => {
  try {
    return await getSiteStats();
  } catch (e) {
    logger.warn("public site: statistics unavailable", errorSummary(e));
    return null;
  }
});

export const loadStatus = cache(async (): Promise<StatusPageData | null> => {
  try {
    return await getStatusPage();
  } catch (e) {
    logger.warn("public site: status unavailable", errorSummary(e));
    return null;
  }
});

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Protocol page data; null for unknown slugs (the page calls notFound()). Unlike the loaders above
 * this one lets real failures throw, so the error boundary shows "try again" instead of a 404.
 */
export const loadProtocolPage = cache(async (protocol: string): Promise<ProtocolPageData | null> => {
  if (!SLUG.test(protocol)) return null;
  return getProtocolPage(protocol);
});

/** Country page data; null for unknown protocol/country slugs. */
export const loadCountryPage = cache(async (protocol: string, country: string): Promise<CountryPageData | null> => {
  if (!SLUG.test(protocol) || !SLUG.test(country)) return null;
  return getCountryPage(protocol, country);
});

/** Server page data; null for unknown protocol/country/server slugs. */
export const loadServerPage = cache(async (protocol: string, country: string, server: string): Promise<ServerPageData | null> => {
  if (!SLUG.test(protocol) || !SLUG.test(country) || !SERVER_SLUG_PATTERN.test(server)) return null;
  return getServerPage(protocol, country, server);
});

/** "00:00 & 12:00" */
export function joinTimes(times: string[]): string {
  if (times.length <= 1) return times[0] ?? "00:00";
  return `${times.slice(0, -1).join(", ")} & ${times[times.length - 1]}`;
}

/** "GMT+7" style label for a zone ("UTC" for UTC itself). */
export function zoneLabel(timeZone: string, at = new Date()): string {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part || part === "GMT") return "UTC";
    return part;
  } catch {
    return timeZone;
  }
}

/** Reset schedule shown in the top bar: labels plus the next reset instant (ISO). */
export function resetSchedule(quota: PublicSiteSettings["quota"]): { timesLabel: string; zoneLabel: string; nextResetAt: string | null } {
  const now = new Date();
  let nextResetAt: string | null = null;
  try {
    const end = quotaWindow(now, quota.resetTimes, quota.timezone).end;
    nextResetAt = Number.isFinite(end.getTime()) ? end.toISOString() : null;
  } catch {
    nextResetAt = null;
  }
  return { timesLabel: joinTimes(quota.resetTimes), zoneLabel: zoneLabel(quota.timezone, now), nextResetAt };
}
