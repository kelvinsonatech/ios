import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { ProtocolIcon } from "@/components/protocol-icon";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { listProtocolsForAdmin } from "@/server/protocols/service";
import { ProtocolToggle } from "./protocol-toggle";

export const metadata = { title: "Protocols" };

export default async function ProtocolsPage() {
  const { admin } = await requirePermission("protocols:view");
  const rows = await listProtocolsForAdmin();
  const edit = can(admin.role, "protocols:edit");
  return (
    <>
      <PageHeader
        title="Protocols"
        description="Protocol pages, forms and outputs are driven by these definitions. Servers are listed automatically when they report a protocol's identifier."
        actions={
          edit ? (
            <Button asChild>
              <Link href="/admin/protocols/new">
                <PlusIcon /> New protocol
              </Link>
            </Button>
          ) : null
        }
      />
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocol</TableHead>
              <TableHead className="hidden md:table-cell">Server identifiers</TableHead>
              <TableHead className="text-right">Servers</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="hidden sm:table-cell">Durations</TableHead>
              <TableHead className="w-20 text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ protocol: p, serversPublished, serversDetected, activeAccounts }) => (
              <TableRow key={p.id}>
                <TableCell>
                  <Link href={`/admin/protocols/${p.id}`} className="group flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
                      <ProtocolIcon name={p.icon} className="size-4" />
                    </span>
                    <span className="grid">
                      <span className="font-medium group-hover:underline">{p.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">
                        /{p.slug} · {p.adapterKey}
                      </span>
                    </span>
                    {!p.isSystem ? <Badge variant="info">Custom</Badge> : null}
                  </Link>
                </TableCell>
                <TableCell className="hidden max-w-64 truncate font-mono text-xs text-muted-foreground md:table-cell">
                  {p.nodeIdentifiers.join(", ") || "—"}
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">
                  {serversPublished}
                  <span className="text-muted-foreground"> / {serversDetected}</span>
                </TableCell>
                <TableCell className="text-right text-sm tabular-nums">{activeAccounts}</TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{p.durationOptions.join(", ")} days</TableCell>
                <TableCell className="text-right">
                  <ProtocolToggle id={p.id} name={p.name} enabled={p.enabled} disabled={!edit} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="mt-3 text-xs text-muted-foreground">Servers: published / detected.</p>
    </>
  );
}
