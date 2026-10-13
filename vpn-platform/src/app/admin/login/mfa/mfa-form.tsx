"use client";

import { useActionState } from "react";
import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initialActionState } from "@/lib/action-state";
import { mfaAction } from "../actions";

export function MfaForm() {
  const [state, action, pending] = useActionState(mfaAction, initialActionState);
  return (
    <form action={action} className="grid gap-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="code">Authentication code</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="123 456"
          required
          autoFocus
          className="font-mono tracking-widest"
        />
        <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app, or a recovery code.</p>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
        Verify
      </Button>
    </form>
  );
}
