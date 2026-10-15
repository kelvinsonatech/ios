/**
 * Demo data for local QA and screenshots (development only; refuses NODE_ENV=production):
 *
 *   npm run demo:nodes     # terminal 1: the mock fleet (127.0.0.1:8451–8460)
 *   npm run demo:seed      # terminal 2: idempotent, safe to run again
 *
 * What it does, through the same services the admin panel uses:
 *  - demo site settings (announcement on, quota resets 00:00/12:00 Asia/Bangkok, default quota 50);
 *  - soft-deletes leftover local test servers (non-demo servers on loopback addresses);
 *  - creates/updates the servers of scripts/demo-fleet.ts, connects + syncs them, enables every
 *    detected protocol (quota 50, ZIVPN without quota), publishes them; one ends up in maintenance
 *    and one offline (moved to a closed port);
 *  - simulated quota usage for the current window, a few real accounts (created on the mock nodes
 *    through the provisioning pipeline, one of them revoked) and two problem reports.
 * Needs ALLOW_INSECURE_NODE_HTTP=true and ALLOW_PRIVATE_NODE_ADDRESSES=true (dev .env).
 */
import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { protocols, serverCredentials, serverProtocols, serverReports, servers, vpnAccounts, type Server } from "@/server/db/schema";
import type { AuditActor } from "@/server/audit";
import { env } from "@/server/env";
import { closeAllNodeAgents } from "@/server/nodes/transport";
import { seedProtocols } from "@/server/protocols/seed";
import { closeQueue } from "@/server/provisioning/queue";
import { quotaWindow } from "@/server/provisioning/quota";
import { executeCreate, getRequestRow, ProvisioningError, requestAccount, revokeAccount } from "@/server/provisioning/service";
import { closeRedis } from "@/server/redis";
import {
  createServerDraft,
  deleteServer,
  publishServer,
  setServerLifecycle,
  updateServerConnection,
  updateServerDetails,
  updateServerProtocols,
} from "@/server/servers/service";
import { syncServer, testConnection } from "@/server/servers/sync";
import type { ConnectionInput, ServerDetailsInput } from "@/server/servers/validation";
import { getSiteSettings, updateSiteSettings } from "@/server/settings/service";
import { DEMO_CLOSED_PORT, DEMO_FLEET, DEMO_MARKER, DEMO_SECRET, type DemoHost, type DemoNode } from "./demo-fleet";

const actor: AuditActor = { adminId: null, email: "demo-seed", ip: null, userAgent: "npm run demo:seed" };
const QUOTA = 50;
/** Protocols left without a creation quota (their slots come from the server cap). */
const UNLIMITED = new Set(["zivpn"]);

/** Simulated creations in the current window; a few fixed values show "almost full" and "full". */
const FIXED_USAGE: Record<string, number> = { "sg1:ssh": QUOTA, "de1:vless": QUOTA - 1, "us1:ssh-ssl": QUOTA - 3, "nl1:trojan": 44 };

function demoUsage(slug: string, protocol: string): number {
  const key = `${slug}:${protocol}`;
  if (key in FIXED_USAGE) return FIXED_USAGE[key]!;
  return createHash("sha256").update(key).digest().readUInt16BE(0) % 41;
}

interface DemoAccount {
  server: string;
  protocol: string;
  input: Record<string, string>;
  revoke?: boolean;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { server: "de1", protocol: "ssh", input: { username: "nomad_rider", password: "Sunrise-2026", duration: "7" } },
  { server: "sg1", protocol: "vless", input: { username: "kopi-o", transport: "ws", duration: "3" } },
  { server: "jp1", protocol: "hysteria2", input: { username: "sakura_line", duration: "7" } },
  { server: "us1", protocol: "trojan", input: { username: "liberty.run", transport: "grpc", duration: "14" } },
  { server: "fi1", protocol: "slowdns", input: { username: "aurora_nord", password: "Northern+Lights9", duration: "30" } },
  { server: "gb1", protocol: "ssh-ssl", input: { username: "teatime", password: "Earl.Grey-42", duration: "7" } },
  { server: "au1", protocol: "vmess", input: { username: "outback", transport: "ws", sni_bug: "cdn.example.com", sni_type: "sni", duration: "3" } },
  { server: "pl1", protocol: "zivpn", input: { username: "vistula", password: "Amber-Coast8", duration: "7" }, revoke: true },
];

