"use client";

import { AlertCircleIcon, LoaderCircleIcon } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useServerAction } from "@/hooks/use-server-action";
import { loginAction } from "./actions";

export function LoginForm() {
  // Submitted via onSubmit (not <form action>) so typed values survive an error response.
  const { state, pending, onSubmit } = useServerAction((fd) => loginAction({}, fd), { toasts: false });
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      {state.error ? (
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertDescription>{state.error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}
