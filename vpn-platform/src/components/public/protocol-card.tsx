import Link from "next/link";
import { ArrowRightIcon, CircleCheckIcon, ClockIcon } from "lucide-react";
import { ProtocolIcon } from "@/components/protocol-icon";
import { guideFor } from "@/lib/protocol-guides";
import { cn } from "@/lib/utils";
import type { PublicProtocolSummary } from "@/lib/public/types";
import { FlagStack } from "./flag-stack";
import { formatDayRange, plural } from "./format";
import { categoryLabel } from "./nav";

/**
 * Home page protocol card: category and server-count badges, icon medallion, name, three
 * highlights, flags of its countries, availability and a full-width "Create account" button.
 */
export function ProtocolCard({ protocol: p, className, style }: { protocol: PublicProtocolSummary; className?: string; style?: React.CSSProperties }) {
  const guide = guideFor(p.slug, p.name);
  const available = p.availableCount > 0;
  return (
    <article
      style={style}
      className={cn(
        "group relative isolate flex flex-col overflow-hidden rounded-3xl border bg-card p-5 shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 sm:p-6 motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-32 bg-[radial-gradient(70%_100%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)] opacity-60 transition-opacity duration-300 group-hover:opacity-100"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-accent px-2.5 py-1 text-[11px] font-semibold text-accent-foreground">{categoryLabel(p.category)}</span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm tabular-nums",
            p.serverCount > 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
          )}
        >
          {plural(p.serverCount, "Server")}
        </span>
      </div>

      <div className="mt-5 text-center">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-accent ring-8 ring-accent/40 transition-transform duration-300 group-hover:scale-110 motion-reduce:group-hover:scale-100">
          <ProtocolIcon name={p.icon} className="size-7 text-primary" />
        </span>
        <h3 className="mt-5 text-xl font-bold tracking-tight">
          <Link href={p.href} className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50">
            {p.name}
          </Link>
        </h3>
        <p className="mx-auto mt-1.5 line-clamp-2 max-w-xs text-sm text-muted-foreground">{p.description}</p>
      </div>

      <ul className="mt-5 space-y-2.5 text-sm">
        {guide.highlights.slice(0, 3).map((h) => (
          <li key={h} className="flex items-start gap-2.5">
            <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span className="text-muted-foreground">{h}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        <div className="mb-4 flex min-h-6 items-center justify-between gap-3 text-xs">
          <FlagStack countries={p.countries} max={4} />
          <span className="flex items-center gap-3 text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <ClockIcon className="size-3.5" aria-hidden />
              {formatDayRange(p.durationOptions)}
            </span>
            <span className={cn("inline-flex items-center gap-1.5 font-medium", available ? "text-success" : "text-muted-foreground")}>
              <span className={cn("size-1.5 rounded-full", available ? "bg-success" : "bg-muted-foreground/50")} />
              {p.availableCount}/{p.serverCount} open
            </span>
          </span>
        </div>
        <span
          aria-hidden
          className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-[background-color,transform] duration-300 group-hover:bg-primary/90 group-hover:shadow-lg"
        >
          Create account
          <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
