"use client";

import Link from "next/link";
import { ActivityIcon, ChevronDownIcon, ServerIcon } from "lucide-react";
import { ProtocolIcon } from "@/components/protocol-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { groupProtocols, navItemClass, type NavProtocol } from "./nav";

/** "Services" mega-menu: every protocol with icon, short description and live server counts. */
export function ServicesMenu({ protocols, active }: { protocols: NavProtocol[]; active: boolean }) {
  const groups = groupProtocols(protocols);
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger className={cn(navItemClass(active), "group")}>
        <ServerIcon />
        Services
        <ChevronDownIcon className="opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={10} className="w-[min(44rem,calc(100vw-2rem))] rounded-2xl p-2 shadow-xl">
        {groups.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No services are available yet. Please check back soon.</p>
        ) : (
          groups.map((g, gi) => (
            <div key={g.category} className={cn(gi > 0 && "mt-1")}>
              {groups.length > 1 ? <DropdownMenuLabel className="px-2.5 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{g.label}</DropdownMenuLabel> : null}
              <div className="grid gap-0.5 sm:grid-cols-2">
                {g.items.map((p) => (
                  <DropdownMenuItem key={p.slug} asChild className="items-start gap-3 rounded-xl p-2.5">
                    <Link href={p.href}>
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent ring-1 ring-primary/10">
                        <ProtocolIcon name={p.icon} className="size-5 text-primary" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-foreground">{p.name}</span>
                          <span
                            className={cn(
                              "ml-auto shrink-0 rounded-full px-1.5 py-px text-[10px] font-semibold tabular-nums",
                              p.availableCount > 0 ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
                            )}
                          >
                            {p.serverCount} server{p.serverCount === 1 ? "" : "s"}
                          </span>
                        </span>
                        <span className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{p.description}</span>
                      </span>
                    </Link>
                  </DropdownMenuItem>
                ))}
              </div>
            </div>
          ))
        )}
        <DropdownMenuSeparator className="my-2" />
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <DropdownMenuItem asChild className="rounded-lg text-xs font-medium">
            <Link href="/server-status">
              <ActivityIcon className="text-primary" />
              Live server status
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="rounded-lg text-xs text-muted-foreground">
            <Link href="/#protocols">Compare all protocols →</Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
