import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { protocols, serverProtocols, servers, vpnAccounts } from "@/server/db/schema";
import { clearPublicCache } from "@/server/public/cache";
import {
  getCountryPage,
  getProtocolPage,
  getPublicSiteSettings,
  getServerPage,
  getSiteStats,
  getStatusPage,
  listProtocolSummaries,
  listSitemapEntries,
} from "@/server/public/catalog";
import { quotaWindow } from "@/server/provisioning/quota";
import { setProtocolEnabled } from "@/server/protocols/service";
import { publishServer, setServerLifecycle } from "@/server/servers/service";
import { refreshServerStatus } from "@/server/servers/status";
import { syncServer } from "@/server/servers/sync";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";
import { actor, createServer, resetDatabase, setSettings, startNode, teardown } from "../helpers";

async function protocolId(slug: string) {
  return (await db().select().from(protocols).where(eq(protocols.slug, slug)))[0]!.id;
}

async function sp(serverId: string, slug: string) {
  const pid = await protocolId(slug);
  const [row] = await db()
    .select()
    .from(serverProtocols)
    .where(and(eq(serverProtocols.serverId, serverId), eq(serverProtocols.protocolId, pid)));
  return row!;
}

async function setSp(serverId: string, slug: string, values: Partial<typeof serverProtocols.$inferInsert>) {
  const row = await sp(serverId, slug);
  await db().update(serverProtocols).set(values).where(eq(serverProtocols.id, row.id));
  clearPublicCache();
}

async function setServer(serverId: string, values: Partial<typeof servers.$inferInsert>) {
  await db().update(servers).set(values).where(eq(servers.id, serverId));
  await refreshServerStatus(db(), serverId);
  clearPublicCache();
}

