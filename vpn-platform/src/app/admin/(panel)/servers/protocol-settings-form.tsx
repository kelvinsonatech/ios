"use client";

import { LoaderCircleIcon, SaveIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ServiceDot } from "@/components/admin/status-badge";
import { ProtocolIcon } from "@/components/protocol-icon";
import type { ActionState } from "@/lib/action-state";
import { useServerAction } from "@/hooks/use-server-action";

export interface ProtocolSettingRow {
  protocolId: string;
  name: string;
  icon: string;
  globallyEnabled: boolean;
  detected: boolean;
  enabled: boolean;
  serviceStatus: string;
  nodeIdentifier: string | null;
  ports: Record<string, number[] | string>;
  transports: string[];
  maxAccounts: number | null;
  currentAccounts: number;
  isNew?: boolean;
}

function portsText(ports: Record<string, number[] | string>) {
  return Object.entries(ports)
    .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(",") : v}`)
    .join(" · ");
}

export function ProtocolSettingsForm({
  rows,
  action,
  canEdit,
  submitLabel = "Save protocol settings",
}: {
  rows: ProtocolSettingRow[];
  action: (fd: FormData) => Promise<ActionState>;
  canEdit: boolean;
  submitLabel?: string;
}) {
  const { pending, onSubmit } = useServerAction(action);
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Protocol</TableHead>
              <TableHead>On server</TableHead>
              <TableHead className="hidden md:table-cell">Ports</TableHead>
              <TableHead className="text-right">Accounts</TableHead>
              <TableHead className="w-32">Max (optional)</TableHead>
              <TableHead className="w-20 text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.protocolId} className={!r.detected ? "opacity-60" : undefined}>
                <TableCell>
                  <input type="hidden" name={`present:${r.protocolId}`} value="1" />
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 items-center justify-center rounded-md bg-muted">
                      <ProtocolIcon name={r.icon} className="size-3.5" />
                    </span>
                    <div className="grid">
                      <span className="font-medium">
                        {r.name}
                        {r.isNew ? (
                          <Badge variant="info" className="ml-2 align-middle">
                            Available
                          </Badge>
                        ) : null}
                      </span>
                      {!r.globallyEnabled ? <span className="text-xs text-warning">Disabled globally in Protocols</span> : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  {r.detected ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <ServiceDot status={r.serviceStatus} />
                      Detected
                      {r.nodeIdentifier ? <span className="font-mono text-xs text-muted-foreground">({r.nodeIdentifier})</span> : null}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Not installed</span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-64 truncate font-mono text-xs text-muted-foreground md:table-cell" title={portsText(r.ports)}>
                  {portsText(r.ports) || "—"}
                  {r.transports.length ? <span className="block">{r.transports.join(", ")}</span> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.currentAccounts}</TableCell>
                <TableCell>
                  <Input
                    name={`max:${r.protocolId}`}
                    type="number"
                    min={1}
                    defaultValue={r.maxAccounts ?? ""}
                    placeholder="No limit"
                    disabled={!canEdit}
                    className="h-8"
                    aria-label={`Maximum ${r.name} accounts`}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Switch
                    name={`enabled:${r.protocolId}`}
                    defaultChecked={r.enabled && r.detected}
                    disabled={!canEdit || !r.detected}
                    aria-label={`Enable ${r.name}`}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {canEdit ? (
        <div className="flex justify-end">
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
            {submitLabel}
          </Button>
        </div>
      ) : null}
    </form>
  );
}
