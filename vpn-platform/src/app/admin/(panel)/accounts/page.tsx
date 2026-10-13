import Link from "next/link";
import { FilterIcon, InfoIcon } from "lucide-react";
import { asc, isNull } from "drizzle-orm";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { Pager } from "@/components/admin/pager";
import { RelativeTime } from "@/components/admin/relative-time";
import { flagEmoji } from "@/lib/countries";
import { requirePermission } from "@/server/auth/guards";
import { db } from "@/server/db";
import { protocols, servers } from "@/server/db/schema";
import { listAccounts, parseAccountFilters } from "@/server/accounts/queries";

export const metadata = { title: "Accounts" };

const STATUS_VARIANT = { active: "success", pending: "info", expired: "muted", revoked: "warning", failed: "danger" } as const;

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePermission("accounts:view");
  const sp = await searchParams;
  const f = parseAccountFilters(sp);
  const [{ rows, hasMore }, serverOptions, protocolOptions] = await Promise.all([
    listAccounts(f),
    db().select({ id: servers.id, name: servers.name }).from(servers).where(isNull(servers.deletedAt)).orderBy(asc(servers.name)),
    db().select({ slug: protocols.slug, name: protocols.name }).from(protocols).orderBy(asc(protocols.displayOrder)),
  ]);
  const iso = (d?: Date) => d?.toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Accounts" description="Every account the website has provisioned. Secrets are delivered to the user once and are not stored." />
      <Alert variant="info" className="mb-4">
        <InfoIcon />
        <AlertDescription>Revoke and renew actions are enabled once the real server driver is connected (roadmap phase 13).</AlertDescription>
      </Alert>
      <form method="get" className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:flex xl:flex-wrap xl:items-end">
        <Input name="q" defaultValue={f.q ?? ""} placeholder="Username" className="xl:w-44" />
        <NativeSelect name="server" defaultValue={f.serverId ?? ""} aria-label="Server">
          <option value="">All servers</option>
          {serverOptions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="protocol" defaultValue={f.protocol ?? ""} aria-label="Protocol">
          <option value="">All protocols</option>
          {protocolOptions.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={f.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          {Object.keys(STATUS_VARIANT).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <Input name="country" defaultValue={f.country ?? ""} placeholder="Country (SG)" maxLength={2} className="xl:w-32" />
        <label className="grid gap-1 text-xs text-muted-foreground">
          Created from
          <Input type="date" name="from" defaultValue={iso(f.createdFrom)} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Created to
          <Input type="date" name="to" defaultValue={iso(f.createdTo)} />
        </label>
        <label className="grid gap-1 text-xs text-muted-foreground">
          Expires before
          <Input type="date" name="expires" defaultValue={iso(f.expiresBefore)} />
        </label>
        <div className="flex gap-2">
          <Button type="submit" variant="outline">
            <FilterIcon /> Filter
          </Button>
          <Button asChild variant="ghost">
            <Link href="/admin/accounts">Clear</Link>
          </Button>
        </div>
      </form>
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead>Protocol</TableHead>
              <TableHead>Server</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden md:table-cell">Created</TableHead>
              <TableHead className="hidden md:table-cell">Expires</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((a) => (
              <TableRow key={a.id}>
                <TableCell>
                  <span className="font-medium">{a.username ?? <span className="text-muted-foreground">—</span>}</span>
                  {a.remoteAccountId ? <span className="block font-mono text-[11px] text-muted-foreground">{a.remoteAccountId}</span> : null}
                  {a.failureMessage ? <span className="block max-w-xs truncate text-xs text-destructive">{a.failureMessage}</span> : null}
                </TableCell>
                <TableCell className="text-sm">{a.protocolName}</TableCell>
                <TableCell className="text-sm">
                  <Link href={`/admin/servers/${a.serverId}`} className="hover:underline">
                    <span aria-hidden>{flagEmoji(a.countryCode)}</span> {a.serverName}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[a.status]}>{a.status}</Badge>
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  <RelativeTime date={a.createdAt} />
                </TableCell>
                <TableCell className="hidden text-sm md:table-cell">
                  <RelativeTime date={a.expiresAt} fallback="—" />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No accounts match.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Card>
      <Pager
        page={f.page}
        hasMore={hasMore}
        params={{
          q: f.q,
          server: f.serverId,
          protocol: f.protocol,
          status: f.status,
          country: f.country,
          from: iso(f.createdFrom),
          to: iso(f.createdTo),
          expires: iso(f.expiresBefore),
        }}
      />
    </>
  );
}
