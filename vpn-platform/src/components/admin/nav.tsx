"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ActivityIcon,
  LayoutDashboardIcon,
  Layers3Icon,
  ScrollTextIcon,
  ServerIcon,
  UsersIcon,
  UserCogIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type NavKey = "dashboard" | "servers" | "protocols" | "accounts" | "logs" | "admins";

const ITEMS: { key: NavKey; href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", href: "/admin", label: "Dashboard", icon: LayoutDashboardIcon },
  { key: "servers", href: "/admin/servers", label: "Servers", icon: ServerIcon },
  { key: "protocols", href: "/admin/protocols", label: "Protocols", icon: Layers3Icon },
  { key: "accounts", href: "/admin/accounts", label: "Accounts", icon: UsersIcon },
  { key: "logs", href: "/admin/logs", label: "Logs", icon: ScrollTextIcon },
  { key: "admins", href: "/admin/admins", label: "Administrators", icon: UserCogIcon },
];

export function AdminNav({ allowed, onNavigate }: { allowed: NavKey[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-0.5" aria-label="Admin">
      {ITEMS.filter((i) => allowed.includes(i.key)).map((item) => {
        const active = item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
        const Icon = item.icon;
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
          </Link>
        );
      })}
    </nav>
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
