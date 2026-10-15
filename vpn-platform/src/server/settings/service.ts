import { eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { siteSettings, type JsonObject } from "@/server/db/schema";
import { audit, type AuditActor } from "@/server/audit";
import { logger } from "@/server/logging/logger";
import { DEFAULT_SITE_SETTINGS, siteSettingsSchema, type SiteSettings } from "@/lib/site-settings";

import { clearPublicCache } from "@/server/public/cache";
/**
 * Site settings are read on every public page, so they are cached per process for a few seconds.
 * Other processes (the worker, other web replicas) pick up a change within CACHE_MS.
 */
const CACHE_MS = 5_000;
const g = globalThis as unknown as { __vlSettings?: { value: SiteSettings; at: number } };

/** Merge stored data over the defaults section by section, so new settings get sensible values. */
function withDefaults(stored: JsonObject | undefined): SiteSettings {
  const d = DEFAULT_SITE_SETTINGS as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...d };
  for (const [k, v] of Object.entries(stored ?? {})) {
    const def = d[k];
    merged[k] = def && typeof def === "object" && !Array.isArray(def) && v && typeof v === "object" && !Array.isArray(v) ? { ...def, ...v } : v;
  }
  const parsed = siteSettingsSchema.safeParse(merged);
  if (parsed.success) return parsed.data;
  logger.warn("stored site settings are invalid; using defaults", { issues: parsed.error.issues.length });
  return DEFAULT_SITE_SETTINGS;
}

export async function getSiteSettings(): Promise<SiteSettings> {
  const hit = g.__vlSettings;
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  let value = DEFAULT_SITE_SETTINGS;
  try {
    const [row] = await db().select({ data: siteSettings.data }).from(siteSettings).where(eq(siteSettings.id, 1)).limit(1);
    value = withDefaults(row?.data);
  } catch (e) {
    logger.error("failed to load site settings", { error: (e as Error).message });
    if (hit) return hit.value;
  }
  g.__vlSettings = { value, at: Date.now() };
  return value;
}

/** Validate and store new settings (whole document). Throws a ZodError for invalid input. */
export async function updateSiteSettings(raw: unknown, actor: AuditActor): Promise<SiteSettings> {
  const next = siteSettingsSchema.parse(raw);
  const before = await getSiteSettings();
  await db()
    .insert(siteSettings)
    .values({ id: 1, data: next as unknown as JsonObject, updatedBy: actor.adminId })
    .onConflictDoUpdate({ target: siteSettings.id, set: { data: next as unknown as JsonObject, updatedBy: actor.adminId, updatedAt: sql`now()` } });
  g.__vlSettings = { value: next, at: Date.now() };
  const changed = (Object.keys(next) as (keyof SiteSettings)[]).filter((k) => JSON.stringify(next[k]) !== JSON.stringify(before[k]));
  await audit(actor, "settings.update", { targetType: "settings", targetId: "site", details: { changed } });
  clearPublicCache(); // admin changes show on public pages immediately
  return next;
}

/** Test helper: forget the cached value. */
export function clearSiteSettingsCache() {
  g.__vlSettings = undefined;
}
