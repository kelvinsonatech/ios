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
import { cn } from "@/lib/utils";
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
  /** Creation quota per reset period; null = none. */
  quotaLimit: number | null;
  /** Accounts created in the current reset period. */
  quotaUsed: number;
  /** e.g. "resets 12:00 (in 3 h 12 min)", computed on the server. */
  quotaResetLabel: string;
  isNew?: boolean;
}

function portsText(ports: Record<string, number[] | string>) {
  return Object.entries(ports)
    .map(([k, v]) => `${k} ${Array.isArray(v) ? v.join(",") : v}`)
    .join(" · ");
}

function QuotaUsage({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null) return <span className="text-muted-foreground">{used} created this period</span>;
  const pct = Math.min(100, (used / limit) * 100);
  return (
    <span className="grid gap-1">
      <span className="flex items-center justify-between gap-2 tabular-nums">
        <span className={cn(used >= limit && "font-medium text-destructive")}>
          {used} / {limit} used
        </span>
        <span className="text-muted-foreground">{Math.max(0, limit - used)} left</span>
      </span>
      <span className="h-1 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", pct >= 100 ? "bg-destructive" : pct >= 80 ? "bg-warning" : "bg-primary")}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
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
  const { state, pending, onSubmit } = useServerAction(action);
  const err = (key: string) => state.fieldErrors?.[key]?.[0];
  const resetLabel = rows[0]?.quotaResetLabel;
  return (
    <form onSubmit={onSubmit} className="grid min-w-0 gap-4" noValidate>
      <div className="min-w-0 overflow-hidden rounded-lg border">
        {/* Phones: every row becomes a small card (name + switch, then the two limits side by side). */}
        <Table className="max-sm:block">
          <TableHeader className="max-sm:hidden">
            <TableRow>
              <TableHead>Protocol</TableHead>
              <TableHead className="hidden md:table-cell">On server</TableHead>
              <TableHead className="hidden xl:table-cell">Ports</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="min-w-32">Max active</TableHead>
              <TableHead className="min-w-52">Creation quota</TableHead>
              <TableHead className="w-20 text-right">Enabled</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-sm:block">
            {rows.map((r) => (
              <TableRow
                key={r.protocolId}
                className={cn(
                  "[&>td]:align-top max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-3 max-sm:gap-y-2.5 max-sm:p-3 max-sm:[&>td]:p-0",
                  !r.detected && "opacity-60",
                )}
              >
                <TableCell className="pt-3 max-sm:min-w-0 max-sm:whitespace-normal">
                  <input type="hidden" name={`present:${r.protocolId}`} value="1" />
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted">
                      <ProtocolIcon name={r.icon} className="size-3.5" />
                    </span>
                    <div className="grid min-w-0">
                      <span className="font-medium">
                        {r.name}
                        {r.isNew ? (
                          <Badge variant="info" className="ml-2 align-middle">
                            Available
                          </Badge>
                        ) : null}
                      </span>
                      {/* Below md the "On server" column (and below sm the "Active" column) is folded in here. */}
                      <span className="text-xs text-muted-foreground md:hidden">
                        {r.detected ? (
                          <>
                            <ServiceDot status={r.serviceStatus} className="mr-1.5 align-middle" />
                            Detected
                          </>
                        ) : (
                          "Not installed"
                        )}
                        <span className="sm:hidden"> · {r.currentAccounts} active</span>
                      </span>
                      {!r.globallyEnabled ? <span className="text-xs whitespace-normal text-warning">Disabled globally in Protocols</span> : null}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="hidden pt-4 md:table-cell">
                  {r.detected ? (
                    <span className="flex items-center gap-1.5 text-sm">
                      <ServiceDot status={r.serviceStatus} />
                      Detected
                      {r.nodeIdentifier ? <span className="font-mono text-xs text-muted-foreground">({r.nodeIdentifier})</span> : null}
                    </span>
                  ) : (
                    <span className="block text-sm text-muted-foreground">Not installed</span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-64 truncate pt-4 font-mono text-xs text-muted-foreground xl:table-cell" title={portsText(r.ports)}>
                  {portsText(r.ports) || "—"}
                  {r.transports.length ? <span className="block">{r.transports.join(", ")}</span> : null}
                </TableCell>
                <TableCell className="pt-4 text-right tabular-nums max-sm:hidden">{r.currentAccounts}</TableCell>
                <TableCell className="max-sm:row-start-2 max-sm:grid max-sm:content-start max-sm:gap-1">
                  <span className="text-xs text-muted-foreground sm:hidden" aria-hidden>
                    Max active
                  </span>
                  <Input
                    name={`max:${r.protocolId}`}
                    inputMode="numeric"
                    defaultValue={r.maxAccounts ?? ""}
                    placeholder="No limit"
                    disabled={!canEdit}
                    className="h-8 w-28 tabular-nums max-sm:w-full"
                    aria-label={`Maximum active ${r.name} accounts`}
                    aria-invalid={!!err(`max:${r.protocolId}`)}
                  />
                  {err(`max:${r.protocolId}`) ? <p className="mt-1 max-w-40 text-xs whitespace-normal text-destructive">{err(`max:${r.protocolId}`)}</p> : null}
                </TableCell>
                <TableCell className="max-sm:row-start-2 max-sm:min-w-0">
                  <div className="grid gap-1.5 max-sm:gap-1">
                    <span className="text-xs text-muted-foreground sm:hidden" aria-hidden>
                      Creation quota
                    </span>
                    <Input
                      name={`quota:${r.protocolId}`}
                      inputMode="numeric"
                      defaultValue={r.quotaLimit ?? ""}
                      placeholder="No quota"
                      disabled={!canEdit}
                      className="h-8 w-28 tabular-nums max-sm:w-full"
                      aria-label={`${r.name} accounts that can be created per reset period`}
                      aria-invalid={!!err(`quota:${r.protocolId}`)}
                    />
                    {err(`quota:${r.protocolId}`) ? (
                      <p className="max-w-48 text-xs whitespace-normal text-destructive">{err(`quota:${r.protocolId}`)}</p>
                    ) : r.detected ? (
                      <span className="max-w-48 text-xs whitespace-normal">
                        <QuotaUsage used={r.quotaUsed} limit={r.quotaLimit} />
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="pt-4 text-right max-sm:col-start-2 max-sm:row-start-1 max-sm:self-center">
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Max active</span> caps live accounts on this server.{" "}
          <span className="font-medium text-foreground">Creation quota</span> limits new accounts per reset period
          {resetLabel ? `; the current period ${resetLabel}` : ""}. Visitors see the lower of the two as “slots left”. Blank = no limit.
        </p>
        {canEdit ? (
          <Button type="submit" variant="outline" disabled={pending} className="shrink-0">
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <SaveIcon />}
            {submitLabel}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
