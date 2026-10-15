import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { absoluteUrl } from "@/lib/seo";
import { listSitemapEntries, STATIC_PAGES } from "@/server/public/catalog";
import { errorSummary, logger } from "@/server/logging/logger";

/** Priority by depth: home 1.0, protocol pages 0.8, countries 0.7, servers 0.6, static pages 0.4. */
function priority(path: string): number {
  if (path === "/") return 1;
  if (STATIC_PAGES.includes(path)) return path === "/server-status" ? 0.7 : 0.4;
  const depth = path.split("/").filter(Boolean).length;
  return depth === 1 ? 0.8 : depth === 2 ? 0.7 : 0.6;
}

function changeFrequency(path: string): MetadataRoute.Sitemap[number]["changeFrequency"] {
  if (path === "/server-status") return "always";
  if (STATIC_PAGES.includes(path)) return "monthly";
  return path.split("/").filter(Boolean).length >= 2 ? "hourly" : "daily";
}

/**
 * /sitemap.xml generated from the live catalogue (every published protocol, country and server
 * page). Rendered per request so new servers appear without a deploy; if the database is
 * unavailable it still lists the home and static pages.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  let entries: { path: string; lastModified: string | null }[];
  try {
    entries = await listSitemapEntries();
  } catch (e) {
    logger.warn("sitemap: catalogue unavailable, listing static pages only", errorSummary(e));
    entries = ["/", ...STATIC_PAGES].map((path) => ({ path, lastModified: null }));
  }
  return entries.map((e) => ({
    url: absoluteUrl(e.path),
    ...(e.lastModified ? { lastModified: e.lastModified } : {}),
    changeFrequency: changeFrequency(e.path),
    priority: priority(e.path),
  }));
}
