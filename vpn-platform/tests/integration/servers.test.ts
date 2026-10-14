import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { protocols, serverCredentials, servers } from "@/server/db/schema";
import { getStatusPage } from "@/server/public/catalog";
import { setProtocolEnabled } from "@/server/protocols/service";
import { syncServer, testConnection } from "@/server/servers/sync";
import {
  deleteServer,
  publishServer,
  setServerLifecycle,
  updateServerConnection,
  updateServerProtocols,
} from "@/server/servers/service";
import { actor, createServer, listedServers, resetDatabase, SECRET, startNode, teardown } from "../helpers";
import { clearPublicCache } from "@/server/public/cache";

const names = async (slug: string) => (await listedServers(slug)).map((s) => s.name);
const protocolId = async (slug: string) => (await db().select().from(protocols).where(eq(protocols.slug, slug)))[0]!.id;

describe("server management & auto-publishing", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  beforeAll(async () => {
    await resetDatabase();
    node = await startNode({ protocols: ["ssh", "ssh-ws", "vless", "vmess", "trojan", "tuic"] });
  });
  afterAll(async () => {
    await node.close();
    await teardown();
  });

  it("stores the API secret encrypted, never in plaintext", async () => {
    const s = await createServer(node.port, { name: "Secret Check" });
    const [cred] = await db().select().from(serverCredentials).where(eq(serverCredentials.serverId, s.id));
    expect(cred!.secretEncrypted).toMatch(/^v1\./);
    expect(cred!.secretEncrypted).not.toContain(SECRET);
  });

  it("add → connect → detect → publish → listed on every enabled protocol page", async () => {
    const s = await createServer(node.port, { name: "Singapore 01" });
    expect(s.status).toBe("pending");
    expect(await names("vless")).not.toContain("Singapore 01"); // drafts are never public

    const r = await syncServer(s.id, actor);
    expect(r.ok).toBe(true);
    expect(r.compatibility).toBe("compatible");
    expect(r.unmapped).toEqual(["tuic"]);
    expect(r.protocols.filter((p) => p.detected).map((p) => p.slug).sort()).toEqual(["ssh", "ssh-websocket", "trojan", "vless", "vmess"]);
    expect(r.protocols.every((p) => p.enabled)).toBe(true); // drafts auto-enable detected protocols

    await publishServer(s.id, actor);
    for (const slug of ["ssh", "ssh-websocket", "vless", "vmess", "trojan"]) expect(await names(slug)).toContain("Singapore 01");
    for (const slug of ["openvpn", "wireguard", "shadowsocks"]) expect(await names(slug)).not.toContain("Singapore 01");

    const listing = await listedServers("vless");
    const entry = listing.find((x) => x.name === "Singapore 01")!;
    expect(entry.availability).toBe("available");
    expect(entry.otherProtocols.map((p) => p.slug)).toEqual(expect.arrayContaining(["ssh", "vmess"]));
    expect(JSON.stringify(listing)).not.toMatch(/127\.0\.0\.1|mock-key|apiPort|api_port/); // no internal details leak
  });

  it("per-server and global protocol switches hide servers immediately", async () => {
    const [s] = await db().select().from(servers).where(eq(servers.name, "Singapore 01"));
    await updateServerProtocols(s!.id, [{ protocolId: await protocolId("trojan"), enabled: false, maxAccounts: null }], actor);
    expect(await names("trojan")).not.toContain("Singapore 01");
    expect(await names("vless")).toContain("Singapore 01");

    await setProtocolEnabled(await protocolId("vmess"), false, actor);
    expect(await names("vmess")).toEqual([]);
    await setProtocolEnabled(await protocolId("vmess"), true, actor);
    expect(await names("vmess")).toContain("Singapore 01");
  });

  it("refuses to enable a protocol the server does not have", async () => {
    const [s] = await db().select().from(servers).where(eq(servers.name, "Singapore 01"));
    await syncServer(s!.id); // creates no row for wireguard; insert one by detecting & removing
    node.state.protocols.push("wireguard");
    await syncServer(s!.id);
    node.state.protocols = node.state.protocols.filter((p) => p !== "wireguard");
    await syncServer(s!.id);
    await expect(
      updateServerProtocols(s!.id, [{ protocolId: await protocolId("wireguard"), enabled: true, maxAccounts: null }], actor),
    ).rejects.toThrow(/not detected/);
  });

  it("sync detects newly installed protocols as available but not enabled", async () => {
    const [s] = await db().select().from(servers).where(eq(servers.name, "Singapore 01"));
    node.state.protocols.push("wireguard");
    const r = await syncServer(s!.id, actor);
    expect(r.added).toEqual(["WireGuard"]);
    const wg = r.protocols.find((p) => p.slug === "wireguard")!;
    expect(wg).toMatchObject({ detected: true, enabled: false });
    expect(await names("wireguard")).not.toContain("Singapore 01");

    await updateServerProtocols(s!.id, [{ protocolId: wg.protocolId, enabled: true, maxAccounts: 5 }], actor);
    expect(await names("wireguard")).toContain("Singapore 01");
  });

  it("protocols that disappear stop being offered, and come back enabled when reinstalled", async () => {
    const [s] = await db().select().from(servers).where(eq(servers.name, "Singapore 01"));
    node.state.protocols = node.state.protocols.filter((p) => p !== "vless");
    const r = await syncServer(s!.id, actor);
    expect(r.removed).toEqual(["VLESS"]);
    expect(await names("vless")).not.toContain("Singapore 01");
    node.state.protocols.push("vless");
    await syncServer(s!.id, actor);
    expect(await names("vless")).toContain("Singapore 01");
  });

  it("maintenance keeps the server listed but unavailable; disable removes it", async () => {
    const [s] = await db().select().from(servers).where(eq(servers.name, "Singapore 01"));
    await setServerLifecycle(s!.id, "maintenance", actor);
    const m = (await listedServers("ssh")).find((x) => x.id === s!.id)!;
    expect(m).toMatchObject({ status: "maintenance", availability: "maintenance" });
    await setServerLifecycle(s!.id, "disabled", actor);
    expect(await names("ssh")).not.toContain("Singapore 01");
    await setServerLifecycle(s!.id, "active", actor);
    expect(await names("ssh")).toContain("Singapore 01");
  });

  it("an unreachable server goes offline and is no longer offered; recovery restores it", async () => {
    const [s] = await db().select().from(servers).where(eq(servers.name, "Singapore 01"));
    await updateServerConnection(
      s!.id,
      { authMethod: "hmac_sha256", keyId: "mock-key", apiSecret: "wrong-secret-0123456789", tlsMode: "insecure_http", tlsServerName: null, caCertificatePem: null, pinnedFingerprintSha256: null, clientCertificatePem: null, clientKeyPem: null },
      actor,
    );
    const failed = await testConnection(s!.id);
    expect(failed.ok).toBe(false);
    expect(failed.error?.message).toMatch(/rejected our credentials/);
    expect(await names("ssh")).not.toContain("Singapore 01");
    clearPublicCache();
    const status = await getStatusPage();
    expect(status.sections.flatMap((x) => x.servers).find((x) => x.id === s!.id)?.status).toBe("offline");

    await updateServerConnection(
      s!.id,
      { authMethod: "hmac_sha256", keyId: "mock-key", apiSecret: SECRET, tlsMode: "insecure_http", tlsServerName: null, caCertificatePem: null, pinnedFingerprintSha256: null, clientCertificatePem: null, clientKeyPem: null },
      actor,
    );
    expect((await testConnection(s!.id)).ok).toBe(true);
    expect(await names("ssh")).toContain("Singapore 01");
  });

  it("an incompatible script blocks publishing", async () => {
    const old = await startNode({ apiVersion: "2.0", protocols: ["ssh"] });
    try {
      const s = await createServer(old.port, { name: "Future API" });
      const r = await syncServer(s.id);
      expect(r.compatibility).toBe("unsupported");
      await expect(publishServer(s.id, actor)).rejects.toThrow(/not compatible/);
    } finally {
      await old.close();
    }
  });

  it("flags an outdated script without blocking it", async () => {
    const old = await startNode({ agentVersion: "0.9.0", protocols: ["ssh"] });
    try {
      const s = await createServer(old.port, { name: "Old Script" });
      const r = await syncServer(s.id);
      expect(r.compatibility).toBe("outdated");
      await publishServer(s.id, actor);
      expect(await names("ssh")).toContain("Old Script");
    } finally {
      await old.close();
    }
  });

  it("delete requires the exact name and revokes credentials", async () => {
    const s = await createServer(node.port, { name: "To Delete" });
    await expect(deleteServer(s.id, "to delete", actor)).rejects.toThrow(/exactly/);
    await deleteServer(s.id, "To Delete", actor);
    const [row] = await db().select().from(servers).where(eq(servers.id, s.id));
    expect(row!.deletedAt).not.toBeNull();
    const creds = await db().select().from(serverCredentials).where(eq(serverCredentials.serverId, s.id));
    expect(creds.every((c) => c.revokedAt)).toBe(true);
  });
});
