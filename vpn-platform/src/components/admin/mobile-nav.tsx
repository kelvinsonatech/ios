"use client";

import { useState } from "react";
import { MenuIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { AdminNav, PublicSiteLink, type NavBadges, type NavKey } from "./nav";

export function MobileNav({ allowed, badges, siteName }: { allowed: NavKey[]; badges?: NavBadges; siteName?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
          <MenuIcon />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto border-r bg-sidebar p-4 shadow-lg data-[state=open]:animate-in data-[state=open]:slide-in-from-left">
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <Brand suffix="Admin" name={siteName} />
          <AdminNav allowed={allowed} badges={badges} onNavigate={() => setOpen(false)} />
          <div className="mt-auto border-t border-sidebar-border pt-3">
            <PublicSiteLink onNavigate={() => setOpen(false)} />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
