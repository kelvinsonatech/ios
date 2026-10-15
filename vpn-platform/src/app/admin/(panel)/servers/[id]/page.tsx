import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ActivityIcon,
  AlertTriangleIcon,
  ClockIcon,
  CpuIcon,
  ExternalLinkIcon,
  GlobeIcon,
  HardDriveIcon,
  MemoryStickIcon,
  PencilIcon,
  ServerIcon,
  TimerIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { PageHeader } from "@/components/admin/page-header";
import { Capacity } from "@/components/admin/capacity";
import { CompatibilityBadge, ServerStatusBadge, ServiceDot } from "@/components/admin/status-badge";
import { RelativeTime } from "@/components/admin/relative-time";
import { HealthSparkline } from "@/components/admin/health-sparkline";
import { ProtocolIcon } from "@/components/protocol-icon";
import { Flag } from "@/components/public/flag";
import { Latency } from "@/components/public/latency";
import { formatBytes, formatDuration } from "@/lib/format";
import { countrySlug } from "@/lib/slug";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { matchProtocols } from "@/server/protocols/identifiers";
import { quotaWindow } from "@/server/provisioning/quota";
import { getHealthTimeline, getServerDetail } from "@/server/servers/queries";
import { getSiteSettings } from "@/server/settings/service";
import { ServerActionsMenu } from "../server-actions-menu";
import { SyncButton, TestConnectionButton } from "../operation-buttons";

export const metadata = { title: "Server" };

