"use client";

import Link from "next/link";
import { ArrowRightIcon, PlusIcon, UserRoundIcon } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { SavedAccountSummary } from "@/lib/public/types";
import { Flag } from "./flag";
import { Countdown, useNow } from "./live-time";
import { navItemClass } from "./nav";
import { useSavedAccounts } from "./account/saved-accounts";

const NONE: SavedAccountSummary[] = [];

/** Accounts on this device that have not expired yet (all of them until the clock is known). */
export function useActiveAccounts(): { all: SavedAccountSummary[]; active: SavedAccountSummary[] } {
  const all = useSavedAccounts() ?? NONE;
  const now = useNow();
  const active = now === null ? all : all.filter((a) => Date.parse(a.expiresAt) > now);
  return { all, active };
}

/** Up to three DiceBear avatars of saved accounts, overlapping. */
export function AvatarStack({ accounts, size = 22, className }: { accounts: SavedAccountSummary[]; size?: number; className?: string }) {
  const shown = accounts.filter((a) => a.avatar).slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <span className={cn("flex -space-x-2", className)} aria-hidden>
      {shown.map((a) => (
        <UserAvatar key={a.id} src={a.avatar} size={size} className="ring-2 ring-background" />
      ))}
    </span>
  );
}

export function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground tabular-nums", className)}>
      {count > 99 ? "99+" : count}
      <span className="sr-only"> active</span>
    </span>
  );
}

/**
 * Header "My accounts" entry: count badge plus a dropdown with the DiceBear profiles of the
 * accounts created on this device (non-secret summaries only), linking to /my-accounts.
 */
export function MyAccountsMenu({ active: routeActive }: { active: boolean }) {
  const { all, active } = useActiveAccounts();
  return (
    <DropdownMenu modal={false}>
      {/* The accessible name is the visible text plus the badge ("My accounts 2 active"). */}
      <DropdownMenuTrigger className={cn(navItemClass(routeActive), "group")}>
        {active.length > 0 ? <AvatarStack accounts={active} size={20} /> : <UserRoundIcon />}
        My accounts
        <CountBadge count={active.length} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl p-2 shadow-xl">
        <div className="px-2 pt-1 pb-2">
          <p className="text-sm font-semibold">Accounts on this device</p>
          <p className="text-xs text-muted-foreground">Saved only in this browser. Passwords and configs are never kept in this list.</p>
        </div>
        {all.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-xl bg-muted/50 px-4 py-6 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-card ring-1 ring-border">
              <UserRoundIcon className="size-5 text-muted-foreground" />
            </span>
            <p className="text-sm text-muted-foreground">No accounts yet. Create one and it will show up here.</p>
          </div>
        ) : (
          all.slice(0, 5).map((a) => <AccountRow key={a.id} account={a} />)
        )}
        <DropdownMenuSeparator className="my-2" />
        <div className="flex items-center justify-between gap-2">
          <DropdownMenuItem asChild className="rounded-lg text-xs font-medium">
            <Link href="/my-accounts">
              View all{all.length > 5 ? ` (${all.length})` : ""}
              <ArrowRightIcon className="size-3.5" />
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-lg text-xs font-medium text-primary">
            <Link href="/#protocols">
              <PlusIcon className="text-primary" />
              New account
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountRow({ account: a }: { account: SavedAccountSummary }) {
  const now = useNow();
  const expired = now !== null && Date.parse(a.expiresAt) <= now;
  return (
    <DropdownMenuItem asChild className="gap-3 rounded-xl p-2">
      <Link href="/my-accounts">
        {a.avatar ? (
          <UserAvatar src={a.avatar} size={36} className={cn(expired && "opacity-50 grayscale")} />
        ) : (
          <span className="flex size-9 items-center justify-center rounded-full bg-muted">
            <UserRoundIcon />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-foreground">{a.username ?? a.protocol.name}</span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {a.server.countryCode ? <Flag code={a.server.countryCode} className="h-2.5 w-3.5" /> : null}
            <span className="truncate">
              {a.protocol.name} · {a.server.name}
            </span>
          </span>
        </span>
        <span className={cn("shrink-0 text-[11px] font-medium", expired ? "text-muted-foreground" : "text-success")}>
          {expired ? "Expired" : <Countdown iso={a.expiresAt} doneText="Expired" />}
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

/** Compact My accounts link for small screens (avatar of the newest account + count). */
export function MyAccountsButton({ className }: { className?: string }) {
  const { active } = useActiveAccounts();
  const newest = active.find((a) => a.avatar);
  return (
    <Link
      href="/my-accounts"
      className={cn(
        "relative inline-flex size-10 items-center justify-center rounded-lg text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
        className,
      )}
    >
      <span className="sr-only">My accounts</span>
      {newest ? <UserAvatar src={newest.avatar} size={26} /> : <UserRoundIcon className="size-5" />}
      {active.length > 0 ? <CountBadge count={active.length} className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 text-[10px] ring-2 ring-background" /> : null}
    </Link>
  );
}
