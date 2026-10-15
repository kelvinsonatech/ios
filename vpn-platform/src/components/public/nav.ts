import { cn } from "@/lib/utils";
import type { PublicProtocolSummary } from "@/lib/public/types";

/**
 * Navigation helpers shared by server and client components (header, drawer, footer, protocol
 * cards). Deliberately not a "use client" module: server components call these functions directly.
 */

/** Protocol fields the navigation needs (kept small: it is serialised into every public page). */
export type NavProtocol = Pick<PublicProtocolSummary, "slug" | "name" | "description" | "icon" | "category" | "serverCount" | "availableCount" | "href">;

const CATEGORY_LABEL: Record<string, string> = {
  ssh: "SSH tunnels",
  v2ray: "V2Ray / Xray",
  vpn: "VPN",
  proxy: "Proxy",
  udp: "UDP",
};

/** "v2ray" → "V2Ray / Xray"; unknown categories are title-cased. */
export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category] ?? category.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Protocols grouped by category, in first-seen order. */
export function groupProtocols<T extends Pick<NavProtocol, "category">>(protocols: T[]): { category: string; label: string; items: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const p of protocols) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
  return [...groups].map(([category, items]) => ({ category, label: categoryLabel(category), items }));
}

/** Header link / menu trigger style; `active` marks the current section. */
export const navItemClass = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
    active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:text-foreground",
  );
