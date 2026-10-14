import { cn } from "@/lib/utils";
import { siteConfig } from "@/lib/site";

/** Original mark: a keyhole inside a rounded shield. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("size-7", className)}>
      <rect x="2" y="2" width="28" height="28" rx="9" className="fill-primary" />
      <path
        d="M16 7.5 9.5 10v5.6c0 4.1 2.8 7.6 6.5 8.9 3.7-1.3 6.5-4.8 6.5-8.9V10L16 7.5Z"
        className="fill-primary-foreground/15 stroke-primary-foreground"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="14.4" r="2.1" className="fill-primary-foreground" />
      <path d="M15.1 15.6h1.8l.5 4h-2.8l.5-4Z" className="fill-primary-foreground" />
    </svg>
  );
}

/** Logo + site name. `name` overrides the build-time default (the public site passes settings.siteName). */
export function Brand({ className, suffix, name, markClassName }: { className?: string; suffix?: string; name?: string; markClassName?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <BrandMark className={markClassName} />
      <span className="truncate">{name || siteConfig.name}</span>
      {suffix ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{suffix}</span> : null}
    </span>
  );
}