function Metric({ icon, label, value, pct }: { icon: React.ReactNode; label: string; value: React.ReactNode; pct?: number }) {
  return (
    <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </div>
      <div className="text-sm font-medium tabular-nums">{value}</div>
      {pct !== undefined ? <Progress value={pct} /> : null}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

export default async function ServerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requirePermission("servers:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, timeline, settings] = await Promise.all([getServerDetail(id), getHealthTimeline(id), getSiteSettings()]);
  if (!detail) notFound();
  const { server, latestHealth: h, credential } = detail;
  const operate = can(admin.role, "servers:operate");
  const enabled = detail.protocols.filter((p) => p.enabled && p.detected);
  const published = server.lifecycle === "active" || server.lifecycle === "maintenance";
  const publicPages = enabled
    .filter((p) => p.globallyEnabled)
    .map((p) => ({ ...p, href: `/${p.slug}/${countrySlug(server.countryCode)}/${server.slug}` }));
  const window = quotaWindow(new Date(), settings.quota.resetTimes, settings.quota.timezone);
  const quotaUsed = (p: (typeof detail.protocols)[number]) =>
    p.quotaWindowStart && p.quotaWindowStart.getTime() === window.start.getTime() ? (p.quotaUsed ?? 0) : 0;
  const latency = server.lastLatencyMs ?? h?.latencyMs ?? null;
  // `unmappedProtocols` was stored at the last sync; a protocol added or edited since may now claim some of them.
  const { matches, unmapped } = matchProtocols(
    server.unmappedProtocols,
    detail.protocols.map((p) => ({ id: p.protocolId, slug: p.slug, name: p.name, nodeIdentifiers: p.nodeIdentifiers })),
  );
  const mappedSinceSync = [...matches.values()].map((m) => m.protocol.name);

  return (
    <>
      <PageHeader
        back={{ href: "/admin/servers", label: "Servers" }}
        title={
          <span className="flex items-center gap-3">
            <Flag code={server.countryCode} className="h-6 w-8 rounded-[4px]" title={server.country} />
            {server.name}
          </span>
        }
        actions={
          <>
            {operate ? <TestConnectionButton serverId={server.id} /> : null}
            {operate ? <SyncButton serverId={server.id} /> : null}
            <ServerActionsMenu
              variant="button"
              server={{ id: server.id, name: server.name, lifecycle: server.lifecycle, restartSupported: !!server.capabilities?.restartAgent }}
              permissions={{
                edit: can(admin.role, "servers:edit"),
                operate,
                delete: can(admin.role, "servers:delete"),
                viewAccounts: can(admin.role, "accounts:view"),
              }}
            />
          </>
        }
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <ServerStatusBadge status={server.status} />
          <CompatibilityBadge compatibility={server.compatibility} />
          {server.healthStatus === "degraded" ? <Badge variant="warning">Degraded</Badge> : null}
          <span className="font-mono text-xs text-muted-foreground">{server.hostname}</span>
          <span className="font-mono text-xs text-muted-foreground">· /{server.slug}</span>
        </div>
      </PageHeader>

      {server.lifecycle === "draft" ? (
        <Alert variant="info" className="mb-6">
          <ServerIcon />
          <AlertTitle>This server is not published yet</AlertTitle>
          <AlertDescription>
            <p>
              Finish the setup to make it available to users.{" "}
              <Link href={`/admin/servers/${server.id}/setup`} className="font-medium text-foreground underline underline-offset-4">
                Continue setup
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {server.lastError ? (
        <Alert variant="destructive" className="mb-6">
          <AlertTriangleIcon />
          <AlertTitle>Last connection failed</AlertTitle>
          <AlertDescription>{server.lastError}</AlertDescription>
        </Alert>
      ) : null}
      {detail.compatibility.reasons.length && server.compatibility !== "unknown" ? (
        <Alert variant={server.compatibility === "unsupported" ? "destructive" : "warning"} className="mb-6">
          <AlertTriangleIcon />
          <AlertTitle>{server.compatibility === "unsupported" ? "Server script unsupported" : "Server script outdated"}</AlertTitle>
          <AlertDescription>
            {detail.compatibility.reasons.map((r) => (
              <p key={r}>{r}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="grid content-start gap-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Health</CardTitle>
              <CardDescription>
                Last health check <RelativeTime date={server.lastHealthCheckAt} />
                {server.consecutiveFailures > 0 ? ` · ${server.consecutiveFailures} failed in a row` : ""}
              </CardDescription>
              <CardAction className="flex items-center gap-1.5 text-sm">
                <ActivityIcon className="size-4 text-muted-foreground" />
                <Latency ms={latency} className="font-medium" />
              </CardAction>
            </CardHeader>
            <CardContent>
              <HealthSparkline slices={timeline} />
            </CardContent>
            <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric icon={<CpuIcon />} label="CPU" value={h?.cpuPercent != null ? `${h.cpuPercent.toFixed(1)}%` : "—"} pct={h?.cpuPercent ?? undefined} />
              <Metric
                icon={<MemoryStickIcon />}
                label="RAM"
                value={h?.memoryTotalBytes ? `${formatBytes(h.memoryUsedBytes ?? 0)} / ${formatBytes(h.memoryTotalBytes)}` : "—"}
                pct={h?.memoryTotalBytes ? ((h.memoryUsedBytes ?? 0) / h.memoryTotalBytes) * 100 : undefined}
              />
              <Metric
                icon={<HardDriveIcon />}
                label="Disk"
                value={h?.diskTotalBytes ? `${formatBytes(h.diskUsedBytes ?? 0)} / ${formatBytes(h.diskTotalBytes)}` : "—"}
                pct={h?.diskTotalBytes ? ((h.diskUsedBytes ?? 0) / h.diskTotalBytes) * 100 : undefined}
              />
              <Metric
                icon={<TimerIcon />}
                label="Load / uptime"
                value={h?.load1 != null ? `${h.load1.toFixed(2)} · ${h.uptimeSeconds ? formatDuration(h.uptimeSeconds) : "—"}` : "—"}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Protocols</CardTitle>
              <CardDescription>
                {enabled.length} published · {detail.protocols.filter((p) => p.detected).length} detected on the server
              </CardDescription>
              <CardAction>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/admin/servers/${server.id}/protocols`}>Manage</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-2">
              {detail.protocols
                .filter((p) => p.detected)
                .map((p) => (
                  <div key={p.protocolId} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <ProtocolIcon name={p.icon} className="size-4 text-muted-foreground" />
                      {p.name}
                      <ServiceDot status={p.serviceStatus ?? "unknown"} />
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="grid text-right text-xs text-muted-foreground tabular-nums">
                        <span title="Active accounts / maximum">
                          {p.currentAccounts ?? 0}
                          {p.maxAccounts ? ` / ${p.maxAccounts}` : ""} active
                        </span>
                        {p.quotaLimit ? (
                          <span title="Created this period / creation quota" className={quotaUsed(p) >= p.quotaLimit ? "text-destructive" : undefined}>
                            {quotaUsed(p)} / {p.quotaLimit} this period
                          </span>
                        ) : null}
                      </span>
                      {p.enabled ? <Badge variant="success">On</Badge> : <Badge variant="muted">Off</Badge>}
                    </span>
                  </div>
                ))}
              {detail.protocols.every((p) => !p.detected) ? (
                <p className="text-sm text-muted-foreground">No protocols detected yet. Run a sync.</p>
              ) : null}
            </CardContent>
            {mappedSinceSync.length || unmapped.length ? (
              <CardContent className="grid gap-1.5">
                {mappedSinceSync.length ? (
                  <p className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{mappedSinceSync.join(", ")}</span> can now be detected on this server.{" "}
                    {operate ? "Sync the server to add it." : "Ask a server manager to sync the server."}
                  </p>
                ) : null}
                {unmapped.length ? (
                  <p className="text-xs text-muted-foreground">
                    The server also reports <span className="font-mono">{unmapped.join(", ")}</span>, which no protocol maps to. Add the identifier to a
                    protocol in{" "}
                    <Link href="/admin/protocols" className="underline underline-offset-4">
                      Protocols
                    </Link>{" "}
                    or create a new protocol.
                  </p>
                ) : null}
              </CardContent>
            ) : null}
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent activity</CardTitle>
              <CardAction>
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/admin/logs?server=${server.id}`}>All logs</Link>
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2.5">
                {detail.recentLogs.map((l) => (
                  <li key={l.id} className="flex items-start gap-2.5 text-sm">
                    <span
                      className={`mt-1.5 size-1.5 shrink-0 rounded-full ${l.level === "error" ? "bg-destructive" : l.level === "warning" ? "bg-warning" : "bg-primary"}`}
                    />
                    <span className="min-w-0 flex-1">{l.message}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      <RelativeTime date={l.createdAt} />
                    </span>
                  </li>
                ))}
                {detail.recentLogs.length === 0 ? <li className="text-sm text-muted-foreground">No activity yet.</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Capacity</CardTitle>
            </CardHeader>
            <CardContent>
              <Capacity current={server.currentAccounts} max={server.maxAccounts} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <GlobeIcon className="size-4 text-muted-foreground" /> Public pages
              </CardTitle>
              <CardDescription>
                {published
                  ? "Where visitors create accounts on this server, one page per enabled protocol."
                  : "These pages go live when the server is published."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {publicPages.length ? (
                <ul className="grid gap-1.5">
                  {publicPages.map((p) => (
                    <li key={p.protocolId}>
                      {published ? (
                        <a
                          href={p.href}
                          target="_blank"
                          rel="noopener"
                          className="group flex items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-muted/40"
                        >
                          <ProtocolIcon name={p.icon} className="size-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                          <span className="grid min-w-0 flex-1">
                            <span className="font-medium">{p.name}</span>
                            <span className="truncate font-mono text-[11px] text-muted-foreground">{p.href}</span>
                          </span>
                          <ExternalLinkIcon className="size-3.5 shrink-0 text-muted-foreground" />
                        </a>
                      ) : (
                        <span className="flex items-center gap-2.5 rounded-md border border-dashed px-2.5 py-2 text-sm text-muted-foreground">
                          <ProtocolIcon name={p.icon} className="size-4 shrink-0" />
                          <span className="grid min-w-0 flex-1">
                            <span>{p.name}</span>
                            <span className="truncate font-mono text-[11px]">{p.href}</span>
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">No protocol is enabled on this server yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
              {can(admin.role, "servers:edit") ? (
                <CardAction>
                  <Button asChild variant="ghost" size="icon-sm" aria-label="Edit server">
                    <Link href={`/admin/servers/${server.id}/edit`}>
                      <PencilIcon />
                    </Link>
                  </Button>
                </CardAction>
              ) : null}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
                <Row label="URL name">
                  <span className="font-mono text-xs">{server.slug}</span>
                </Row>
                <Row label="Hostname">
                  <span className="font-mono text-xs">{server.hostname}</span>
                </Row>
                <Row label="IP address">
                  <span className="font-mono text-xs">{server.ipAddress}</span>
                </Row>
                <Row label="Location">{[server.city, server.country].filter(Boolean).join(", ")}</Row>
                <Row label="Region">{server.region ?? "—"}</Row>
                <Row label="Provider">{server.provider ?? "—"}</Row>
                <Row label="API">
                  <span className="font-mono text-xs">
                    :{server.apiPort}
                    {server.apiBasePath}
                  </span>
                </Row>
                <Row label="Script version">{server.provisioningVersion ?? "—"}</Row>
                <Row label="API version">{server.apiVersion ?? "—"}</Row>
                <Row label="Driver">{server.driver}</Row>
                <Row label="Auth">
                  {credential ? (
                    <>
                      {credential.authMethod === "hmac_sha256" ? "HMAC" : "Bearer"} · {credential.tlsMode.replace(/_/g, " ")}
                      {credential.keyId ? <span className="block font-mono text-xs text-muted-foreground">key {credential.keyId}</span> : null}
                    </>
                  ) : (
                    <span className="text-destructive">Missing</span>
                  )}
                </Row>
                <Row label="Last connection">
                  <RelativeTime date={server.lastSuccessfulConnectionAt} />
                </Row>
                <Row label="Last sync">
                  <RelativeTime date={server.lastSyncAt} />
                </Row>
                <Row label="Last health check">
                  <RelativeTime date={server.lastHealthCheckAt} />
                </Row>
                <Row label="Last latency">
                  <Latency ms={latency} />
                </Row>
                <Row label="Published">
                  <RelativeTime date={server.publishedAt} fallback="Not yet" />
                </Row>
              </dl>
              {server.notes ? <p className="mt-4 rounded-md bg-muted/50 p-3 text-sm whitespace-pre-wrap">{server.notes}</p> : null}
            </CardContent>
          </Card>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ClockIcon className="size-3.5" /> Added <RelativeTime date={server.createdAt} />
          </p>
        </div>
      </div>
    </>
  );
}
