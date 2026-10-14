import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  protocols,
  serverCredentials,
  serverProtocols,
  servers,
  vpnAccounts,
  type Server,
  type ServerLifecycle,
} from "@/server/db/schema";
import { countryName } from "@/lib/countries";
import { audit, type AuditActor } from "@/server/audit";
import { encryptSecret, EncryptionContext } from "@/server/crypto/encryption";
import { UserFacingError } from "@/server/errors";
import { logEvent } from "@/server/logging/events";
import { assertNodeAddressAllowed } from "@/server/nodes/net-guard";
import { closeAllNodeAgents } from "@/server/nodes/transport";
import { refreshServerStatus } from "./status";
import type { ConnectionInput, ServerDetailsInput } from "./validation";

async function requireServer(id: string): Promise<Server> {
  const [s] = await db().select().from(servers).where(and(eq(servers.id, id), isNull(servers.deletedAt))).limit(1);
  if (!s) throw new UserFacingError("Server not found.", "NOT_FOUND");
  return s;
}

function checkAddress(ip: string) {
  try {
    assertNodeAddressAllowed(ip);
  } catch (e) {
    throw new UserFacingError((e as Error).message, "ADDRESS_BLOCKED");
  }
}

async function assertNameAvailable(name: string, exceptId?: string) {
  const rows = await db()
    .select({ id: servers.id })
    .from(servers)
    .where(and(sql`lower(${servers.name}) = ${name.toLowerCase()}`, isNull(servers.deletedAt)));
  if (rows.some((r) => r.id !== exceptId)) throw new UserFacingError(`A server named "${name}" already exists.`, "NAME_TAKEN");
}

async function assertSlugAvailable(slug: string, exceptId?: string) {
  const rows = await db()
    .select({ id: servers.id })
    .from(servers)
    .where(and(eq(servers.slug, slug), isNull(servers.deletedAt)));
  if (rows.some((r) => r.id !== exceptId)) throw new UserFacingError(`The URL name "${slug}" is already used by another server.`, "SLUG_TAKEN");
}

/** Next free "<country code><n>" slug, e.g. de1, de2. */
export async function nextServerSlug(countryCode: string): Promise<string> {
  const prefix = countryCode.toLowerCase();
  const rows = await db()
    .select({ slug: servers.slug })
    .from(servers)
    .where(and(sql`${servers.slug} ~ ${`^${prefix}[0-9]+$`}`, isNull(servers.deletedAt)));
  const used = new Set(rows.map((r) => Number(r.slug.slice(prefix.length))));
  let n = 1;
  while (used.has(n)) n++;
  return `${prefix}${n}`;
}

