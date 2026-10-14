import type {
  CountryPageData,
  ProtocolPageData,
  PublicProtocolSummary,
  PublicSiteSettings,
  ServerPageData,
  SitemapEntry,
  SiteStats,
  StatusPageData,
} from "@/lib/public/types";

/**
 * Read-only public catalogue used by the public pages and /api/public/*.
 * Listing rules (the auto-publishing query, see src/server/protocols/catalog.ts):
 *   protocol.enabled AND server_protocol.enabled AND server_protocol.detected AND server published
 *   (lifecycle active|maintenance, not deleted, compatibility <> unsupported).
 * Browse pages list servers whose status is online|full|maintenance; the status page also lists
 * offline ones. All functions return null for unknown/disabled slugs (pages call notFound()).
 *
 * TODO(backend lane): implement. Signatures are the contract with the UI lanes.
 */

export async function getPublicSiteSettings(): Promise<PublicSiteSettings> {
  throw new Error("not implemented");
}

export async function listProtocolSummaries(): Promise<PublicProtocolSummary[]> {
  throw new Error("not implemented");
}

export async function getProtocolPage(protocolSlug: string): Promise<ProtocolPageData | null> {
  void protocolSlug;
  throw new Error("not implemented");
}

export async function getCountryPage(protocolSlug: string, countrySlug: string): Promise<CountryPageData | null> {
  void protocolSlug;
  void countrySlug;
  throw new Error("not implemented");
}

export async function getServerPage(protocolSlug: string, countrySlug: string, serverSlug: string): Promise<ServerPageData | null> {
  void protocolSlug;
  void countrySlug;
  void serverSlug;
  throw new Error("not implemented");
}

export async function getStatusPage(): Promise<StatusPageData> {
  throw new Error("not implemented");
}

export async function getSiteStats(): Promise<SiteStats> {
  throw new Error("not implemented");
}

export async function listSitemapEntries(): Promise<SitemapEntry[]> {
  throw new Error("not implemented");
}
