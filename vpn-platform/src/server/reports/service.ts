import type { AuditActor } from "@/server/audit";
import type { ReportStatus } from "@/server/db/schema";
import type { ReportCategory } from "@/lib/public/types";

/**
 * "Report a problem" submissions (public form → Admin → Reports).
 * TODO(backend lane): implement. Signatures are the contract with the public and admin UI lanes.
 */

export { REPORT_CATEGORIES } from "@/lib/public/report-categories";

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

/** Validates (zod), rate-limits per client IP and stores a report. Throws ProvisioningError-like UserFacingError on bad input. */
export async function createReport(raw: unknown, clientIp: string | null): Promise<{ id: string }> {
  void raw;
  void clientIp;
  throw new Error("not implemented");
}

export async function listReports(filter: { status?: ReportStatus; page?: number }): Promise<{ items: ReportListItem[]; total: number; pageSize: number }> {
  void filter;
  throw new Error("not implemented");
}

export async function setReportStatus(id: string, status: ReportStatus, adminNote: string | null, actor: AuditActor): Promise<void> {
  void id;
  void status;
  void adminNote;
  void actor;
  throw new Error("not implemented");
}

export async function countOpenReports(): Promise<number> {
  throw new Error("not implemented");
}