function credentialValues(serverId: string, c: ConnectionInput, secret: string) {
  return {
    serverId,
    authMethod: c.authMethod,
    keyId: c.keyId,
    secretEncrypted: encryptSecret(secret, EncryptionContext.serverSecret(serverId)),
    tlsMode: c.tlsMode,
    tlsServerName: c.tlsServerName,
    caCertificatePem: c.tlsMode === "custom_ca" ? c.caCertificatePem : null,
    pinnedFingerprintSha256:
      c.tlsMode === "pinned_fingerprint" ? (c.pinnedFingerprintSha256 ?? "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase() : null,
    clientCertificatePem: c.clientCertificatePem,
    clientKeyEncrypted: c.clientKeyPem ? encryptSecret(c.clientKeyPem, EncryptionContext.serverClientKey(serverId)) : null,
  };
}

/** Step 1 of "Add Server": store the server as a draft (never public) with encrypted credentials. */
export async function createServerDraft(details: ServerDetailsInput, conn: ConnectionInput, actor: AuditActor): Promise<Server> {
  checkAddress(details.ipAddress);
  await assertNameAvailable(details.name);
  if (!conn.apiSecret) throw new UserFacingError("API key / token is required.");
  const slug = details.slug ?? (await nextServerSlug(details.countryCode));
  if (details.slug) await assertSlugAvailable(slug);

  const server = await db().transaction(async (tx) => {
    const [s] = await tx
      .insert(servers)
      .values({
        name: details.name,
        slug,
        hostname: details.hostname,
        ipAddress: details.ipAddress,
        country: countryName(details.countryCode),
        countryCode: details.countryCode,
        city: details.city,
        region: details.region,
        provider: details.provider,
        apiPort: details.apiPort,
        apiBasePath: details.apiBasePath,
        driver: details.driver,
        maxAccounts: details.maxAccounts,
        notes: details.notes,
        lifecycle: "draft",
        status: "pending",
        createdBy: actor.adminId,
      })
      .returning();
    await tx.insert(serverCredentials).values({ ...credentialValues(s!.id, conn, conn.apiSecret!), createdBy: actor.adminId });
    return s!;
  });

  await logEvent({
    event: "server.added",
    status: "success",
    serverId: server.id,
    adminId: actor.adminId,
    message: `Server ${server.name} added (${server.hostname}).`,
    details: { country: server.countryCode, driver: server.driver, authMethod: conn.authMethod, tlsMode: conn.tlsMode },
  });
  await audit(actor, "server.create", { targetType: "server", targetId: server.id, details: { name: server.name, hostname: server.hostname } });
  return server;
}

export async function updateServerDetails(id: string, details: ServerDetailsInput, actor: AuditActor): Promise<Server> {
  const before = await requireServer(id);
  checkAddress(details.ipAddress);
  await assertNameAvailable(details.name, id);
  if (details.slug && details.slug !== before.slug) await assertSlugAvailable(details.slug, id);
  const updated = await db().transaction(async (tx) => {
    const [s] = await tx
      .update(servers)
      .set({
        name: details.name,
        slug: details.slug ?? before.slug,
        hostname: details.hostname,
        ipAddress: details.ipAddress,
        country: countryName(details.countryCode),
        countryCode: details.countryCode,
        city: details.city,
        region: details.region,
        provider: details.provider,
        apiPort: details.apiPort,
        apiBasePath: details.apiBasePath,
        driver: details.driver,
        maxAccounts: details.maxAccounts,
        notes: details.notes,
      })
      .where(eq(servers.id, id))
      .returning();
    await refreshServerStatus(tx, id);
    return s!;
  });
  // Address changes must not reuse pooled connections to the old address.
  if (before.ipAddress !== updated.ipAddress || before.hostname !== updated.hostname || before.apiPort !== updated.apiPort) {
    await closeAllNodeAgents();
  }
  const changed = Object.keys(details).filter(
    (k) => String((before as Record<string, unknown>)[k] ?? "") !== String((details as Record<string, unknown>)[k] ?? ""),
  );
  await logEvent({ event: "server.updated", status: "success", serverId: id, adminId: actor.adminId, message: `Server ${updated.name} updated.`, details: { changed } });
  await audit(actor, "server.update", { targetType: "server", targetId: id, details: { changed } });
  return updated;
}

/** Replace the active credential (rotation). A blank secret keeps the current one. */
export async function updateServerConnection(id: string, conn: ConnectionInput, actor: AuditActor): Promise<void> {
  const server = await requireServer(id);
  await db().transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(serverCredentials)
      .where(and(eq(serverCredentials.serverId, id), isNull(serverCredentials.revokedAt)))
      .for("update");
    let values = conn.apiSecret ? credentialValues(id, conn, conn.apiSecret) : null;
    if (!values) {
      if (!current) throw new UserFacingError("Enter the API key / token.");
      values = {
        ...credentialValues(id, { ...conn, clientKeyPem: null }, "placeholder"),
        secretEncrypted: current.secretEncrypted,
        clientKeyEncrypted: conn.clientKeyPem
          ? encryptSecret(conn.clientKeyPem, EncryptionContext.serverClientKey(id))
          : conn.clientCertificatePem
            ? current.clientKeyEncrypted
            : null,
      };
    }
    if (current) await tx.update(serverCredentials).set({ revokedAt: new Date() }).where(eq(serverCredentials.id, current.id));
    await tx.insert(serverCredentials).values({
      ...values,
      version: (current?.version ?? 0) + 1,
      createdBy: actor.adminId,
      rotatedAt: current ? new Date() : null,
    });
  });
  await closeAllNodeAgents();
  await logEvent({
    event: "server.credentials_rotated",
    status: "success",
    serverId: id,
    adminId: actor.adminId,
    message: `Connection settings for ${server.name} updated${conn.apiSecret ? " (new secret)" : ""}.`,
    details: { authMethod: conn.authMethod, tlsMode: conn.tlsMode },
  });
  await audit(actor, "server.credentials_update", { targetType: "server", targetId: id, details: { newSecret: !!conn.apiSecret, tlsMode: conn.tlsMode } });
}

