"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, ChevronRightIcon, FlagIcon, HomeIcon, InfoIcon, MailIcon, MenuIcon, UserRoundIcon, XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Brand } from "@/components/brand";
import { ProtocolIcon } from "@/components/protocol-icon";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AvatarStack, CountBadge, useActiveAccounts } from "./my-accounts-menu";
import { groupProtocols, type NavProtocol } from "./services-menu";

const LINKS = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/server-status", label: "Server status", icon: ActivityIcon },
  { href: "/my-accounts", label: "My accounts", icon: UserRoundIcon },
  { href: "/report", label: "Report a problem", icon: FlagIcon },
  { href: "/contact", label: "Contact", icon: MailIcon },
  { href: "/about", label: "About", icon: InfoIcon },
];

/** Slide-in navigation drawer for phones and tablets (radix Dialog: focus trap, Esc, scroll lock). */
export function SiteMobileNav({ siteName, protocols }: { siteName: string; protocols: NavProtocol[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { active } = useActiveAccounts();
  const close = () => setOpen(false);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon" className="relative lg:hidden" aria-label="Open menu">
          <MenuIcon className="size-5" />
          {active.length > 0 ? <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-primary ring-2 ring-background" aria-hidden /> : null}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-50 flex w-[min(22rem,88vw)] flex-col border-l bg-background shadow-2xl duration-300 data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right">
          <div className="flex h-16 items-center justify-between gap-3 border-b px-4">
            <Link href="/" onClick={close} className="min-w-0 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
              <Brand name={siteName} />
            </Link>
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Site navigation and services</DialogPrimitive.Description>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close menu">
                <XIcon className="size-5" />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3 py-4">
            <ul className="space-y-0.5">
              {LINKS.map((l) => {
                const current = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={close}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                        current ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                      )}
                    >
                      <l.icon className="size-4 text-muted-foreground" />
                      <span className="flex-1">{l.label}</span>
                      {l.href === "/my-accounts" ? (
                        <span className="flex items-center gap-2">
                          <AvatarStack accounts={active} size={20} />
                          <CountBadge count={active.length} />
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>

            <div className="mt-6">
              {groupProtocols(protocols).map((g) => (
                <div key={g.category} className="mb-4">
                  <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{g.label}</p>
                  <ul className="space-y-0.5">
                    {g.items.map((p) => (
                      <li key={p.slug}>
                        <Link
                          href={p.href}
                          onClick={close}
                          className={cn(
                            "flex h-11 items-center gap-3 rounded-xl px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            pathname === p.href || pathname.startsWith(`${p.href}/`) ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                          )}
                        >
                          <span className="flex size-7 items-center justify-center rounded-lg bg-accent">
                            <ProtocolIcon name={p.icon} className="size-3.5 text-primary" />
                          </span>
                          <span className="flex-1 font-medium">{p.name}</span>
                          <span className="text-xs text-muted-foreground tabular-nums">{p.serverCount}</span>
                          <ChevronRightIcon className="size-4 text-muted-foreground/60" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </nav>

          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm text-muted-foreground">Appearance</span>
            <ThemeToggle />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