const DEMO_REPORTS = [
  {
    server: "de1",
    protocol: "vless",
    category: "slow",
    message: "VLESS on Germany 01 gets slow in the evening (around 20:00 to 23:00), downloads drop to about 1 Mbps.",
    contactEmail: "reader@example.com",
  },
  {
    server: "us2",
    protocol: "ssh",
    category: "connection",
    message: "Cannot connect to USA 02 since this morning. HTTP Custom says the connection timed out.",
    contactEmail: null,
  },
];

function log(msg: string) {
  console.log(msg);
}

function details(h: DemoHost, port: number): ServerDetailsInput {
  return {
    name: h.name,
    slug: h.slug,
    countryCode: h.countryCode,
    city: h.city,
    region: h.region,
    hostname: h.hostname,
    ipAddress: "127.0.0.1",
    apiPort: port,
    apiBasePath: "/api/v1",
    maxAccounts: h.maxAccounts,
    provider: "Demo (mock node)",
    notes: DEMO_MARKER,
    driver: "contract-v1",
  };
}

function connection(h: DemoHost): ConnectionInput {
  return {
    authMethod: "hmac_sha256",
    keyId: h.keyId,
    apiSecret: DEMO_SECRET,
    tlsMode: "insecure_http",
    tlsServerName: null,
    caCertificatePem: null,
    pinnedFingerprintSha256: null,
    clientCertificatePem: null,
    clientKeyPem: null,
  };
}

const isLoopback = (ip: string) => ip.startsWith("127.") || ip === "::1";

async function applySettings() {
  const current = await getSiteSettings();
  await updateSiteSettings(
    {
      ...current,
      announcement: {
        enabled: true,
        text: "Hysteria 2 and ZIVPN UDP accounts are now available on most servers. Live server health is on the status page.",
        tone: "info",
        linkLabel: "Server status",
        linkUrl: "/server-status",
      },
      quota: { resetTimes: ["00:00", "12:00"], timezone: "Asia/Bangkok", defaultLimit: QUOTA },
      contact: { ...current.contact, email: current.contact.email ?? "hello@example.com" },
    },
    actor,
  );
  log("Site settings: announcement on, quota resets 00:00 and 12:00 Asia/Bangkok, default quota 50.");
}

/** Leftover local test servers (e.g. from manual testing) would clash with the demo names and slugs. */
async function removeLocalLeftovers() {
  const rows = await db().select().from(servers).where(isNull(servers.deletedAt));
  for (const s of rows) {
    if (s.notes === DEMO_MARKER || !isLoopback(s.ipAddress)) continue;
    await deleteServer(s.id, s.name, actor);
    log(`Removed leftover local test server "${s.name}" (/${s.slug}, port ${s.apiPort}).`);
  }
}

async function findServer(h: DemoHost): Promise<Server | null> {
  const [s] = await db()
    .select()
    .from(servers)
    .where(and(isNull(servers.deletedAt), sql`lower(${servers.name}) = ${h.name.toLowerCase()}`))
    .limit(1);
  return s ?? null;
}

async function ensureKeyId(serverId: string, h: DemoHost) {
  const [cred] = await db()
    .select({ keyId: serverCredentials.keyId })
    .from(serverCredentials)
    .where(and(eq(serverCredentials.serverId, serverId), isNull(serverCredentials.revokedAt)))
    .limit(1);
  if (cred?.keyId !== h.keyId) await updateServerConnection(serverId, connection(h), actor);
}

