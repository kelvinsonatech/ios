"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  ExternalLinkIcon,
  FlagIcon,
  LayoutDashboardIcon,
  Layers3Icon,
  ScrollTextIcon,
  ServerIcon,
  SlidersHorizontalIcon,
  UsersIcon,
  UserCogIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavKey = "dashboard" | "servers" | "protocols" | "accounts" | "reports" | "logs" | "admins" | "settings";

/** Small counters next to nav items (e.g. open reports). Zero or missing hides the badge. */
export type NavBadges = Partial<Record<NavKey, number>>;

const ITEMS: { key: NavKey; href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", href: "/admin", label: "Dashboard", icon: LayoutDashboardIcon },
  { key: "servers", href: "/admin/servers", label: "Servers", icon: ServerIcon },
  { key: "protocols", href: "/admin/protocols", label: "Protocols", icon: Layers3Icon },
  { key: "accounts", href: "/admin/accounts", label: "Accounts", icon: UsersIcon },
  { key: "reports", href: "/admin/reports", label: "Reports", icon: FlagIcon },
  { key: "logs", href: "/admin/logs", label: "Logs", icon: ScrollTextIcon },
  { key: "admins", href: "/admin/admins", label: "Administrators", icon: UserCogIcon },
  { key: "settings", href: "/admin/settings", label: "Site settings", icon: SlidersHorizontalIcon },
];

export function AdminNav({ allowed, badges, onNavigate }: { allowed: NavKey[]; badges?: NavBadges; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5" aria-label="Admin">
      {ITEMS.filter((i) => allowed.includes(i.key)).map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const Icon = item.icon;
        const badge = badges?.[item.key];
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-foreground",
              active && "bg-sidebar-accent text-foreground",
            )}
          >
            <Icon className={cn("size-4", active ? "text-primary" : "text-muted-foreground")} />
            {item.label}
            {badge ? (
              <span
                className="ml-auto min-w-5 rounded-full bg-warning-soft px-1.5 py-px text-center text-[11px] font-semibold text-warning tabular-nums"
                aria-label={`${badge} open`}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

/** Sidebar footer link to the public website (opens in a new tab). */
export function PublicSiteLink({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <a
      href="/"
      target="_blank"
      rel="noopener"
      onClick={onNavigate}
      className="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-foreground"
    >
      <ExternalLinkIcon className="size-4 text-muted-foreground" />
      View public site
    </a>
  );
}

export function SystemStatusHint() {
  return (
    <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-card/60 px-2.5 py-2 text-xs text-muted-foreground">
      <ActivityIcon className="size-3.5 text-primary" />
      Control plane
    </div>
  );
}
