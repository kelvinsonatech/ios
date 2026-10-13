"use client";

import { useState, useTransition } from "react";
import { DownloadIcon, KeyRoundIcon, LoaderCircleIcon, ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "@/components/copy-button";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { FormField } from "@/components/admin/form-field";
import { useServerAction } from "@/hooks/use-server-action";
import { beginMfaAction, changePasswordAction, confirmMfaAction, disableMfaAction, regenerateCodesAction, revokeSessionAction } from "./actions";

export function ChangePasswordForm() {
  const { pending, onSubmit } = useServerAction(changePasswordAction);
  return (
    <form
      onSubmit={(e) => {
        onSubmit(e);
      }}
      className="grid gap-4 sm:max-w-md"
    >
      <FormField id="current" label="Current password">
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
      </FormField>
      <FormField id="next" label="New password" hint="At least 12 characters mixing letters, digits and symbols.">
        <Input id="next" name="next" type="password" autoComplete="new-password" required />
      </FormField>
      <FormField id="confirm" label="Confirm new password">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </FormField>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <KeyRoundIcon />}
        Change password
      </Button>
    </form>
  );
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const text = codes.join("\n");
  return (
    <Alert variant="success">
      <ShieldCheckIcon />
      <AlertTitle>Save your recovery codes</AlertTitle>
      <AlertDescription>
        <p>Each code works once if you lose your authenticator. They will not be shown again.</p>
        <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-card p-3 font-mono text-sm text-foreground">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <CopyButton value={text} label="Copy recovery codes" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const url = URL.createObjectURL(new Blob([text + "\n"], { type: "text/plain" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = "recovery-codes.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            <DownloadIcon /> Download
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}

export function MfaPanel({ enabled }: { enabled: boolean }) {
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<null | "disable" | "regen">(null);
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  if (codes) return <RecoveryCodes codes={codes} />;

  if (enabled) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setDialog("regen")}>
          <KeyRoundIcon /> New recovery codes
        </Button>
        <Button variant="outline" onClick={() => setDialog("disable")}>
          <ShieldOffIcon /> Disable 2FA
        </Button>
        {(["disable", "regen"] as const).map((kind) => (
          <ConfirmAction
            key={kind}
            open={dialog === kind}
            onOpenChange={(o) => {
              if (!o) {
                setDialog(null);
                setPassword("");
              }
            }}
            title={kind === "disable" ? "Disable two-factor authentication?" : "Generate new recovery codes?"}
            description={
              <div className="grid gap-2">
                <p>{kind === "disable" ? "Your account will be protected by your password only." : "Your current recovery codes stop working."}</p>
                <Input type="password" placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
            }
            confirmLabel={kind === "disable" ? "Disable 2FA" : "Generate"}
            destructive={kind === "disable"}
            action={() => (kind === "disable" ? disableMfaAction(password) : regenerateCodesAction(password))}
            onDone={(r) => {
              const c = r.data?.recoveryCodes as string[] | undefined;
              if (c) setCodes(c);
            }}
          />
        ))}
      </div>
    );
  }

  if (!setup) {
    return (
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await beginMfaAction();
            if (r.error) toast.error(r.error);
            else setSetup(r.data as { qr: string; secret: string });
          })
        }
      >
        {pending ? <LoaderCircleIcon className="animate-spin" /> : <ShieldCheckIcon />}
        Set up two-factor authentication
      </Button>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={setup.qr} alt="Scan this QR code with your authenticator app" width={180} height={180} className="rounded-lg border bg-white p-2" />
      <div className="grid content-start gap-3">
        <p className="text-sm">Scan the QR code with an authenticator app (1Password, Authy, Google Authenticator…), then enter the 6-digit code.</p>
        <p className="text-xs text-muted-foreground">
          Can&apos;t scan? Enter this key manually: <span className="font-mono break-all text-foreground">{setup.secret}</span>
        </p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await confirmMfaAction(code);
              if (r.error) toast.error(r.error);
              else {
                toast.success(r.message ?? "Enabled");
                setCodes((r.data?.recoveryCodes as string[]) ?? []);
              }
            });
          }}
        >
          <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" className="w-36 font-mono" />
          <Button type="submit" disabled={pending}>
            {pending ? <LoaderCircleIcon className="animate-spin" /> : null}
            Verify & enable
          </Button>
        </form>
      </div>
    </div>
  );
}

export function RevokeSessionButton({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await revokeSessionAction(id);
          if (r.error) toast.error(r.error);
          else if (r.message) toast.success(r.message);
        })
      }
    >
      Sign out
    </Button>
  );
}
