"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ActivityIcon,
  BanIcon,
  CheckCircle2Icon,
  ConstructionIcon,
  EllipsisIcon,
  EyeIcon,
  Layers3Icon,
  LoaderCircleIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCwIcon,
  Trash2Icon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/admin/confirm-action";
import type { ActionState } from "@/lib/action-state";
import {
  deleteServerAction,
  restartAgentAction,
  setLifecycleAction,
  syncServerAction,
  testConnectionAction,
} from "./actions";

type Check = {
  ok: boolean;
  latencyMs?: number;
  info?: { apiVersion: string; agentVersion: string; hostname: string; publicIp?: string; protocols: string[] };
  health?: { status: string; cpuPercent?: number; uptimeSeconds?: number };
  compatibility: string;
  compatibilityReasons: string[];
  warnings: string[];
  error?: { code: string; message: string };
  added?: string[];
  removed?: string[];
  unmapped?: string[];
  protocols?: { name: string; detected: boolean; enabled: boolean; isNew: boolean }[];
};

export interface ServerMenuProps {
  server: { id: string; name: string; lifecycle: "draft" | "active" | "maintenance" | "disabled"; restartSupported: boolean };
  permissions: { edit: boolean; operate: boolean; delete: boolean; viewAccounts: boolean };
  variant?: "icon" | "button";
}

export function ResultDialog({ result, title, onClose }: { result: Check | null; title: string; onClose: () => void }) {
  return (
    <Dialog open={!!result} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result?.ok ? <CheckCircle2Icon className="size-5 text-success" /> : <XCircleIcon className="size-5 text-destructive" />}
            {title}
          </DialogTitle>
          <DialogDescription>{result?.ok ? "The server responded correctly." : result?.error?.message}</DialogDescription>
        </DialogHeader>
        {result?.ok ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Latency</dt>
            <dd className="tabular-nums">{result.latencyMs} ms</dd>
            <dt className="text-muted-foreground">API / script version</dt>
            <dd>
              {result.info?.apiVersion} / {result.info?.agentVersion}{" "}
              {result.compatibility !== "compatible" ? (
                <Badge variant={result.compatibility === "unsupported" ? "danger" : "warning"} className="ml-1">
                  {result.compatibility}
                </Badge>
              ) : null}
            </dd>
            <dt className="text-muted-foreground">Reported hostname</dt>
            <dd className="font-mono text-xs">{result.info?.hostname}</dd>
            {result.health ? (
              <>
                <dt className="text-muted-foreground">Health</dt>
                <dd>
                  {result.health.status}
                  {result.health.cpuPercent !== undefined ? ` · CPU ${result.health.cpuPercent}%` : ""}
                </dd>
              </>
            ) : null}
            {result.protocols ? (
              <>
                <dt className="text-muted-foreground">Detected</dt>
                <dd className="flex flex-wrap gap-1">
                  {result.protocols
                    .filter((p) => p.detected)
                    .map((p) => (
                      <Badge key={p.name} variant={p.isNew ? "info" : "secondary"}>
                        {p.name}
                        {p.isNew ? " · new" : ""}
                      </Badge>
                    ))}
                </dd>
              </>
            ) : null}
            {result.removed?.length ? (
              <>
                <dt className="text-muted-foreground">No longer reported</dt>
                <dd>{result.removed.join(", ")}</dd>
              </>
            ) : null}
            {result.unmapped?.length ? (
              <>
                <dt className="text-muted-foreground">Unmapped identifiers</dt>
                <dd className="font-mono text-xs">{result.unmapped.join(", ")}</dd>
              </>
            ) : null}
          </dl>
        ) : (
          <p className="font-mono text-xs text-muted-foreground">Error code: {result?.error?.code}</p>
        )}
        {[...(result?.compatibilityReasons ?? []), ...(result?.warnings ?? [])].length ? (
          <ul className="grid gap-1 rounded-md border border-warning/30 bg-warning-soft p-3 text-sm">
            {[...(result?.compatibilityReasons ?? []), ...(result?.warnings ?? [])].map((w) => (
              <li key={w}>• {w}</li>
            ))}
          </ul>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function useOperation() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ title: string; check: Check } | null>(null);
  const run = (title: string, fn: () => Promise<ActionState>, key: "check" | "sync") =>
    start(async () => {
      const r = await fn();
      const check = (r.data?.[key] ?? null) as Check | null;
      if (check) setResult({ title, check });
      else if (r.error) toast.error(r.error);
      if (r.ok && r.message) toast.success(r.message);
    });
  return { pending, result, setResult, run };
}