async function enableDetected(serverId: string) {
  const rows = await db()
    .select({ protocolId: serverProtocols.protocolId, slug: protocols.slug })
    .from(serverProtocols)
    .innerJoin(protocols, eq(protocols.id, serverProtocols.protocolId))
    .where(and(eq(serverProtocols.serverId, serverId), eq(serverProtocols.detected, true)))
    .orderBy(asc(protocols.displayOrder));
  await updateServerProtocols(
    serverId,
    rows.map((r) => ({ protocolId: r.protocolId, enabled: true, maxAccounts: null, quotaLimit: UNLIMITED.has(r.slug) ? null : QUOTA })),
    actor,
  );
  return rows.map((r) => r.slug);
}

async function setupServer(node: DemoNode, h: DemoHost): Promise<Server | null> {
  const state = h.state ?? "online";
  let server = await findServer(h);
  if (server && server.notes !== DEMO_MARKER) {
    log(`! Skipping ${h.name}: a server with this name exists and was not created by demo:seed.`);
    return null;
  }

  // An offline demo server that is already published only needs to stay pointed at the closed port.
  if (server && state === "offline" && server.publishedAt) {
    if (server.apiPort !== DEMO_CLOSED_PORT) server = await updateServerDetails(server.id, details(h, DEMO_CLOSED_PORT), actor);
    await testConnection(server.id, actor);
    log(`  ${h.name.padEnd(18)} /${h.slug.padEnd(4)} offline (port ${DEMO_CLOSED_PORT} is closed)`);
    return server;
  }

  if (!server) server = await createServerDraft(details(h, node.port), connection(h), actor);
  else {
    server = await updateServerDetails(server.id, details(h, node.port), actor);
    await ensureKeyId(server.id, h);
  }

  const sync = await syncServer(server.id, actor);
  if (!sync.ok) {
    throw new Error(`${h.name}: cannot reach the mock node on 127.0.0.1:${node.port} (${sync.error?.message}). Start it first: npm run demo:nodes`);
  }
  const enabled = await enableDetected(server.id);

  const [fresh] = await db().select().from(servers).where(eq(servers.id, server.id));
  server = fresh!;
  if (server.lifecycle === "draft") await publishServer(server.id, actor);
  else if (server.lifecycle === "disabled") await setServerLifecycle(server.id, "active", actor);
  const [published] = await db().select().from(servers).where(eq(servers.id, server.id));
  server = published!;

  if (state === "maintenance" && server.lifecycle !== "maintenance") await setServerLifecycle(server.id, "maintenance", actor);
  if (state !== "maintenance" && server.lifecycle === "maintenance") await setServerLifecycle(server.id, "active", actor);
  if (state === "offline") {
    server = await updateServerDetails(server.id, details(h, DEMO_CLOSED_PORT), actor);
    await testConnection(server.id, actor);
  }
  const label = state === "offline" ? `offline (port ${DEMO_CLOSED_PORT} is closed)` : state === "maintenance" ? "maintenance" : `online, ${sync.latencyMs} ms`;
  log(`  ${h.name.padEnd(18)} /${h.slug.padEnd(4)} ${label}  [${enabled.join(" ")}]`);
  const [final] = await db().select().from(servers).where(eq(servers.id, server.id));
  return final ?? server;
}

/** Simulated creations in the current quota window (never lowers real usage). */
async function applyUsage(bySlug: Map<string, Server>) {
  const settings = await getSiteSettings();
  const window = quotaWindow(new Date(), settings.quota.resetTimes, settings.quota.timezone);
  const start = window.start.toISOString();
  const rows = await db()
    .select({ id: serverProtocols.id, serverId: serverProtocols.serverId, slug: protocols.slug })
    .from(serverProtocols)
    .innerJoin(protocols, eq(protocols.id, serverProtocols.protocolId))
    .where(and(inArray(serverProtocols.serverId, [...bySlug.values()].map((s) => s.id)), eq(serverProtocols.detected, true)));
  const slugById = new Map([...bySlug.entries()].map(([slug, s]) => [s.id, slug]));
  for (const r of rows) {
    const used = demoUsage(slugById.get(r.serverId)!, r.slug);
    await db()
      .update(serverProtocols)
      .set({
        quotaUsed: sql`greatest(case when ${serverProtocols.quotaWindowStart} = ${start}::timestamptz then ${serverProtocols.quotaUsed} else 0 end, ${used})`,
        quotaWindowStart: sql`${start}::timestamptz`,
      })
      .where(eq(serverProtocols.id, r.id));
  }
  log(`Simulated quota usage for the window ${window.start.toISOString()} → ${window.end.toISOString()}.`);
}

