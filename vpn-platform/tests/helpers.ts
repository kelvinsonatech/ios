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
export async function createServer(port: number, overrides: { maxAccounts?: number; name?: string } = {}) {
  counter += 1;
  return createServerDraft(
    {
      name: overrides.name ?? `Test ${counter} ${Date.now()}`,
      slug: null,
      countryCode: "SG",
      city: "Singapore",
      region: "Asia",
      hostname: "node.test",
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