export function ServerActionsMenu({ server, permissions, variant = "icon" }: ServerMenuProps) {
  const op = useOperation();
  const [confirm, setConfirm] = useState<null | "maintenance" | "disable" | "restart" | "delete">(null);
  const [lifecyclePending, startLifecycle] = useTransition();

  const lifecycle = (target: "active" | "maintenance" | "disabled") =>
    startLifecycle(async () => {
      const r = await setLifecycleAction(server.id, target);
      if (r.error) toast.error(r.error);
      else if (r.message) toast.success(r.message);
    });

  const busy = op.pending || lifecyclePending;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === "icon" ? (
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${server.name}`} disabled={busy}>
              {busy ? <LoaderCircleIcon className="animate-spin" /> : <EllipsisIcon />}
            </Button>
          ) : (
            <Button variant="outline" disabled={busy}>
              {busy ? <LoaderCircleIcon className="animate-spin" /> : <EllipsisIcon />}
              Actions
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel>{server.name}</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href={`/admin/servers/${server.id}`}>
              <EyeIcon /> View
            </Link>
          </DropdownMenuItem>
          {permissions.edit ? (
            <DropdownMenuItem asChild>
              <Link href={`/admin/servers/${server.id}/edit`}>
                <PencilIcon /> Edit
              </Link>
            </DropdownMenuItem>
          ) : null}
          {permissions.operate ? (
            <>
              <DropdownMenuItem onSelect={() => op.run("Connection test", () => testConnectionAction(server.id), "check")}>
                <ActivityIcon /> Test connection
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => op.run("Synchronisation", () => syncServerAction(server.id), "sync")}>
                <RefreshCwIcon /> Sync
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuItem asChild>
            <Link href={`/admin/servers/${server.id}/protocols`}>
              <Layers3Icon /> Protocols
            </Link>
          </DropdownMenuItem>
          {permissions.viewAccounts ? (
            <DropdownMenuItem asChild>
              <Link href={`/admin/accounts?server=${server.id}`}>
                <UsersIcon /> Accounts
              </Link>
            </DropdownMenuItem>
          ) : null}
          {permissions.operate && server.lifecycle !== "draft" ? (
            <>
              <DropdownMenuSeparator />
              {server.lifecycle === "maintenance" || server.lifecycle === "disabled" ? (
                <DropdownMenuItem onSelect={() => lifecycle("active")}>
                  <PlayIcon /> {server.lifecycle === "maintenance" ? "End maintenance" : "Enable"}
                </DropdownMenuItem>
              ) : null}
              {server.lifecycle === "active" ? (
                <DropdownMenuItem onSelect={() => setConfirm("maintenance")}>
                  <ConstructionIcon /> Maintenance
                </DropdownMenuItem>
              ) : null}
              {server.lifecycle !== "disabled" ? (
                <DropdownMenuItem onSelect={() => setConfirm("disable")}>
                  <BanIcon /> Disable
                </DropdownMenuItem>
              ) : null}
            </>
          ) : null}
          {permissions.operate && server.restartSupported ? (
            <DropdownMenuItem onSelect={() => setConfirm("restart")}>
              <RotateCwIcon /> Restart provisioning service
            </DropdownMenuItem>
          ) : null}
          {permissions.delete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm("delete")}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ResultDialog result={op.result?.check ?? null} title={op.result?.title ?? ""} onClose={() => op.setResult(null)} />

      <ConfirmAction
        open={confirm === "maintenance"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Put ${server.name} into maintenance?`}
        description={
          <>
            <p>Existing accounts keep working. New account creation on this server is paused.</p>
            <p>Users see “Server temporarily under maintenance.”</p>
          </>
        }
        confirmLabel="Enable maintenance"
        action={() => setLifecycleAction(server.id, "maintenance")}
      />
      <ConfirmAction
        open={confirm === "disable"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Disable ${server.name}?`}
        description={<p>The server is removed from every public page and no new accounts can be created. Existing accounts on the server are not touched.</p>}
        confirmLabel="Disable server"
        destructive
        action={() => setLifecycleAction(server.id, "disabled")}
      />
      <ConfirmAction
        open={confirm === "restart"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Restart provisioning service?"
        description={<p>Asks the server&apos;s provisioning agent to restart itself. Requests in progress on that server may fail and will be reconciled.</p>}
        confirmLabel="Restart"
        action={() => restartAgentAction(server.id)}
      />
      <ConfirmAction
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete ${server.name}?`}
        description={
          <>
            <p>The server disappears from the website and its API credentials are revoked. Account history is kept.</p>
            <p>Accounts that already exist on the server itself are not removed.</p>
          </>
        }
        confirmLabel="Delete server"
        destructive
        requireText={server.name}
        action={(typed) => deleteServerAction(server.id, typed)}
      />
    </>
  );
}