async function createAccounts(bySlug: Map<string, Server>) {
  for (const [i, a] of DEMO_ACCOUNTS.entries()) {
    const server = bySlug.get(a.server);
    if (!server || server.status !== "online") continue;
    const label = `${a.protocol} account "${a.input.username}" on ${server.name}`;
    try {
      const r = await requestAccount({
        serverId: server.id,
        protocolSlug: a.protocol,
        input: a.input,
        // Per server instance, so a re-created server gets fresh demo accounts.
        idempotencyKey: `demo-seed-${server.id.slice(0, 8)}-${i}`,
        clientIp: null,
        actor,
      });
      if (!r.replayed || r.state === "queued") await executeCreate(r.requestId);
      const row = await getRequestRow(r.requestId);
      if (row?.state === "succeeded" && a.revoke && row.accountId) {
        const [acc] = await db().select({ status: vpnAccounts.status }).from(vpnAccounts).where(eq(vpnAccounts.id, row.accountId));
        if (acc?.status === "active") await revokeAccount(row.accountId, actor);
      }
      log(`  ${label}: ${r.replayed ? "already there" : (row?.state ?? "queued")}${a.revoke ? " (revoked)" : ""}`);
    } catch (e) {
      const why = e instanceof ProvisioningError ? `${e.code}: ${e.message}` : (e as Error).message;
      log(`  ! ${label}: ${why}`);
    }
  }
}

async function createReports(bySlug: Map<string, Server>) {
  for (const r of DEMO_REPORTS) {
    const [exists] = await db().select({ id: serverReports.id }).from(serverReports).where(eq(serverReports.message, r.message)).limit(1);
    if (exists) continue;
    const [p] = await db().select({ id: protocols.id }).from(protocols).where(eq(protocols.slug, r.protocol)).limit(1);
    await db()
      .insert(serverReports)
      .values({
        serverId: bySlug.get(r.server)?.id ?? null,
        protocolId: p?.id ?? null,
        category: r.category,
        message: r.message,
        contactEmail: r.contactEmail,
      });
    log(`  report: ${r.message.slice(0, 60)}…`);
  }
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("demo:seed is for development only (NODE_ENV=production).");
  const e = env();
  if (!e.ALLOW_INSECURE_NODE_HTTP || !e.ALLOW_PRIVATE_NODE_ADDRESSES) {
    throw new Error("Set ALLOW_INSECURE_NODE_HTTP=true and ALLOW_PRIVATE_NODE_ADDRESSES=true in .env (the demo nodes are plain HTTP on 127.0.0.1).");
  }

  const seeded = await seedProtocols();
  if (seeded.created.length) log(`Created protocols: ${seeded.created.join(", ")}`);
  await applySettings();
  await removeLocalLeftovers();

  log("Servers:");
  const bySlug = new Map<string, Server>();
  for (const node of DEMO_FLEET) {
    for (const h of node.hosts) {
      const s = await setupServer(node, h);
      if (s) bySlug.set(h.slug, s);
    }
  }
  log("Accounts:");
  await createAccounts(bySlug);
  await applyUsage(bySlug);
  log("Reports:");
  await createReports(bySlug);
  log(
    "\nDone. Keep `npm run demo:nodes` running, start `npm run worker` (health checks, account creation) and `npm run dev`.\n" +
      "Admin login: ADMIN_PASSWORD='…' npm run admin:create -- --email admin@example.com --name Admin --role super_admin",
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeAllNodeAgents();
    await closeQueue();
    await closeRedis();
    await closeDb();
  });