/** Make a verified draft (or disabled server) available to the public. */
export async function publishServer(id: string, actor: AuditActor): Promise<void> {
  const server = await requireServer(id);
  if (server.compatibility === "unsupported") {
    throw new UserFacingError("The server script is not compatible with this website. Update the script, then sync again.");
  }
  if (!server.lastSuccessfulConnectionAt || server.healthStatus === "offline" || server.healthStatus === "unknown") {
    throw new UserFacingError("Connect to the server successfully before publishing it.");
  }
  const [{ count }] = (await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(serverProtocols)
    .innerJoin(protocols, eq(protocols.id, serverProtocols.protocolId))
    .where(and(eq(serverProtocols.serverId, id), eq(serverProtocols.enabled, true), eq(serverProtocols.detected, true)))) as [
    { count: number },
  ];
  if (count === 0) throw new UserFacingError("Enable at least one detected protocol before publishing.");

  await db().transaction(async (tx) => {
    await tx.update(servers).set({ lifecycle: "active", publishedAt: server.publishedAt ?? new Date() }).where(eq(servers.id, id));
    await refreshServerStatus(tx, id);
  });
  await logEvent({ event: "server.published", status: "success", serverId: id, adminId: actor.adminId, message: `Server ${server.name} published with ${count} protocol(s).` });
  await audit(actor, "server.publish", { targetType: "server", targetId: id });
}

const LIFECYCLE_TRANSITIONS: Record<ServerLifecycle, ServerLifecycle[]> = {
  draft: ["disabled"],
  active: ["maintenance", "disabled"],
  maintenance: ["active", "disabled"],
  disabled: ["active", "maintenance"],
};

/** Maintenance / disable / re-enable. Existing accounts keep working; only new creation is affected. */
export async function setServerLifecycle(id: string, target: ServerLifecycle, actor: AuditActor): Promise<void> {
  const server = await requireServer(id);
  if (server.lifecycle === target) return;
  if (!LIFECYCLE_TRANSITIONS[server.lifecycle].includes(target)) {
    throw new UserFacingError(
      server.lifecycle === "draft" ? "Publish the server first." : `Cannot change a ${server.lifecycle} server to ${target}.`,
    );
  }
  if (target === "active" && !server.publishedAt) throw new UserFacingError("This server was never published. Use Publish instead.");
  if (target === "active" && server.compatibility === "unsupported") {
    throw new UserFacingError("The server script is not compatible. Update it and sync before re-enabling.");
  }
  await db().transaction(async (tx) => {
    await tx.update(servers).set({ lifecycle: target }).where(eq(servers.id, id));
    await refreshServerStatus(tx, id);
  });
  await logEvent({
    event: "server.lifecycle_changed",
    status: "success",
    level: target === "active" ? "info" : "warning",
    serverId: id,
    adminId: actor.adminId,
    message: `Server ${server.name}: ${server.lifecycle} → ${target}.`,
  });
  await audit(actor, "server.lifecycle", { targetType: "server", targetId: id, details: { from: server.lifecycle, to: target } });
}

