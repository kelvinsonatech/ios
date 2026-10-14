import Link from "next/link";
import { CircleAlertIcon, InboxIcon, MailIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExpandableText } from "@/components/admin/expandable-text";
import { PageHeader } from "@/components/admin/page-header";
import { Pager } from "@/components/admin/pager";
import { RelativeTime } from "@/components/admin/relative-time";
import { flagEmoji } from "@/lib/countries";
import { formatNumber } from "@/lib/format";
import { REPORT_CATEGORIES } from "@/lib/public/report-categories";
import type { ReportCategory } from "@/lib/public/types";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { countReportsByStatus } from "@/server/dashboard/queries";
import { errorSummary, logger } from "@/server/logging/logger";
import { listReports, type ReportListItem } from "@/server/reports/service";
import { getSiteSettings } from "@/server/settings/service";
import { ReportStatusButton } from "./report-actions";

export const metadata = { title: "Reports" };

const TABS = [
  { key: "open", label: "Open" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const CATEGORY_VARIANT: Record<ReportCategory, "danger" | "warning" | "info" | "muted"> = {
  connection: "danger",
  slow: "warning",
  account: "info",
  other: "muted",
};

function one(v: string | string[] | undefined) {
  return typeof v === "string" ? v : undefined;
}

/** listReports() may not be available (or the database may hiccup): show an error state instead of a crash. */
async function loadReports(tab: Tab, page: number) {
  try {
    return { ok: true as const, ...(await listReports({ status: tab === "all" ? undefined : tab, page })) };
  } catch (e) {
    logger.warn("could not load problem reports", errorSummary(e));
    return { ok: false as const };
  }
}

function CategoryBadge({ category }: { category: ReportCategory }) {
  return <Badge variant={CATEGORY_VARIANT[category] ?? "muted"}>{REPORT_CATEGORIES[category] ?? category}</Badge>;
}

function ServerCell({ r }: { r: ReportListItem }) {
  return (
    <div className="grid min-w-0 gap-0.5 text-sm">
      {r.server ? (
        <Link href={`/admin/servers/${r.server.id}`} className="w-fit truncate font-medium hover:underline">
          <span aria-hidden>{flagEmoji(r.server.countryCode)}</span> {r.server.name}
        </Link>
      ) : (
        <span className="text-muted-foreground">No server</span>
      )}
      {r.protocol ? <span className="text-xs text-muted-foreground">{r.protocol.name}</span> : null}
    </div>
  );
}

function ReplyLink({ email, siteName }: { email: string | null; siteName: string }) {
  if (!email) return <span className="text-sm text-muted-foreground">—</span>;
  const href = `mailto:${encodeURI(email)}?subject=${encodeURIComponent(`Your problem report on ${siteName}`)}`;
  return (
    <a href={href} className="flex min-w-0 items-center gap-1.5 text-sm text-primary hover:underline" title={`Reply to ${email}`}>
      <MailIcon className="size-3.5 shrink-0" />
      <span className="truncate">{email}</span>
    </a>
  );
}

function StatusCell({ r }: { r: ReportListItem }) {
  return (
    <div className="grid justify-items-start gap-1">
      {r.status === "open" ? <Badge variant="warning">Open</Badge> : <Badge variant="success">Resolved</Badge>}
      {r.status === "resolved" && r.resolvedAt ? (
        <span className="text-xs text-muted-foreground">
          <RelativeTime date={r.resolvedAt} />
          {r.resolvedByEmail ? ` · ${r.resolvedByEmail}` : ""}
        </span>
      ) : null}
      {r.adminNote ? <span className="line-clamp-2 max-w-56 text-xs text-muted-foreground italic">“{r.adminNote}”</span> : null}
    </div>
  );
}

function summaryOf(r: ReportListItem) {
  return [REPORT_CATEGORIES[r.category] ?? r.category, r.server?.name, r.protocol?.name].filter(Boolean).join(" · ");
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { admin } = await requirePermission("reports:view");
  const sp = await searchParams;
  const tab: Tab = TABS.some((t) => t.key === one(sp.status)) ? (one(sp.status) as Tab) : "open";
  const page = Math.max(1, Math.min(1000, Math.trunc(Number(one(sp.page) ?? 1)) || 1));
  const manage = can(admin.role, "reports:manage");

  const [counts, list, settings] = await Promise.all([countReportsByStatus().catch(() => null), loadReports(tab, page), getSiteSettings()]);
  const countFor = (t: Tab) => (counts ? (t === "all" ? counts.open + counts.resolved : counts[t]) : null);
  const items = list.ok ? list.items : [];
  const from = list.ok && list.total ? (page - 1) * list.pageSize + 1 : 0;
  const to = list.ok ? Math.min(list.total, (page - 1) * list.pageSize + items.length) : 0;
  const empty = { open: "No open reports. Everything users reported has been handled.", resolved: "No resolved reports yet.", all: "No reports yet." }[tab];

  return (
    <>
      <PageHeader
        title="Reports"
        description="Problems users reported from the public website. Check the server, then resolve the report with a short note for the team."
      />

      <nav aria-label="Report status" className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex h-9 items-center rounded-lg bg-muted p-[3px] text-muted-foreground">
          {TABS.map((t) => {
            const active = t.key === tab;
            const n = countFor(t.key);
            return (
              <Link
                key={t.key}
                href={t.key === "open" ? "/admin/reports" : `/admin/reports?status=${t.key}`}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-full items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                  active && "bg-card text-foreground shadow-sm",
                )}
              >
                {t.label}
                {n !== null ? (
                  <span
                    className={cn(
                      "min-w-5 rounded-full px-1.5 text-center text-[11px] font-semibold tabular-nums",
                      t.key === "open" && n > 0 ? "bg-warning-soft text-warning" : "bg-background/70 text-muted-foreground",
                    )}
                  >
                    {formatNumber(n)}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
        {list.ok && list.total > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            {from}–{to} of {formatNumber(list.total)}
          </p>
        ) : null}
      </nav>

      {!list.ok ? (
        <Alert variant="warning">
          <CircleAlertIcon />
          <AlertTitle>Reports could not be loaded</AlertTitle>
          <AlertDescription>The report inbox is temporarily unavailable. Try again in a moment; new reports are not lost.</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <Card className="items-center gap-3 py-14 text-center">
          <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <InboxIcon className="size-5" />
          </span>
          <p className="max-w-sm text-sm text-muted-foreground">{page > 1 ? "Nothing on this page." : empty}</p>
        </Card>
      ) : (
        <>
          {/* Wide screens: table */}
          <Card className="hidden py-0 md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Received</TableHead>
                  <TableHead>Problem</TableHead>
                  <TableHead>Server</TableHead>
                  <TableHead className="min-w-64">Message</TableHead>
                  <TableHead>Reply to</TableHead>
                  <TableHead>Status</TableHead>
                  {manage ? <TableHead className="w-28" /> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="text-sm whitespace-nowrap">
                      <RelativeTime date={r.createdAt} />
                    </TableCell>
                    <TableCell>
                      <CategoryBadge category={r.category} />
                    </TableCell>
                    <TableCell className="max-w-48">
                      <ServerCell r={r} />
                    </TableCell>
                    <TableCell className="max-w-md whitespace-normal">
                      <ExpandableText text={r.message} />
                    </TableCell>
                    <TableCell className="max-w-48">
                      <ReplyLink email={r.contactEmail} siteName={settings.siteName} />
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <StatusCell r={r} />
                    </TableCell>
                    {manage ? (
                      <TableCell className="text-right">
                        <ReportStatusButton id={r.id} status={r.status} note={r.adminNote} summary={summaryOf(r)} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {/* Phones: stacked cards */}
          <ul className="grid gap-3 md:hidden">
            {items.map((r) => (
              <li key={r.id}>
                <Card className="gap-3 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CategoryBadge category={r.category} />
                    <span className="text-xs text-muted-foreground">
                      <RelativeTime date={r.createdAt} />
                    </span>
                  </div>
                  <ServerCell r={r} />
                  <ExpandableText text={r.message} lines={3} />
                  <ReplyLink email={r.contactEmail} siteName={settings.siteName} />
                  <div className="flex items-end justify-between gap-3 border-t pt-3">
                    <StatusCell r={r} />
                    {manage ? <ReportStatusButton id={r.id} status={r.status} note={r.adminNote} summary={summaryOf(r)} className="shrink-0" /> : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}

      {list.ok ? <Pager page={page} hasMore={page * list.pageSize < list.total} params={{ status: tab === "open" ? undefined : tab }} /> : null}
    </>
  );
}
