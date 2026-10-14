import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { admins, protocols, serverReports, servers, type ReportStatus } from "@/server/db/schema";
import { audit, type AuditActor } from "@/server/audit";
import { rateLimit } from "@/server/auth/rate-limit";
import { hashClientIp } from "@/server/crypto/hashing";
import { UserFacingError } from "@/server/errors";
import type { ReportCategory } from "@/lib/public/types";
import { REPORT_CATEGORIES } from "@/lib/public/report-categories";

/**
 * "Report a problem" submissions (public form → Admin → Reports).
 * Reports are plain text written by anonymous visitors: they are stored as-is (length-limited) and
 * must always be rendered as text. The client IP is stored only as a keyed hash.
 */

export { REPORT_CATEGORIES };

export const REPORTS_PAGE_SIZE = 25;
/** Per client IP: at most this many reports per hour / per day. */
export const REPORT_LIMITS = { hour: 3, day: 10 } as const;

export interface NewReportInput {
  serverId: string | null;
  protocolSlug: string | null;
  category: ReportCategory;
  message: string;
  contactEmail: string | null;
}

export interface ReportListItem {
  id: string;
  createdAt: string;
  status: ReportStatus;
  category: ReportCategory;
  message: string;
  contactEmail: string | null;
  server: { id: string; name: string; slug: string; countryCode: string } | null;
  protocol: { slug: string; name: string } | null;
  resolvedAt: string | null;
  resolvedByEmail: string | null;
  adminNote: string | null;
}

/** A rejected public report (validation or rate limit); safe to show to the visitor. */
export class ReportError extends UserFacingError {
  constructor(
    code: "VALIDATION_FAILED" | "RATE_LIMITED",
    message: string,
    readonly httpStatus: number,
    readonly fieldErrors?: Record<string, string[]>,
    readonly retryAfterSeconds?: number,
  ) {
    super(message, code);
    this.name = "ReportError";
  }
}

const CATEGORY_KEYS = Object.keys(REPORT_CATEGORIES) as [ReportCategory, ...ReportCategory[]];
const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;

const optionalText = (schema: z.ZodType<string>) =>
  z.preprocess((v) => (v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v), schema.nullable());

