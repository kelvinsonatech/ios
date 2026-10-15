import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AlertTriangleIcon, CheckCircle2Icon, PencilIcon, XCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { CompatibilityBadge } from "@/components/admin/status-badge";
import { requirePermission } from "@/server/auth/guards";
import { matchProtocols } from "@/server/protocols/identifiers";
import { getServerDetail } from "@/server/servers/queries";
import { getSiteSettings } from "@/server/settings/service";
import { saveServerProtocolsAction } from "../../actions";
import { PublishButton, SyncButton } from "../../operation-buttons";
import { ProtocolSettingsForm } from "../../protocol-settings-form";
import { toSettingRows } from "../rows";

export const metadata = { title: "Server setup" };

function Step({ n, title, done, children }: { n: number; title: string; done?: boolean; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="grid-cols-[auto_1fr] items-center gap-x-3">
        <span
          className={`row-span-2 flex size-8 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}
        >
          {done ? <CheckCircle2Icon className="size-4" /> : n}
        </span>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default async function ServerSetupPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("servers:edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, settings] = await Promise.all([getServerDetail(id), getSiteSettings()]);
  if (!detail) notFound();
  const { server } = detail;
  if (server.lifecycle !== "draft") redirect(`/admin/servers/${id}`);

  const connected = !!server.lastSuccessfulConnectionAt && server.healthStatus !== "offline" && server.healthStatus !== "unknown";
  const rows = toSettingRows(detail, settings.quota);
  const detected = rows.filter((r) => r.detected);
  const enabledCount = detected.filter((r) => r.enabled).length;
  const save = saveServerProtocolsAction.bind(null, server.id);
  const canPublish = connected && server.compatibility !== "unsupported" && enabledCount > 0;
  // `unmappedProtocols` was stored at the last sync; a protocol added or edited since may now claim some of them.
  const { matches, unmapped } = matchProtocols(
    server.unmappedProtocols,
    detail.protocols.map((p) => ({ id: p.protocolId, slug: p.slug, name: p.name, nodeIdentifiers: p.nodeIdentifiers })),
  );
  const mappedSinceSync = [...matches.values()].map((m) => m.protocol.name);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={{ href: "/admin/servers", label: "Servers" }}
        title={`Set up ${server.name}`}
        description="Verify the connection, choose which detected protocols to offer, then publish."
      />
      <div className="grid gap-6">
        <Step n={1} title="Connection & verification" done={connected && server.compatibility !== "unsupported"}>
          {connected ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-1.5 font-medium text-success">
                  <CheckCircle2Icon className="size-4" /> Provisioning service reachable
                </span>
                <span>
                  API <span className="font-mono">{server.apiVersion}</span> · script <span className="font-mono">{server.provisioningVersion}</span>
                </span>
                <CompatibilityBadge compatibility={server.compatibility} />
              </div>
              {[...detail.compatibility.reasons, ...server.syncWarnings].length ? (
                <Alert variant={server.compatibility === "unsupported" ? "destructive" : "warning"}>
                  <AlertTriangleIcon />
                  <AlertTitle>Check before publishing</AlertTitle>
                  <AlertDescription>
                    {[...detail.compatibility.reasons, ...server.syncWarnings].map((w) => (
                      <p key={w}>{w}</p>
                    ))}
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4">
              <Alert variant="destructive">
                <XCircleIcon />
                <AlertTitle>Could not verify the server</AlertTitle>
                <AlertDescription>
                  <p>{server.lastError ?? "The server has not been contacted yet."}</p>
                  <p>Check that the installation script finished, the API port is open in the firewall, and the key/secret match.</p>
                </AlertDescription>
              </Alert>
              <div className="flex flex-wrap gap-2">
                <SyncButton serverId={server.id} label="Retry connection" />
                <Button asChild variant="outline">
                  <Link href={`/admin/servers/${server.id}/edit`}>
                    <PencilIcon /> Edit connection
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </Step>

        <Step n={2} title="Detected protocols" done={enabledCount > 0}>
          <p className="mb-4 text-sm text-muted-foreground">
            {detected.length
              ? `The server reports ${detected.length} supported protocol${detected.length === 1 ? "" : "s"}. Turn off any you don't want to offer yet. Protocols that aren't installed can't be enabled.`
              : "No supported protocols detected yet."}
          </p>
          {mappedSinceSync.length ? (
            <p className="mb-4 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{mappedSinceSync.join(", ")}</span> can now be detected on this server. Re-detect
              protocols to add it.
            </p>
          ) : null}
          {unmapped.length ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Unrecognised identifiers reported by the server: <span className="font-mono">{unmapped.join(", ")}</span>.{" "}
              <Link href="/admin/protocols" className="underline underline-offset-4">
                Map them to a protocol
              </Link>{" "}
              and sync again.
            </p>
          ) : null}
          <ProtocolSettingsForm rows={rows} action={save} canEdit={connected} />
          {connected ? (
            <div className="mt-3">
              <SyncButton serverId={server.id} label="Re-detect protocols" />
            </div>
          ) : null}
        </Step>

        <Step n={3} title="Publish">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {canPublish
                ? `${server.name} will appear on ${enabledCount} protocol page${enabledCount === 1 ? "" : "s"} immediately. Save protocol changes first.`
                : "Connect successfully and enable at least one detected protocol to publish."}
            </p>
            <PublishButton serverId={server.id} disabled={!canPublish} />
          </div>
        </Step>
      </div>
    </div>
  );
}