describe("public catalogue", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    await resetDatabase();
    node = await startNode({ protocols: ["ssh", "ssh-ssl", "vless", "vmess", "hysteria2"] });
    const specs = [
      { key: "de2", name: "Germany 02", countryCode: "DE", city: "Frankfurt", region: "Europe" },
      { key: "de1", name: "Germany 01", countryCode: "DE", city: "Berlin", region: "Europe" },
      { key: "jp1", name: "Japan 01", countryCode: "JP", city: "Tokyo", region: "Asia" },
      { key: "gb1", name: "London 01", countryCode: "GB", city: "London", region: "Europe" },
    ];
    for (const spec of specs) {
      const s = await createServer(node.port, { name: spec.name, countryCode: spec.countryCode, city: spec.city, region: spec.region, hostname: `${spec.key}.vpn.example` });
      await syncServer(s.id);
      await publishServer(s.id, actor);
      ids[spec.key] = s.id;
    }
    // A draft is never public.
    const draft = await createServer(node.port, { name: "Finland 01", countryCode: "FI" });
    await syncServer(draft.id);
    ids.fi1 = draft.id;
  });
  beforeEach(async () => {
    clearPublicCache();
  });
  afterAll(async () => {
    await node.close();
    await teardown();
  });

  it("assigns country-code slugs and builds canonical hrefs", async () => {
    const [de1] = await db().select().from(servers).where(eq(servers.id, ids.de1!));
    const [de2] = await db().select().from(servers).where(eq(servers.id, ids.de2!));
    expect([de1!.slug, de2!.slug].sort()).toEqual(["de1", "de2"]);
    const page = await getCountryPage("vless", "germany");
    expect(page!.country).toEqual({ code: "DE", slug: "germany", name: "Germany" });
    expect(page!.servers.map((s) => s.name)).toEqual(["Germany 01", "Germany 02"]); // ordered by name
    const card = page!.servers[0]!;
    expect(card.href).toBe(`/vless/germany/${card.slug}`);
    expect(card.otherProtocols.map((p) => p.slug)).toEqual(["ssh", "ssh-ssl", "vmess", "hysteria2"]);
    expect(card.ports).toEqual({ tls: [443], none: [80] });
    expect(card.transports).toEqual(["ws", "grpc"]);
    expect((await getCountryPage("vless", "united-kingdom"))!.servers.map((s) => s.name)).toEqual(["London 01"]);
  });

  it("lists protocols with servers, countries ordered by name", async () => {
    const list = await listProtocolSummaries();
    expect(list.map((p) => p.slug)).toEqual(["ssh", "ssh-ssl", "vmess", "vless", "hysteria2"]);
    const vless = list.find((p) => p.slug === "vless")!;
    expect(vless).toMatchObject({ serverCount: 4, availableCount: 4, href: "/vless" });
    expect(vless.countries.map((c) => c.name)).toEqual(["Germany", "Japan", "United Kingdom"]);

    const page = await getProtocolPage("vless");
    expect(page!.protocol.fields.map((f) => f.key)).toEqual(["username", "transport", "sni_bug", "sni_type", "duration"]);
    expect(page!.countries.map((c) => [c.slug, c.serverCount, c.availability, c.href])).toEqual([
      ["germany", 2, "available", "/vless/germany"],
      ["japan", 1, "available", "/vless/japan"],
      ["united-kingdom", 1, "available", "/vless/united-kingdom"],
    ]);
    expect(page!.countries[0]!.region).toBe("Europe");
  });

  it("returns null for unknown or disabled protocols, countries and servers", async () => {
    expect(await getProtocolPage("nope")).toBeNull();
    expect(await getProtocolPage("../etc")).toBeNull();
    expect(await getProtocolPage("openvpn")).not.toBeNull(); // enabled but no servers: empty page
    expect((await getProtocolPage("openvpn"))!.countries).toEqual([]);
    expect(await getCountryPage("vless", "atlantis")).toBeNull();
    expect(await getCountryPage("vless", "finland")).toBeNull(); // only a draft there
    expect(await getCountryPage("openvpn", "germany")).toBeNull();
    const de1 = (await db().select().from(servers).where(eq(servers.id, ids.de1!)))[0]!;
    expect(await getServerPage("vless", "germany", de1.slug)).not.toBeNull();
    expect(await getServerPage("vless", "japan", de1.slug)).toBeNull(); // wrong country
    expect(await getServerPage("vless", "germany", "zz9")).toBeNull();
    expect(await getServerPage("vless", "germany", "DE1!")).toBeNull();
    expect(await getServerPage("openvpn", "germany", de1.slug)).toBeNull();

    await setProtocolEnabled(await protocolId("vmess"), false, actor);
    clearPublicCache();
    expect(await getProtocolPage("vmess")).toBeNull();
    expect((await listProtocolSummaries()).map((p) => p.slug)).not.toContain("vmess");
    await setProtocolEnabled(await protocolId("vmess"), true, actor);
  });

  it("capacity = min(server cap, protocol cap, quota) with the binding limit", async () => {
    const id = ids.jp1!;
    const settings = DEFAULT_SITE_SETTINGS;
    const window = quotaWindow(new Date(), settings.quota.resetTimes, settings.quota.timezone);
    await setServer(id, { maxAccounts: 10, currentAccounts: 3 });
    const card = async () => (await getCountryPage("vless", "japan"))!.servers[0]!;

    // Only the server cap.
    expect((await card()).capacity).toEqual({ remaining: 7, limit: 10, quotaResetsAt: null });
    // Protocol cap binds.
    await setSp(id, "vless", { maxAccounts: 4, currentAccounts: 2 });
    expect((await card()).capacity).toEqual({ remaining: 2, limit: 4, quotaResetsAt: null });
    // Quota in the current window binds; the limit is the quota.
    await setSp(id, "vless", { maxAccounts: null, currentAccounts: 0, quotaLimit: 5, quotaUsed: 4, quotaWindowStart: window.start });
    expect((await card()).capacity).toEqual({ remaining: 1, limit: 5, quotaResetsAt: window.end.toISOString() });
    // A stale window counts as unused (lazy reset).
    await setSp(id, "vless", { quotaWindowStart: new Date(window.start.getTime() - 86_400_000) });
    expect((await card()).capacity).toEqual({ remaining: 5, limit: 5, quotaResetsAt: window.end.toISOString() });
    // Server cap below the quota.
    await setServer(id, { currentAccounts: 8 });
    expect((await card()).capacity).toEqual({ remaining: 2, limit: 5, quotaResetsAt: window.end.toISOString() });

    // Quota used up → full (still listed), with the reset time.
    await setServer(id, { currentAccounts: 0 });
    await setSp(id, "vless", { quotaUsed: 5, quotaWindowStart: window.start });
    const full = await card();
    expect(full.availability).toBe("full");
    expect(full.capacity.remaining).toBe(0);
    const summary = (await getProtocolPage("vless"))!.countries.find((c) => c.code === "JP")!;
    expect(summary).toMatchObject({ availability: "full", availableCount: 0, remaining: 0 });
    await setSp(id, "vless", { quotaLimit: null, quotaUsed: 0 });
  });

  it("availability precedence: maintenance > offline > service_stopped > full > available", async () => {
    const id = ids.gb1!;
    const card = async () => (await getStatusPage()).sections.find((s) => s.protocol.slug === "vless")!.servers.find((s) => s.id === id)!;

    await setSp(id, "vless", { serviceStatus: "stopped" });
    expect((await card()).availability).toBe("service_stopped");
    await setServer(id, { maxAccounts: 1, currentAccounts: 1 }); // server full AND service stopped
    expect((await card()).availability).toBe("service_stopped");
    await setSp(id, "vless", { serviceStatus: "running" });
    expect((await card()).availability).toBe("full");
    expect((await card()).status).toBe("full");

    await setServer(id, { healthStatus: "offline" });
    expect((await card()).availability).toBe("offline");
    // Offline servers leave the browse pages but stay on the status page and keep their server page;
    // the country page itself stays (empty state) so the URL does not turn into a 404.
    expect((await getCountryPage("vless", "united-kingdom"))!.servers).toEqual([]);
    expect((await getProtocolPage("vless"))!.countries.map((c) => c.slug)).not.toContain("united-kingdom");
    const slug = (await card()).slug;
    expect((await getServerPage("vless", "united-kingdom", slug))!.server.availability).toBe("offline");

    await setServerLifecycle(id, "maintenance", actor);
    clearPublicCache();
    expect((await card()).availability).toBe("maintenance");
    expect((await getCountryPage("vless", "united-kingdom"))!.servers[0]!.availability).toBe("maintenance");

    await setServerLifecycle(id, "disabled", actor);
    clearPublicCache();
    expect(await card()).toBeUndefined();
    await setServerLifecycle(id, "active", actor);
    await setServer(id, { healthStatus: "online", maxAccounts: 100, currentAccounts: 0 });
    expect((await card()).availability).toBe("available");
  });

  it("a country's remaining slots count only servers that can create accounts", async () => {
    const germany = async () => (await getProtocolPage("ssh"))!.countries.find((c) => c.code === "DE")!;
    const remainingOf = async (id: string) => (await getCountryPage("ssh", "germany"))!.servers.find((s) => s.id === id)!.capacity.remaining!;
    const both = (await remainingOf(ids.de1!)) + (await remainingOf(ids.de2!));
    expect((await germany()).remaining).toBe(both);

    await setServerLifecycle(ids.de2!, "maintenance", actor);
    clearPublicCache();
    expect(await germany()).toMatchObject({ serverCount: 2, availableCount: 1, availability: "available", remaining: await remainingOf(ids.de1!) });
    await setServerLifecycle(ids.de2!, "active", actor);
  });

  it("latency and last check come from the health monitor columns", async () => {
    const checkedAt = new Date("2026-10-14T10:00:00Z");
    await setServer(ids.de1!, { lastLatencyMs: 187, lastHealthCheckAt: checkedAt });
    await setServer(ids.de2!, { lastLatencyMs: 95 });
    const de1 = (await getCountryPage("vless", "germany"))!.servers.find((s) => s.id === ids.de1)!;
    expect(de1.latencyMs).toBe(187);
    expect(de1.lastCheckedAt).toBe(checkedAt.toISOString());
    expect((await getProtocolPage("vless"))!.countries.find((c) => c.code === "DE")!.bestLatencyMs).toBe(95);
  });

  it("shows the VPN hostname only when enabled, and never IPs or management details", async () => {
    await setSettings({ display: { showHostnames: true, showStats: true } });
    const shown = await getCountryPage("vless", "japan");
    expect(shown!.servers[0]!.hostname).toBe("jp1.vpn.example");
    await setSettings({ display: { showHostnames: false, showStats: true } });
    const all = JSON.stringify([await getStatusPage(), await getProtocolPage("vless"), await getCountryPage("vless", "japan"), await listProtocolSummaries()]);
    expect(all).not.toMatch(/vpn\.example|127\.0\.0\.1|mock-key|apiPort|api_port|ipAddress/);
    expect(all).not.toContain(`:${node.port}`);
    expect((await getPublicSiteSettings()).display.showHostnames).toBe(false);
    await setSettings({});
  });

  it("public site settings expose only the public subset", async () => {
    await setSettings({ siteName: "Vaultline Test", quota: { resetTimes: ["00:00", "12:00"], timezone: "Asia/Bangkok", defaultLimit: 50 } });
    const s = await getPublicSiteSettings();
    expect(s.siteName).toBe("Vaultline Test");
    expect(s.quota).toEqual({ resetTimes: ["00:00", "12:00"], timezone: "Asia/Bangkok" });
    expect(s.captchaSiteKey).toBeNull();
    expect(s).not.toHaveProperty("health");
    expect(s.display).toEqual(DEFAULT_SITE_SETTINGS.display);
    await setSettings({});
  });

  it("status page lists every published server, offline included, with totals", async () => {
    await setServer(ids.jp1!, { healthStatus: "offline" });
    const status = await getStatusPage();
    expect(status.totals).toMatchObject({ servers: 4, online: 3, offline: 1, maintenance: 0, full: 0, protocols: 5 });
    const ssh = status.sections.find((s) => s.protocol.slug === "ssh")!;
    expect(ssh.protocol).toEqual({ slug: "ssh", name: "SSH", icon: "terminal", href: "/ssh" });
    // Ordered by country, then name.
    expect(ssh.servers.map((s) => s.name)).toEqual(["Germany 01", "Germany 02", "Japan 01", "London 01"]);
    expect(ssh.servers.find((s) => s.id === ids.jp1)!.availability).toBe("offline");
    await setServer(ids.jp1!, { healthStatus: "online" });
  });

  it("site stats count activated accounts in total and since local midnight", async () => {
    const vless = await protocolId("vless");
    const ssh = await protocolId("ssh");
    const yesterday = new Date(Date.now() - 2 * 86_400_000);
    const base = { serverId: ids.de1!, durationDays: 7, holdsCapacity: false };
    await db().insert(vpnAccounts).values([
      { ...base, protocolId: vless, status: "active" },
      { ...base, protocolId: vless, status: "expired", createdAt: yesterday },
      { ...base, protocolId: ssh, status: "revoked" },
      { ...base, protocolId: ssh, status: "failed" },
      { ...base, protocolId: ssh, status: "pending" },
    ]);
    const stats = await getSiteStats();
    expect(stats.accountsTotal).toBe(3);
    expect(stats.accountsToday).toBe(2);
    expect(stats.byProtocol.find((p) => p.slug === "vless")).toEqual({ slug: "vless", name: "VLESS", total: 2, today: 1 });
    expect(stats.byProtocol.find((p) => p.slug === "ssh")).toEqual({ slug: "ssh", name: "SSH", total: 1, today: 1 });
    expect(stats.serversOnline).toBe(4);
    expect(stats.countries).toBe(3);
  });

  it("sitemap lists static pages and every listed protocol/country/server page", async () => {
    const paths = (await listSitemapEntries()).map((e) => e.path);
    expect(paths).toEqual(expect.arrayContaining(["/", "/about", "/contact", "/privacy", "/terms", "/acceptable-use", "/server-status", "/report"]));
    const de1 = (await db().select().from(servers).where(eq(servers.id, ids.de1!)))[0]!;
    expect(paths).toEqual(expect.arrayContaining(["/vless", "/vless/germany", `/vless/germany/${de1.slug}`, "/hysteria2/japan"]));
    expect(paths.some((p) => p.startsWith("/openvpn"))).toBe(false);
    expect(paths.some((p) => p.includes("finland"))).toBe(false);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("caches results for a few seconds; admin changes clear the cache at once", async () => {
    clearPublicCache();
    const before = await listProtocolSummaries();
    expect(await listProtocolSummaries()).toBe(before); // same cached object
    await setProtocolEnabled(await protocolId("ssh-ssl"), false, actor);
    expect((await listProtocolSummaries()).map((p) => p.slug)).not.toContain("ssh-ssl");
    await setProtocolEnabled(await protocolId("ssh-ssl"), true, actor);
    expect((await listProtocolSummaries()).map((p) => p.slug)).toContain("ssh-ssl");
  });
});