/** Accepts the public request body (CreateReportRequest) or NewReportInput (`protocolSlug`). */
export const reportInputSchema = z
  .object({
    serverId: optionalText(z.uuid("Choose a server from the list.")),
    protocol: optionalText(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Choose a protocol from the list.")),
    protocolSlug: optionalText(z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Choose a protocol from the list.")),
    category: z.enum(CATEGORY_KEYS, { error: "Choose what went wrong." }),
    message: z
      .string({ error: "Describe the problem." })
      .trim()
      .min(10, "Please describe the problem in at least 10 characters.")
      .max(2000, "Please keep it under 2000 characters.")
      .refine((v) => !CONTROL.test(v), "Contains invalid characters."),
    contactEmail: optionalText(z.string().trim().max(254, "Email address is too long.").pipe(z.email("Enter a valid email address or leave it empty."))),
    captchaToken: z.unknown().optional(),
  })
  .strict()
  .transform(
    (v): NewReportInput => ({
      serverId: v.serverId,
      protocolSlug: v.protocol ?? v.protocolSlug,
      category: v.category,
      message: v.message,
      contactEmail: v.contactEmail ? v.contactEmail.toLowerCase() : null,
    }),
  );

function fieldErrorsOf(e: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of e.issues) {
    const key = String(i.path[0] ?? "_form") === "protocolSlug" ? "protocol" : String(i.path[0] ?? "_form");
    (out[key] ??= []).push(i.message);
  }
  return out;
}

/** Validates (zod), rate-limits per client IP and stores a report. Throws ReportError on bad input. */
export async function createReport(raw: unknown, clientIp: string | null): Promise<{ id: string }> {
  const parsed = reportInputSchema.safeParse(raw);
  if (!parsed.success) throw new ReportError("VALIDATION_FAILED", "Please correct the highlighted fields.", 422, fieldErrorsOf(parsed.error));
  const input = parsed.data;

  const ipHash = hashClientIp(clientIp);
  const key = ipHash ?? "unknown";
  const [hour, day] = await Promise.all([
    rateLimit(`report:hour:${key}`, REPORT_LIMITS.hour, 3_600, "closed"),
    rateLimit(`report:day:${key}`, REPORT_LIMITS.day, 86_400, "closed"),
  ]);
  if (!hour.allowed || !day.allowed) {
    const retry = Math.max(!hour.allowed ? hour.resetSeconds : 0, !day.allowed ? day.resetSeconds : 0, 1);
    throw new ReportError("RATE_LIMITED", "You have sent several reports recently. Please try again later.", 429, undefined, retry);
  }

  const errors: Record<string, string[]> = {};
  let protocolId: string | null = null;
  if (input.serverId) {
    const [s] = await db()
      .select({ id: servers.id })
      .from(servers)
      .where(and(eq(servers.id, input.serverId), isNull(servers.deletedAt), inArray(servers.lifecycle, ["active", "maintenance"])))
      .limit(1);
    if (!s) errors.serverId = ["Choose a server from the list."];
  }
  if (input.protocolSlug) {
    const [p] = await db().select({ id: protocols.id }).from(protocols).where(eq(protocols.slug, input.protocolSlug)).limit(1);
    if (!p) errors.protocol = ["Choose a protocol from the list."];
    protocolId = p?.id ?? null;
  }
  if (Object.keys(errors).length) throw new ReportError("VALIDATION_FAILED", "Please correct the highlighted fields.", 422, errors);

  const [row] = await db()
    .insert(serverReports)
    .values({
      serverId: input.serverId,
      protocolId,
      category: input.category,
      message: input.message,
      contactEmail: input.contactEmail,
      clientIpHash: ipHash,
    })
    .returning({ id: serverReports.id });
  return { id: row!.id };
}

export async function listReports(filter: { status?: ReportStatus; page?: number }): Promise<{ items: ReportListItem[]; total: number; pageSize: number }> {
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const where = filter.status ? eq(serverReports.status, filter.status) : undefined;
  const [rows, totals] = await Promise.all([
    db()
      .select({
        report: serverReports,
        server: { id: servers.id, name: servers.name, slug: servers.slug, countryCode: servers.countryCode },
        protocol: { slug: protocols.slug, name: protocols.name },
        resolvedByEmail: admins.email,
      })
      .from(serverReports)
      .leftJoin(servers, eq(servers.id, serverReports.serverId))
      .leftJoin(protocols, eq(protocols.id, serverReports.protocolId))
      .leftJoin(admins, eq(admins.id, serverReports.resolvedBy))
      .where(where)
      .orderBy(desc(serverReports.createdAt), desc(serverReports.id))
      .limit(REPORTS_PAGE_SIZE)
      .offset((page - 1) * REPORTS_PAGE_SIZE),
    db().select({ total: sql<number>`count(*)::int` }).from(serverReports).where(where),
  ]);
  const total = totals[0]?.total ?? 0;
  return {
    items: rows.map(({ report: r, server, protocol, resolvedByEmail }) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      status: r.status,
      category: (CATEGORY_KEYS as string[]).includes(r.category) ? (r.category as ReportCategory) : "other",
      message: r.message,
      contactEmail: r.contactEmail,
      server: server?.id ? server : null,
      protocol: protocol?.slug ? protocol : null,
      resolvedAt: r.resolvedAt?.toISOString() ?? null,
      resolvedByEmail: resolvedByEmail ?? null,
      adminNote: r.adminNote,
    })),
    total,
    pageSize: REPORTS_PAGE_SIZE,
  };
}

export async function setReportStatus(id: string, status: ReportStatus, adminNote: string | null, actor: AuditActor): Promise<void> {
  const note = adminNote?.trim().slice(0, 500) || null;
  const [row] = await db()
    .update(serverReports)
    .set(
      status === "resolved"
        ? { status, adminNote: note, resolvedBy: actor.adminId, resolvedAt: new Date() }
        : { status, adminNote: note, resolvedBy: null, resolvedAt: null },
    )
    .where(eq(serverReports.id, id))
    .returning({ id: serverReports.id });
  if (!row) throw new UserFacingError("Report not found.", "NOT_FOUND");
  await audit(actor, status === "resolved" ? "report.resolve" : "report.reopen", {
    targetType: "report",
    targetId: id,
    details: { note: !!note },
  });
}

export async function countOpenReports(): Promise<number> {
  const [row] = await db().select({ count: sql<number>`count(*)::int` }).from(serverReports).where(eq(serverReports.status, "open"));
  return row?.count ?? 0;
}
