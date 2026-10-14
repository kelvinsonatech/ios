"use client";

import { useState } from "react";
import Link from "next/link";
import { BanIcon, EllipsisIcon, ExternalLinkIcon, IdCardIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmAction } from "@/components/admin/confirm-action";
import { formatDateTime, relativeTime } from "@/components/admin/relative-time";
import { ProtocolIcon } from "@/components/protocol-icon";
import { Flag } from "@/components/public/flag";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";
import { revokeAccountAction } from "./actions";
import { ACCOUNT_STATUS, type AccountStatusName } from "./status";

/** Serializable, non-secret view of one account (built by the accounts page on the server). */
export interface AccountView {
  id: string;
  username: string | null;
  status: AccountStatusName;
  /** Same-origin DiceBear avatar URL. */
  avatarUrl: string;
  protocol: { name: string; slug: string; icon: string };
  server: { id: string; name: string; slug: string; countryCode: string; country: string };
  createdAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  revokedByEmail: string | null;
  durationDays: number;
  remoteAccountId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  /** Safe connection metadata (host, ports, transport, SNI, path ...), already redacted on the server. */
  metadata: Record<string, unknown>;
}

const ACRONYMS: Record<string, string> = { sni: "SNI", ip: "IP", tls: "TLS", udp: "UDP", tcp: "TCP", ws: "WS", grpc: "gRPC", dns: "DNS", ssh: "SSH", ssl: "SSL", url: "URL", id: "ID" };

const KEY_LABELS: Record<string, string> = { none_tls_ports: "Non-TLS ports", _artifacts: "Generated outputs" };

/** "tls_ports" → "TLS ports". */
function humanKey(key: string) {
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  const words = key.replace(/^_+/, "").split(/[_\s-]+/).filter(Boolean);
  return words.map((w, i) => ACRONYMS[w.toLowerCase()] ?? (i === 0 ? w[0]!.toUpperCase() + w.slice(1) : w)).join(" ");
}

function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function When({ iso, empty = "—" }: { iso: string | null; empty?: string }) {
  if (!iso) return <span className="text-muted-foreground">{empty}</span>;
  const d = new Date(iso);
  return (
    <span>
      {formatDateTime(d)} <span className="text-muted-foreground">· {relativeTime(d)}</span>
    </span>
  );
}

function Item({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 break-words", mono && "font-mono text-xs leading-5")}>{children}</dd>
    </>
  );
}

export function AccountDetailsDialog({ account, open, onOpenChange }: { account: AccountView; open: boolean; onOpenChange: (o: boolean) => void }) {
  const status = ACCOUNT_STATUS[account.status];
  const meta = Object.entries(account.metadata);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-xl">
        <DialogHeader className="flex-row items-center gap-4 text-left">
          <UserAvatar src={account.avatarUrl} size={64} className="ring-2 ring-border" />
          <div className="grid min-w-0 gap-1">
            <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
              <span className="truncate">{account.username ?? "Unnamed account"}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="inline-flex items-center gap-1.5">
                <ProtocolIcon name={account.protocol.icon} className="size-3.5" />
                {account.protocol.name}
              </span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1.5">
                <Flag code={account.server.countryCode} className="h-3 w-4" title={account.server.country} />
                {account.server.name}
              </span>
            </DialogDescription>
          </div>
        </DialogHeader>

        {account.failureMessage ? (
          <p className="rounded-md border border-destructive/30 bg-danger-soft p-3 text-sm text-destructive">
            {account.failureCode ? <span className="mr-1 font-mono text-xs">{account.failureCode}</span> : null}
            {account.failureMessage}
          </p>
        ) : null}

        <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-2 text-sm">
          <Item label="Created">
            <When iso={account.createdAt} />
          </Item>
          <Item label="Activated">
            <When iso={account.activatedAt} empty="Not yet" />
          </Item>
          <Item label="Expires">
            <When iso={account.expiresAt} />
          </Item>
          <Item label="Validity">{account.durationDays} days</Item>
          {account.revokedAt ? (
            <Item label="Revoked">
              <When iso={account.revokedAt} />
              {account.revokedByEmail ? <span className="block text-xs text-muted-foreground">by {account.revokedByEmail}</span> : null}
            </Item>
          ) : null}
          <Item label="Server">
            <Link href={`/admin/servers/${account.server.id}`} className="text-primary hover:underline">
              {account.server.name}
            </Link>{" "}
            <span className="font-mono text-xs text-muted-foreground">/{account.server.slug}</span>
          </Item>
          <Item label="Node account" mono>
            {account.remoteAccountId ?? "—"}
          </Item>
          <Item label="Account ID" mono>
            {account.id}
          </Item>
        </dl>

        <div className="grid gap-2">
          <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Connection details</h3>
          {meta.length ? (
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-5 gap-y-1.5 rounded-lg border bg-muted/30 p-3 text-sm">
              {meta.map(([k, v]) => (
                <Item key={k} label={humanKey(k)} mono>
                  {displayValue(v)}
                </Item>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No connection details recorded.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Passwords, keys and configuration files were shown to the user once and are not stored, so they cannot be displayed here.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Row menu: details dialog and (with accounts:manage) revoke with confirmation. */
export function AccountActions({ account, canManage, className }: { account: AccountView; canManage: boolean; className?: string }) {
  const [details, setDetails] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const revocable = canManage && (account.status === "active" || account.status === "pending");
  const label = account.username ?? "this account";
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} className={className}>
            <EllipsisIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="truncate">{label}</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => setDetails(true)}>
            <IdCardIcon /> View details
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/admin/servers/${account.server.id}`}>
              <ExternalLinkIcon /> Open server
            </Link>
          </DropdownMenuItem>
          {revocable ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => setConfirm(true)}>
                <BanIcon /> Revoke…
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <AccountDetailsDialog account={account} open={details} onOpenChange={setDetails} />
      {revocable ? (
        <ConfirmAction
          open={confirm}
          onOpenChange={setConfirm}
          title={`Revoke ${label}?`}
          destructive
          confirmLabel="Revoke account"
          description={
            <>
              <p>
                The {account.protocol.name} account is deleted on {account.server.name} and stops working immediately. Its slot is released; the
                creation quota is not refunded.
              </p>
              <p>This cannot be undone. The user would have to create a new account.</p>
            </>
          }
          action={() => revokeAccountAction(account.id)}
        />
      ) : null}
    </>
  );
}

/** The account name in a list: opens the details dialog. */
export function AccountName({ account }: { account: AccountView }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 items-center gap-3 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <UserAvatar src={account.avatarUrl} size={40} />
        <span className="grid min-w-0">
          <span className="truncate font-medium hover:underline">{account.username ?? <span className="text-muted-foreground">Unnamed</span>}</span>
          <span className="truncate font-mono text-[11px] text-muted-foreground">{account.remoteAccountId ?? account.id.slice(0, 8)}</span>
        </span>
      </button>
      <AccountDetailsDialog account={account} open={open} onOpenChange={setOpen} />
    </>
  );
}
