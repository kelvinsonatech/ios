import Link from "next/link";
import {
  AlertOctagonIcon,
  CalendarDaysIcon,
  ConstructionIcon,
  ExternalLinkIcon,
  FlagIcon,
  PlusIcon,
  ServerCrashIcon,
  ServerIcon,
  ShieldAlertIcon,
  SignalIcon,
  UserPlusIcon,
  UsersIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { StatCard } from "@/components/admin/stat-card";
import { Capacity } from "@/components/admin/capacity";
import { ServerStatusBadge } from "@/components/admin/status-badge";
import { RelativeTime } from "@/components/admin/relative-time";
import { ProtocolIcon } from "@/components/protocol-icon";
import { Flag } from "@/components/public/flag";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/format";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { getDashboardData } from "@/server/dashboard/queries";
import { getSiteSettings } from "@/server/settings/service";

const ACCOUNT_BADGE = { active: "success", pending: "info", expired: "muted", revoked: "warning", failed: "danger" } as const;

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { admin } = await requirePermission("dashboard:view");
  const [d, settings] = await Promise.all([getDashboardData(), getSiteSettings()]);
  const viewAccounts = can(admin.role, "accounts:view");
  const maxUsage = Math.max(1, ...d.protocolUsage.map((p) => p.active));
  const maxTrend = Math.max(1, ...d.trend.map((t) => t.count));

  return (
    <>
      <PageHeader
        title={`Welcome back, ${admin.name.split(" ")[0]}`}
        description="Fleet health, capacity and provisioning activity at a glance."
        actions={
          <>
            <Button asChild variant="outline">
              <a href="/" target="_blank" rel="noopener">
                <ExternalLinkIcon /> View public site
              </a>
            </Button>
            {can(admin.role, "servers:create") ? (
              <Button asChild>
                <Link href="/admin/servers/new">
                  <PlusIcon /> Add server
                </Link>
              </Button>
            ) : null}
          </>
        }
      />

      {!admin.mfaEnabled ? (
        <Alert variant="warning" className="mb-6">
          <ShieldAlertIcon />
          <AlertTitle>Protect your account with two-factor authentication</AlertTitle>
          <AlertDescription>
            <p>
              Administrators can add servers and manage credentials.{" "}
              <Link href="/admin/account#mfa" className="font-medium text-foreground underline underline-offset-4">
                Enable 2FA
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total servers" value={d.servers.total} icon={<ServerIcon />} hint={d.servers.pending ? `${d.servers.pending} pending setup` : "Across all regions"} />
        <StatCard label="Online" value={d.servers.online} icon={<SignalIcon />} tone="success" hint={d.servers.full ? `${d.servers.full} full` : "Accepting new accounts"} />
        <StatCard label="Offline" value={d.servers.offline} icon={<ServerCrashIcon />} tone={d.servers.offline ? "danger" : "default"} hint="Unreachable or unsupported" />
        <StatCard label="Maintenance" value={d.servers.maintenance} icon={<ConstructionIcon />} tone={d.servers.maintenance ? "warning" : "default"} hint={d.servers.disabled ? `${d.servers.disabled} disabled` : "New accounts paused"} />
        <StatCard label="Active accounts" value={formatNumber(d.accounts.active)} icon={<UsersIcon />} />
        <StatCard
          label="Created today"
          value={formatNumber(d.accounts.today)}
          icon={<UserPlusIcon />}
          hint={d.accounts.failedToday ? `${d.accounts.failedToday} failed today` : `Since 00:00 ${d.today.timezone.replace(/_/g, " ")}`}
        />
        <StatCard label="This month" value={formatNumber(d.accounts.month)} icon={<CalendarDaysIcon />} />
        {can(admin.role, "reports:view") ? (
          <StatCard
            label="Open reports"
            value={formatNumber(d.reports.open)}
            icon={<FlagIcon />}
            tone={d.reports.open ? "warning" : "default"}
            href="/admin/reports"
            hint={d.reports.open ? "Problems reported by users" : `${formatNumber(d.reports.resolved)} resolved so far`}
          />
        ) : (
          <StatCard label="Recent errors" value={d.recentErrors.length} icon={<AlertOctagonIcon />} tone={d.recentErrors.length ? "danger" : "default"} hint="Latest provisioning & server errors" />
        )}
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Protocol usage</CardTitle>
            <CardDescription>Active accounts per protocol</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {d.protocolUsage.map((p) => (
              <div key={p.slug} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                <span className="flex items-center gap-2 truncate">
                  <ProtocolIcon name={p.icon} className="size-3.5 text-muted-foreground" />
                  {p.name}
                </span>
                <span className="h-2 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${(p.active / maxUsage) * 100}%` }} />
                </span>
                <span className="w-20 text-right text-xs tabular-nums text-muted-foreground">
                  {p.active} <span className="hidden sm:inline">· {p.month} mo</span>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounts created</CardTitle>
            <CardDescription>Last 14 days ({d.today.timezone.replace(/_/g, " ")})</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex h-36 items-end gap-1">
              {d.trend.map((t) => (
                <div key={t.day} className="flex h-full flex-1 flex-col justify-end" title={`${t.day}: ${t.count}`}>
                  <div className="min-h-0.5 rounded-t-sm bg-primary/80" style={{ height: `${(t.count / maxTrend) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
              <span>{d.trend[0]?.day.slice(5)}</span>
              <span>Today</span>
            </div>
          </CardContent>
        </Card>

        {viewAccounts ? (
          <Card>
            <CardHeader>
              <CardTitle>Latest accounts</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/admin/accounts">All accounts</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-3">
                {d.latestAccounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3">
                    <UserAvatar src={`/admin/accounts/avatar/${a.id}?s=${encodeURIComponent(settings.avatarStyle)}`} size={36} />
                    <span className="grid min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm">
                        <span className="truncate font-medium">{a.username ?? "Unnamed"}</span>
                        {a.status !== "active" ? <Badge variant={ACCOUNT_BADGE[a.status]}>{a.status}</Badge> : null}
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        <ProtocolIcon name={a.protocolIcon} className="size-3" />
                        {a.protocolName} · <Flag code={a.countryCode} className="h-2.5 w-3.5" /> {a.serverName}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <RelativeTime date={a.createdAt} />
                    </span>
                  </li>
                ))}
                {d.latestAccounts.length === 0 ? <li className="text-sm text-muted-foreground">No accounts yet.</li> : null}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Server capacity</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/servers">All servers</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent className="grid gap-4">
            {d.capacity.map((s) => (
              <Link key={s.id} href={`/admin/servers/${s.id}`} className="grid gap-1.5 rounded-md hover:bg-muted/40">
                <span className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 truncate font-medium">
                    <Flag code={s.countryCode} className="h-3.5 w-5" />
                    {s.name}
                  </span>
                  <ServerStatusBadge status={s.status} />
                </span>
                <Capacity current={s.current} max={s.max} />
              </Link>
            ))}
            {d.capacity.length === 0 ? <p className="text-sm text-muted-foreground">No published servers yet.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/logs">Logs</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ol className="relative grid gap-3 border-l pl-4">
              {d.activity.map((a) => (
                <li key={a.id} className="relative text-sm">
                  <span
                    className={`absolute top-1.5 -left-[21px] size-2 rounded-full ring-4 ring-card ${a.level === "error" ? "bg-destructive" : a.level === "warning" ? "bg-warning" : a.status === "success" ? "bg-success" : "bg-primary"}`}
                  />
                  <span className="line-clamp-2">{a.message}</span>
                  <span className="text-xs text-muted-foreground">
                    <RelativeTime date={a.createdAt} />
                  </span>
                </li>
              ))}
              {d.activity.length === 0 ? <li className="text-sm text-muted-foreground">Nothing yet.</li> : null}
            </ol>
          </CardContent>
        </Card>
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent errors</CardTitle>
            <CardAction>
              <Button asChild variant="ghost" size="sm">
                <Link href="/admin/logs?level=error">View</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-x-8 gap-y-3 md:grid-cols-2">
              {d.recentErrors.map((e) => (
                <li key={e.id} className="grid gap-0.5 text-sm">
                  <span className="line-clamp-2">{e.message}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="font-mono">{e.event}</span> · <RelativeTime date={e.createdAt} />
                  </span>
                </li>
              ))}
              {d.recentErrors.length === 0 ? <li className="text-sm text-muted-foreground">No errors. All quiet.</li> : null}
            </ul>
          </CardContent>
        </Card>

      </div>
    </>
  );
}
