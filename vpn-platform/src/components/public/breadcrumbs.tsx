import Link from "next/link";
import { ChevronRightIcon, HomeIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface Crumb {
  label: string;
  href?: string;
}

/**
 * Visible breadcrumb trail; pair it with breadcrumbJsonLd() for search engines.
 * `tone="inverted"` is for the gradient hero bands (white text); `centered` centres the trail.
 */
export function Breadcrumbs({
  items,
  className,
  tone = "default",
  centered,
}: {
  items: Crumb[];
  className?: string;
  tone?: "default" | "inverted";
  centered?: boolean;
}) {
  const inverted = tone === "inverted";
  return (
    <nav aria-label="Breadcrumb" className={cn("text-sm", inverted ? "text-white/75" : "text-muted-foreground", className)}>
      <ol className={cn("flex flex-wrap items-center gap-1", centered && "justify-center")}>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          const isHome = i === 0 && c.href === "/";
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 ? <ChevronRightIcon className="size-3.5 shrink-0 opacity-60" aria-hidden /> : null}
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className={cn(
                    "inline-flex items-center gap-1 rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                    inverted ? "hover:text-white focus-visible:outline-white" : "hover:text-foreground focus-visible:outline-ring",
                  )}
                >
                  {isHome ? <HomeIcon className="size-3.5" aria-hidden /> : null}
                  {c.label}
                </Link>
              ) : (
                <span aria-current={last ? "page" : undefined} className={cn("truncate", last && (inverted ? "font-medium text-white" : "text-foreground"))}>
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
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
