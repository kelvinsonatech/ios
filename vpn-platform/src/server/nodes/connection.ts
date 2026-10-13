import { and, eq, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { serverCredentials, servers, type Server, type ServerCredential } from "@/server/db/schema";
import { decryptSecret, EncryptionContext } from "@/server/crypto/encryption";
import type { NodeDriver } from "./driver";
import { getDriverFactory } from "./drivers";
import { NodeError } from "./errors";
import type { NodeConnection } from "./transport";

export function buildNodeConnection(server: Server, cred: ServerCredential): NodeConnection {
  return {
    serverId: server.id,
    hostname: server.hostname,
    ipAddress: server.ipAddress,
    port: server.apiPort,
    basePath: server.apiBasePath,
    credentialVersion: cred.version,
    auth: {
      method: cred.authMethod,
      keyId: cred.keyId,
      secret: decryptSecret(cred.secretEncrypted, EncryptionContext.serverSecret(server.id)),
    },
    tls: {
      mode: cred.tlsMode,
      serverName: cred.tlsServerName,
      caPem: cred.caCertificatePem,
      pinnedFingerprintSha256: cred.pinnedFingerprintSha256,
      clientCertPem: cred.clientCertificatePem,
      clientKeyPem: cred.clientKeyEncrypted
        ? decryptSecret(cred.clientKeyEncrypted, EncryptionContext.serverClientKey(server.id))
        : null,
    },
  };
}

export async function getActiveCredential(serverId: string, tx: DbOrTx = db()) {
  const [cred] = await tx
    .select()
    .from(serverCredentials)
    .where(and(eq(serverCredentials.serverId, serverId), isNull(serverCredentials.revokedAt)))
    .limit(1);
  return cred ?? null;
}

/** Load a server and build its driver. Secrets are decrypted only in memory. */
export async function getNodeDriver(serverId: string): Promise<{ server: Server; driver: NodeDriver }> {
  const [server] = await db().select().from(servers).where(and(eq(servers.id, serverId), isNull(servers.deletedAt))).limit(1);
  if (!server) throw new Error("Server not found");
  const cred = await getActiveCredential(serverId);
  if (!cred) {
    throw new NodeError({
      kind: "config",
      code: "NO_CREDENTIALS",
      delivery: "not_sent",
      safeMessage: "This server has no active API credentials. Edit the server and set the API key.",
    });
  }
  const driver = getDriverFactory(server.driver)(buildNodeConnection(server, cred));
  return { server, driver };
}
