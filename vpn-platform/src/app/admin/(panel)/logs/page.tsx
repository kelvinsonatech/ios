import Link from "next/link";
import { FilterIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { Pager } from "@/components/admin/pager";
import { formatDateTime } from "@/components/admin/relative-time";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { listAuditLogs, listProvisioningLogs } from "@/server/logs/queries";
import type { LogLevel } from "@/server/db/schema";

export const metadata = { title: "Logs" };

type SP = Record<string, string | string[] | undefined>;
const str = (sp: SP, k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : undefined) || undefined;

export default async function LogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const { admin } = await requirePermission("logs:view");
  const sp = await searchParams;
  const auditAllowed = can(admin.role, "audit:view");
  const tab = str(sp, "tab") === "audit" && auditAllowed ? "audit" : "events";
  const page = Math.max(1, Number(str(sp, "page") ?? 1) || 1);
  const level = (["info", "warning", "error"] as const).find((l) => l === str(sp, "level")) as LogLevel | undefined;
  const server = str(sp, "server");
  const event = str(sp, "event");
  const q = str(sp, "q");

  return (
    <>
      <PageHeader
        title="Logs"
        description="Operational events and administrator audit trail. Passwords, keys, tokens and configs are never logged."
      />
      <div className="mb-4 flex gap-1 border-b">
        {[
          { key: "events", label: "Provisioning & servers" },
          ...(auditAllowed ? [{ key: "audit", label: "Audit trail" }] : []),
        ].map((t) => (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <input type="hidden" name="tab" value={tab} />
        {server ? <input type="hidden" name="server" value={server} /> : null}
        {tab === "events" ? (
          <>
            <NativeSelect name="level" defaultValue={level ?? ""} className="w-36" aria-label="Level">
              <option value="">All levels</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
            </NativeSelect>
            <Input name="event" defaultValue={event ?? ""} placeholder="Event, e.g. account." className="w-48" />
          </>
        ) : (
          <Input name="event" defaultValue={event ?? ""} placeholder="Action, e.g. server." className="w-48" />
        )}
        <Input name="q" defaultValue={q ?? ""} placeholder={tab === "events" ? "Search message" : "Admin email or target id"} className="w-60" />
        <Button type="submit" variant="outline">
          <FilterIcon /> Filter
        </Button>
        {level || event || q || server ? (
          <Button asChild variant="ghost">
            <Link href={`?tab=${tab}`}>Clear</Link>
          </Button>
        ) : null}
      </form>

      {tab === "events" ? <EventsTable page={page} level={level} event={event} q={q} server={server} /> : <AuditTable page={page} action={event} q={q} />}
    </>
  );
}

async function EventsTable(f: { page: number; level?: LogLevel; event?: string; q?: string; server?: string }) {
  const { rows, hasMore } = await listProvisioningLogs({
    page: f.page,
    level: f.level,
    event: f.event,
    q: f.q,
    serverId: f.server && /^[0-9a-f-]{36}$/.test(f.server) ? f.server : undefined,
  });
  return (
    <>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Time (UTC)</TableHead>
              <TableHead>Event</TableHead>
              <TableHead className="hidden md:table-cell">Server</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="hidden text-right lg:table-cell">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatDateTime(r.createdAt).replace(" UTC", "")}</TableCell>
                <TableCell>
                  <Badge variant={r.level === "error" ? "danger" : r.level === "warning" ? "warning" : r.status === "success" ? "success" : "muted"} className="font-mono">
                    {r.event}
                  </Badge>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  {r.serverId ? (
                    <Link href={`/admin/servers/${r.serverId}`} className="hover:underline">
                      {r.serverName ?? "—"}
                    </Link>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="max-w-xl text-sm">
                  <span className="line-clamp-2">{r.message}</span>
                  {r.requestId ? <span className="font-mono text-[11px] text-muted-foreground">req {r.requestId}</span> : null}
                </TableCell>
                <TableCell className="hidden text-right text-xs text-muted-foreground tabular-nums lg:table-cell">{r.durationMs != null ? `${r.durationMs} ms` : ""}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No log entries match.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <Pager page={f.page} hasMore={hasMore} params={{ tab: "events", level: f.level, event: f.event, q: f.q, server: f.server }} />
    </>
  );
}

async function AuditTable(f: { page: number; action?: string; q?: string }) {
  const { rows, hasMore } = await listAuditLogs({ page: f.page, action: f.action, q: f.q });
  return (
    <>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">Time (UTC)</TableHead>
              <TableHead>Admin</TableHead>
              <TableHead>Action</TableHead>
              <TableHead className="hidden md:table-cell">Target</TableHead>
              <TableHead className="hidden lg:table-cell">IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{formatDateTime(r.createdAt).replace(" UTC", "")}</TableCell>
                <TableCell className="text-sm">{r.adminEmail ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.success ? "secondary" : "danger"} className="font-mono">
                    {r.action}
                  </Badge>
                  {Object.keys(r.details).length ? (
                    <span className="mt-1 block max-w-md truncate font-mono text-[11px] text-muted-foreground">{JSON.stringify(r.details)}</span>
                  ) : null}
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                  {r.targetType ? `${r.targetType}:${r.targetId?.slice(0, 8)}` : "—"}
                </TableCell>
                <TableCell className="hidden font-mono text-xs text-muted-foreground lg:table-cell">{r.ip ?? "—"}</TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                  No audit entries match.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <Pager page={f.page} hasMore={hasMore} params={{ tab: "audit", event: f.action, q: f.q }} />
    </>
  );
}
