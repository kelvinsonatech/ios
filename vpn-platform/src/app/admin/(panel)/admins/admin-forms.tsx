"use client";

import { useState, useTransition } from "react";
import { EllipsisIcon, LoaderCircleIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { useServerAction } from "@/hooks/use-server-action";
import { changeRoleAction, createAdminAction, resetMfaAction, setActiveAction, setPasswordAction } from "./actions";

const ROLES = [
  ["super_admin", "Super Admin"],
  ["administrator", "Administrator"],
  ["server_manager", "Server Manager"],
  ["support", "Support"],
] as const;

export function CreateAdminForm() {
  const { state, pending, onSubmit } = useServerAction(createAdminAction);
  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2" noValidate>
      <FormField id="new-name" label="Name" errors={state.fieldErrors?.name}>
        <Input id="new-name" name="name" required />
      </FormField>
      <FormField id="new-email" label="Email" errors={state.fieldErrors?.email}>
        <Input id="new-email" name="email" type="email" required autoComplete="off" />
      </FormField>
      <FormField id="new-role" label="Role" errors={state.fieldErrors?.role}>
        <NativeSelect id="new-role" name="role" defaultValue="support">
          {ROLES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField id="new-password" label="Temporary password" errors={state.fieldErrors?.password} hint="12+ characters, mixed. Ask them to change it and enable 2FA.">
        <Input id="new-password" name="password" type="password" required autoComplete="new-password" />
      </FormField>
      <div className="flex justify-end sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? <LoaderCircleIcon className="animate-spin" /> : <UserPlusIcon />}
          Create administrator
        </Button>
      </div>
    </form>
  );
}

export function AdminRowMenu({ id, email, role, active, isSelf }: { id: string; email: string; role: string; active: boolean; isSelf: boolean }) {
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<null | "deactivate" | "mfa" | "password">(null);
  const [password, setPassword] = useState("");
  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.error) toast.error(r.error);
      else if (r.message) toast.success(r.message);
    });
  if (isSelf) return <span className="text-xs text-muted-foreground">You</span>;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`Manage ${email}`}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : <EllipsisIcon />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Change role</DropdownMenuLabel>
          {ROLES.filter(([v]) => v !== role).map(([v, l]) => (
            <DropdownMenuItem key={v} onSelect={() => run(() => changeRoleAction(id, v))}>
              {l}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("password")}>Set password</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("mfa")}>Reset 2FA</DropdownMenuItem>
          {active ? (
            <DropdownMenuItem variant="destructive" onSelect={() => setDialog("deactivate")}>
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => run(() => setActiveAction(id, true))}>Activate</DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmAction
        open={dialog === "deactivate"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Deactivate ${email}?`}
        description={<p>They are signed out everywhere and can no longer sign in. You can reactivate them later.</p>}
        confirmLabel="Deactivate"
        destructive
        action={() => setActiveAction(id, false)}
      />
      <ConfirmAction
        open={dialog === "mfa"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Reset two-factor authentication for ${email}?`}
        description={<p>Use this when they lost their device. They will be signed out and can set up 2FA again.</p>}
        confirmLabel="Reset 2FA"
        destructive
        action={() => resetMfaAction(id)}
      />
      <ConfirmAction
        open={dialog === "password"}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setPassword("");
          }
        }}
        title={`Set a new password for ${email}`}
        description={
          <div className="grid gap-2">
            <p>Their existing sessions are signed out.</p>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="New password" />
          </div>
        }
        confirmLabel="Set password"
        action={() => setPasswordAction(id, password)}
      />
    </>
  );
}
