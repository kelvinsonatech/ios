"use client";

import { useTransition } from "react";
import { ActivityIcon, LoaderCircleIcon, RefreshCwIcon, SendIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { publishServerAction, syncServerAction, testConnectionAction } from "./actions";
import { ResultDialog, useOperation } from "./server-actions-menu";

export function TestConnectionButton({ serverId }: { serverId: string }) {
  const op = useOperation();
  return (
    <>
      <Button variant="outline" disabled={op.pending} onClick={() => op.run("Connection test", () => testConnectionAction(serverId), "check")}>
        {op.pending ? <LoaderCircleIcon className="animate-spin" /> : <ActivityIcon />}
        Test connection
      </Button>
      <ResultDialog result={op.result?.check ?? null} title={op.result?.title ?? ""} onClose={() => op.setResult(null)} />
    </>
  );
}

export function SyncButton({ serverId, label = "Sync server" }: { serverId: string; label?: string }) {
  const op = useOperation();
  return (
    <>
      <Button variant="outline" disabled={op.pending} onClick={() => op.run("Synchronisation", () => syncServerAction(serverId), "sync")}>
        {op.pending ? <LoaderCircleIcon className="animate-spin" /> : <RefreshCwIcon />}
        {label}
      </Button>
      <ResultDialog result={op.result?.check ?? null} title={op.result?.title ?? ""} onClose={() => op.setResult(null)} />
    </>
  );
}

export function PublishButton({ serverId, disabled }: { serverId: string; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="lg"
      disabled={disabled || pending}
      onClick={() =>
        start(async () => {
          const r = await publishServerAction(serverId);
          if (r.error) toast.error(r.error);
          else if (r.message) toast.success(r.message);
        })
      }
    >
      {pending ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
      Publish server
    </Button>
  );
}
