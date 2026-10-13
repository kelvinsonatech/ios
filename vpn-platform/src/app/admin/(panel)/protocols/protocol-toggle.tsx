"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { toggleProtocolAction } from "./actions";

export function ProtocolToggle({ id, name, enabled, disabled }: { id: string; name: string; enabled: boolean; disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Switch
      checked={enabled}
      disabled={disabled || pending}
      aria-label={`${enabled ? "Disable" : "Enable"} ${name}`}
      onCheckedChange={(v) =>
        start(async () => {
          const r = await toggleProtocolAction(id, v);
          if (r.error) toast.error(r.error);
          else if (r.message) toast.success(r.message);
        })
      }
    />
  );
}
