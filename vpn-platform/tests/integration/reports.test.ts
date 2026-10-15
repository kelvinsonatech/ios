import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db";
import { admins, auditLogs, serverReports } from "@/server/db/schema";
import { redis } from "@/server/redis";
import { publishServer } from "@/server/servers/service";
import { syncServer } from "@/server/servers/sync";
import { countOpenReports, createReport, deleteReport, listReports, purgeResolvedReports, ReportError, REPORTS_PAGE_SIZE, setReportStatus } from "@/server/reports/service";
import { actor, createServer, resetDatabase, startNode, teardown } from "../helpers";

let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter}`;

describe("problem reports", () => {
  let node: Awaited<ReturnType<typeof startNode>>;
  let serverId: string;
  let draftId: string;
  let adminId: string;

  beforeAll(async () => {
    await resetDatabase();
    node = await startNode({ protocols: ["ssh", "vless"] });
    const s = await createServer(node.port, { name: "Reports NL", countryCode: "NL" });
    await syncServer(s.id);
    await publishServer(s.id, actor);
    serverId = s.id;
    draftId = (await createServer(node.port, { name: "Reports draft" })).id;
    const [a] = await db().insert(admins).values({ email: "support@example.com", name: "Support", passwordHash: "x", role: "support" }).returning();
    adminId = a!.id;
  });
  beforeEach(async () => {
    await redis().flushdb();
  });
  afterAll(async () => {
    await node.close();
    await teardown();
  });

  const valid = (extra: Record<string, unknown> = {}) => ({
    serverId,
    protocol: "vless",
    category: "connection",
    message: "  Cannot connect since this morning.  ",
    contactEmail: "User@Example.com",
    ...extra,
  });

  it("stores a valid report with the IP only as a hash", async () => {
    const { id } = await createReport(valid(), "203.0.113.200");
    const [row] = await db().select().from(serverReports).where(eq(serverReports.id, id));
    expect(row).toMatchObject({ serverId, category: "connection", message: "Cannot connect since this morning.", contactEmail: "user@example.com", status: "open" });
    expect(row!.protocolId).not.toBeNull();
    expect(row!.clientIpHash).toMatch(/^[0-9a-f]{32}$/);
    expect(JSON.stringify(row)).not.toContain("203.0.113.200");
  });

  it("server and protocol are optional", async () => {
    const { id } = await createReport({ serverId: null, protocol: null, category: "other", message: "The site is great but slow.", contactEmail: "" }, nextIp());
    const [row] = await db().select().from(serverReports).where(eq(serverReports.id, id));
    expect(row).toMatchObject({ serverId: null, protocolId: null, contactEmail: null });
  });

  it("validates every field", async () => {
    const fail = async (raw: unknown) => {
      const e = await createReport(raw, nextIp()).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(ReportError);
      return (e as ReportError).fieldErrors ?? {};
    };
    expect(Object.keys(await fail(valid({ message: "too short" })))).toEqual(["message"]);
    expect(Object.keys(await fail(valid({ message: "x".repeat(2001) })))).toEqual(["message"]);
    expect(Object.keys(await fail(valid({ category: "spam" })))).toEqual(["category"]);
    expect(Object.keys(await fail(valid({ contactEmail: "not-an-email" })))).toEqual(["contactEmail"]);
    expect(Object.keys(await fail(valid({ serverId: "not-a-uuid" })))).toEqual(["serverId"]);
    expect(Object.keys(await fail(valid({ protocol: "../../x" })))).toEqual(["protocol"]);
    expect(Object.keys(await fail(valid({ extra: "field" })))).toEqual(["_form"]);
    // Existence checks: unpublished server, unknown protocol.
    expect(Object.keys(await fail(valid({ serverId: draftId })))).toEqual(["serverId"]);
    expect(Object.keys(await fail(valid({ protocol: "nosuchproto" })))).toEqual(["protocol"]);
    expect(Object.keys(await fail(valid({ serverId: "00000000-0000-4000-8000-000000000000", protocol: "nosuchproto" }))).sort()).toEqual(["protocol", "serverId"]);
  });

  it("rate-limits each client IP to 3 reports per hour", async () => {
    const ip = nextIp();
    for (let i = 0; i < 3; i++) await createReport(valid(), ip);
    const e = await createReport(valid(), ip).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "RATE_LIMITED", httpStatus: 429 });
    expect((e as ReportError).retryAfterSeconds).toBeGreaterThan(0);
    await expect(createReport(valid(), nextIp())).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("lists newest first with joins and pages of 25, resolves with audit and reopens", async () => {
    await db().delete(serverReports);
    const base = Date.now() - 3_600_000;
    await db()
      .insert(serverReports)
      .values(Array.from({ length: 30 }, (_, i) => ({ serverId, category: "slow", message: `Report number ${i}`, createdAt: new Date(base + i * 1000) })));
    const page1 = await listReports({});
    expect(page1).toMatchObject({ total: 30, pageSize: REPORTS_PAGE_SIZE });
    expect(page1.items).toHaveLength(25);
    expect(page1.items[0]!.message).toBe("Report number 29");
    expect(page1.items[0]!.server).toMatchObject({ id: serverId, name: "Reports NL", countryCode: "NL" });
    expect(page1.items[0]!.protocol).toBeNull();
    const page2 = await listReports({ page: 2 });
    expect(page2.items.map((r) => r.message)).toEqual(["Report number 4", "Report number 3", "Report number 2", "Report number 1", "Report number 0"]);
    expect(await countOpenReports()).toBe(30);

    const target = page1.items[0]!.id;
    await setReportStatus(target, "resolved", "  Restarted the service.  ", { ...actor, adminId, email: "support@example.com" });
    const resolved = (await listReports({ status: "resolved" })).items;
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ id: target, status: "resolved", adminNote: "Restarted the service.", resolvedByEmail: "support@example.com" });
    expect(resolved[0]!.resolvedAt).not.toBeNull();
    expect(await countOpenReports()).toBe(29);
    expect((await listReports({ status: "open" })).total).toBe(29);
    const audits = await db().select().from(auditLogs).where(eq(auditLogs.action, "report.resolve"));
    expect(audits.at(-1)).toMatchObject({ targetId: target, adminId });

    await setReportStatus(target, "open", null, actor);
    const [row] = await db().select().from(serverReports).where(eq(serverReports.id, target));
    expect(row).toMatchObject({ status: "open", resolvedBy: null, resolvedAt: null, adminNote: null });
    await expect(setReportStatus("00000000-0000-4000-8000-000000000000", "resolved", null, actor)).rejects.toThrow(/not found/);
  });

  it("deletes a report on request and purges resolved reports after the retention period", async () => {
    await db().delete(serverReports);
    const [a, b, c] = await db()
      .insert(serverReports)
      .values([
        { serverId, category: "slow", message: "Old resolved report", contactEmail: "user@example.com", status: "resolved", resolvedAt: new Date(Date.now() - 91 * 86_400_000) },
        { serverId, category: "slow", message: "Recently resolved report", status: "resolved", resolvedAt: new Date(Date.now() - 5 * 86_400_000) },
        { serverId, category: "other", message: "Still open report" },
      ])
      .returning({ id: serverReports.id });
    expect(await purgeResolvedReports()).toBe(1);
    const left = (await db().select({ id: serverReports.id }).from(serverReports)).map((r) => r.id).sort();
    expect(left).toEqual([b!.id, c!.id].sort());
    expect(left).not.toContain(a!.id);

    await deleteReport(c!.id, { ...actor, adminId });
    expect(await db().select().from(serverReports).where(eq(serverReports.id, c!.id))).toHaveLength(0);
    const audits = await db().select().from(auditLogs).where(eq(auditLogs.action, "report.delete"));
    expect(audits.at(-1)).toMatchObject({ targetId: c!.id, adminId });
    await expect(deleteReport(c!.id, actor)).rejects.toThrow(/no longer exists/);
  });
});