/** Per-server protocol switches and capacity. Only detected protocols can be enabled. */
export async function updateServerProtocols(
  id: string,
  updates: { protocolId: string; enabled: boolean; maxAccounts: number | null; quotaLimit?: number | null }[],
  actor: AuditActor,
): Promise<void> {
  const server = await requireServer(id);
  const rows = await db()
    .select({ sp: serverProtocols, name: protocols.name })
    .from(serverProtocols)
    .innerJoin(protocols, eq(protocols.id, serverProtocols.protocolId))
    .where(and(eq(serverProtocols.serverId, id), inArray(serverProtocols.protocolId, updates.map((u) => u.protocolId))));
  const byProtocol = new Map(rows.map((r) => [r.sp.protocolId, r]));
  const changes: Record<string, unknown>[] = [];

  await db().transaction(async (tx) => {
    for (const u of updates) {
      const row = byProtocol.get(u.protocolId);
      if (!row) continue;
      if (u.enabled && !row.sp.detected) {
        throw new UserFacingError(`${row.name} was not detected on this server. Install it on the server, then sync.`);
      }
      const quotaLimit = u.quotaLimit === undefined ? row.sp.quotaLimit : u.quotaLimit;
      if (row.sp.enabled === u.enabled && row.sp.maxAccounts === u.maxAccounts && row.sp.quotaLimit === quotaLimit) continue;
      await tx
        .update(serverProtocols)
        .set({ enabled: u.enabled, maxAccounts: u.maxAccounts, quotaLimit })
        .where(eq(serverProtocols.id, row.sp.id));
      changes.push({ protocol: row.name, enabled: u.enabled, maxAccounts: u.maxAccounts, quotaLimit });
    }
  });
  if (changes.length === 0) return;
  await logEvent({
    event: "server.protocols_updated",
    status: "success",
    serverId: id,
    adminId: actor.adminId,
    message: `Protocols updated on ${server.name}.`,
    details: { changes },
  });
  await audit(actor, "server.protocols_update", { targetType: "server", targetId: id, details: { changes } });
}

export async function countLiveAccounts(serverId: string): Promise<number> {
  const [{ count }] = (await db()
    .select({ count: sql<number>`count(*)::int` })
    .from(vpnAccounts)
    .where(and(eq(vpnAccounts.serverId, serverId), inArray(vpnAccounts.status, ["pending", "active"])))) as [{ count: number }];
  return count;
}

/**
 * Soft-delete: the server disappears everywhere and its credentials are revoked. Account history
 * is kept. The confirmation must repeat the server name exactly.
 */
export async function deleteServer(id: string, confirmName: string, actor: AuditActor): Promise<void> {
  const server = await requireServer(id);
  if (confirmName.trim() !== server.name) throw new UserFacingError("Type the server name exactly to confirm deletion.");
  const live = await countLiveAccounts(id);
  await db().transaction(async (tx) => {
    await tx
      .update(servers)
      .set({ deletedAt: new Date(), lifecycle: "disabled", status: "disabled" })
      .where(eq(servers.id, id));
    await tx
      .update(serverCredentials)
      .set({ revokedAt: new Date() })
      .where(and(eq(serverCredentials.serverId, id), isNull(serverCredentials.revokedAt)));
  });
  await closeAllNodeAgents();
  await logEvent({
    event: "server.deleted",
    status: "success",
    level: "warning",
    serverId: id,
    adminId: actor.adminId,
    message: `Server ${server.name} deleted${live ? ` (${live} live account(s) remain on the node)` : ""}.`,
  });
  await audit(actor, "server.delete", { targetType: "server", targetId: id, details: { name: server.name, liveAccounts: live } });
}
