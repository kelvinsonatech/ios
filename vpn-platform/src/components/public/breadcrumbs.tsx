import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/** Visible breadcrumb trail; pair it with breadcrumbJsonLd() for search engines. */
export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1">
        {items.map((c, i) => (
          <li key={`${c.label}-${i}`} className="flex items-center gap-1">
            {i > 0 ? <ChevronRightIcon className="size-3.5 opacity-60" aria-hidden /> : null}
            {c.href && i < items.length - 1 ? (
              <Link href={c.href} className="rounded transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                {c.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className={i === items.length - 1 ? "text-foreground" : undefined}>
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** schema.org BreadcrumbList for <JsonLd>. `origin` is the absolute site origin (APP_URL). */
export function breadcrumbJsonLd(items: Crumb[], origin: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: new URL(c.href, origin).toString() } : {}),
    })),
  };
}
