"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ActivityIcon, ChevronDownIcon, FlagIcon, HomeIcon, InfoIcon, LifeBuoyIcon, MailIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MyAccountsButton, MyAccountsMenu } from "./my-accounts-menu";
import { ServicesMenu, navItemClass, type NavProtocol } from "./services-menu";
import { SiteMobileNav } from "./site-mobile-nav";

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const scrolledSnapshot = () => window.scrollY > 8;

/**
 * Sticky, glassy site header: brand, Services mega-menu, status, My accounts (DiceBear avatars +
 * count), support menu and theme switch; a drawer replaces the links below the lg breakpoint.
 */
export function SiteHeader({ siteName, protocols }: { siteName: string; protocols: NavProtocol[] }) {
  const pathname = usePathname();
  const scrolled = useSyncExternalStore(subscribeScroll, scrolledSnapshot, () => false);
  const inServices = protocols.some((p) => pathname === p.href || pathname.startsWith(`${p.href}/`));
  const inSupport = ["/report", "/contact", "/about"].some((p) => pathname.startsWith(p));

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-[background-color,box-shadow,border-color] duration-300",
        scrolled
          ? "border-border/70 bg-background/80 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.18)] backdrop-blur-xl supports-[backdrop-filter]:bg-background/65"
          : "border-transparent bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/80",
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="mr-auto min-w-0 rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={`${siteName} home`}>
          <Brand name={siteName} className="text-lg" markClassName="size-8" />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
          <Link href="/" aria-current={pathname === "/" ? "page" : undefined} className={navItemClass(pathname === "/")}>
            <HomeIcon />
            Home
          </Link>
          <ServicesMenu protocols={protocols} active={inServices} />
          <Link
            href="/server-status"
            aria-current={pathname.startsWith("/server-status") ? "page" : undefined}
            className={navItemClass(pathname.startsWith("/server-status"))}
          >
            <ActivityIcon />
            Server status
          </Link>
          <MyAccountsMenu active={pathname.startsWith("/my-accounts")} />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger className={cn(navItemClass(inSupport), "group")}>
              <LifeBuoyIcon />
              Support
              <ChevronDownIcon className="opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={10} className="w-60 rounded-2xl p-2 shadow-xl">
              <SupportItem href="/report" icon={<FlagIcon />} title="Report a problem" text="A server is down or slow" />
              <SupportItem href="/contact" icon={<MailIcon />} title="Contact" text="Questions and feedback" />
              <SupportItem href="/about" icon={<InfoIcon />} title="About" text="How the service works" />
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>

        <div className="flex items-center gap-1 lg:ml-2">
          <MyAccountsButton className="lg:hidden" />
          <ThemeToggle className="size-10" />
          <SiteMobileNav siteName={siteName} protocols={protocols} />
        </div>
      </div>
    </header>
  );
}

function SupportItem({ href, icon, title, text }: { href: string; icon: React.ReactNode; title: string; text: string }) {
  return (
    <DropdownMenuItem asChild className="items-start gap-3 rounded-xl p-2.5">
      <Link href={href}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted [&_svg]:text-primary">{icon}</span>
        <span className="min-w-0">
          <span className="block font-medium text-foreground">{title}</span>
          <span className="block text-xs text-muted-foreground">{text}</span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}
