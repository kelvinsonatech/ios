import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db } from "@/server/db";
import { closeRedis, redis } from "@/server/redis";
import { closeQueue } from "@/server/provisioning/queue";
import { closeAllNodeAgents } from "@/server/nodes/transport";
import { seedProtocols } from "@/server/protocols/seed";
import { createServerDraft } from "@/server/servers/service";
import type { AuditActor } from "@/server/audit";
import { startMockNode, type MockNodeOptions } from "../mock-node/mock-node";
import { clearPublicCache } from "@/server/public/cache";
import { getCountryPage, getProtocolPage } from "@/server/public/catalog";
import { clearSiteSettingsCache, updateSiteSettings } from "@/server/settings/service";
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from "@/lib/site-settings";
import type { PublicServerCard } from "@/lib/public/types";

export const actor: AuditActor = { adminId: null, email: "tests@example.com", ip: "127.0.0.1", userAgent: "vitest" };
export const SECRET = "test-node-secret-0123456789abcdef";

/** Fresh schema + seed. Only ever touches the test database configured in setup-env.ts. */
export async function resetDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  if (!/_test\b|test/.test(url)) throw new Error(`Refusing to reset non-test database ${url}`);
  await db().execute(sql`drop schema if exists public cascade`);
  await db().execute(sql`drop schema if exists drizzle cascade`);
  await db().execute(sql`create schema public`);
  await migrate(db(), { migrationsFolder: "drizzle" });
  await seedProtocols();
  await redis().flushdb();
  clearPublicCache();
  clearSiteSettingsCache();
}

/** Store site settings for a test (whole document, merged over the defaults). */
export async function setSettings(patch: Partial<SiteSettings>) {
  await updateSiteSettings({ ...DEFAULT_SITE_SETTINGS, ...patch }, actor);
  clearPublicCache();
}

/** Every server the public browse pages list for a protocol (fresh, bypassing the catalogue cache). */
export async function listedServers(protocolSlug: string): Promise<PublicServerCard[]> {
  clearPublicCache();
  const page = await getProtocolPage(protocolSlug);
  if (!page) return [];
  const out: PublicServerCard[] = [];
  for (const c of page.countries) out.push(...((await getCountryPage(protocolSlug, c.slug))?.servers ?? []));
  return out;
}

export async function teardown() {
  await closeAllNodeAgents();
  await closeQueue();
  await closeRedis();
  await closeDb();
}

export async function startNode(opts: Partial<MockNodeOptions> = {}) {
  return startMockNode({ secret: SECRET, keyId: "mock-key", control: true, ...opts });
}

let counter = 0;
export async function createServer(
  port: number,
  overrides: { maxAccounts?: number; name?: string; countryCode?: string; city?: string | null; region?: string | null; hostname?: string } = {},
) {
  counter += 1;
  return createServerDraft(
    {
      name: overrides.name ?? `Test ${counter} ${Date.now()}`,
      slug: null,
      countryCode: overrides.countryCode ?? "SG",
      city: overrides.city === undefined ? "Singapore" : overrides.city,
      region: overrides.region === undefined ? "Asia" : overrides.region,
      hostname: overrides.hostname ?? "node.test",
      ipAddress: "127.0.0.1",
      apiPort: port,
      apiBasePath: "/api/v1",
      maxAccounts: overrides.maxAccounts ?? 100,
      provider: null,
      notes: null,
      driver: "contract-v1",
    },
    {
      authMethod: "hmac_sha256",
      keyId: "mock-key",
      apiSecret: SECRET,
      tlsMode: "insecure_http",
      tlsServerName: null,
      caCertificatePem: null,
      pinnedFingerprintSha256: null,
      clientCertificatePem: null,
      clientKeyPem: null,
    },
    actor,
  );
}
