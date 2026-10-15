import Link from "next/link";
import { PlusIcon, ServerIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { Capacity } from "@/components/admin/capacity";
import { CompatibilityBadge, ServerStatusBadge } from "@/components/admin/status-badge";
import { RelativeTime } from "@/components/admin/relative-time";
import { Flag } from "@/components/public/flag";
import { Latency } from "@/components/public/latency";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { listServersForAdmin } from "@/server/servers/queries";
import { ServerActionsMenu } from "./server-actions-menu";

export const metadata = { title: "Servers" };

export default async function ServersPage() {
  const { admin } = await requirePermission("servers:view");
  const rows = await listServersForAdmin();
  const permissions = {
    edit: can(admin.role, "servers:edit"),
    operate: can(admin.role, "servers:operate"),
    delete: can(admin.role, "servers:delete"),
    viewAccounts: can(admin.role, "accounts:view"),
  };
  const online = rows.filter((r) => r.status === "online").length;

  return (
    <>
      <PageHeader
        title="Servers"
        description={`${rows.length} server${rows.length === 1 ? "" : "s"} · ${online} online`}
        actions={
          can(admin.role, "servers:create") ? (
            <Button asChild>
              <Link href="/admin/servers/new">
                <PlusIcon /> Add server
              </Link>
            </Button>
          ) : null
        }
      />
      {rows.length === 0 ? (
        <Card className="items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-12 items-center justify-center rounded-full bg-accent">
            <ServerIcon className="size-5 text-accent-foreground" />
          </div>
          <h2 className="text-lg font-semibold">No servers yet</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Run your installation script on a fresh VPS, then add it here. The website connects to it, detects its protocols and
            publishes it on every matching protocol page.
          </p>
          {can(admin.role, "servers:create") ? (
            <Button asChild className="mt-2">
              <Link href="/admin/servers/new">
                <PlusIcon /> Add your first server
              </Link>
            </Button>
          ) : null}
        </Card>
      ) : (
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Server</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden sm:table-cell">Accounts</TableHead>
                <TableHead className="hidden lg:table-cell">Protocols</TableHead>
                <TableHead className="hidden md:table-cell">Last check</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <Link href={`/admin/servers/${s.id}`} className="group flex items-center gap-3">
                      <Flag code={s.countryCode} className="h-5 w-7" title={s.country} />
                      <span className="grid">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="group-hover:underline">{s.name}</span>
                          <span className="rounded bg-muted px-1.5 py-px font-mono text-[11px] font-normal text-muted-foreground">{s.slug}</span>
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {[s.city, s.country].filter(Boolean).join(", ")} · <span className="font-mono">{s.hostname}</span>
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col items-start gap-1">
                      <ServerStatusBadge status={s.status} />
                      <CompatibilityBadge compatibility={s.compatibility} />
                      {s.lastLatencyMs !== null && s.status !== "offline" ? <Latency ms={s.lastLatencyMs} className="text-xs" /> : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Capacity current={s.currentAccounts} max={s.maxAccounts} compact />
                  </TableCell>
                  <TableCell className="hidden max-w-72 lg:table-cell">
                    <span className="text-sm tabular-nums">{s.enabledProtocols} protocols</span>
                    <span className="block truncate text-xs text-muted-foreground" title={s.protocolNames.join(", ")}>
                      {s.protocolNames.join(" · ") || (s.detectedProtocols ? `${s.detectedProtocols} detected, none enabled` : "None detected")}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    <RelativeTime date={s.lastHealthCheckAt ?? s.lastSeenAt} />
                  </TableCell>
                  <TableCell>
                    <ServerActionsMenu
                      server={{ id: s.id, name: s.name, lifecycle: s.lifecycle, restartSupported: !!s.capabilities?.restartAgent }}
                      permissions={permissions}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
