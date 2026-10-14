import Link from "next/link";
import { ArrowRightIcon, GaugeIcon, KeyRoundIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PublicCountrySummary } from "@/lib/public/types";
import { AVAILABILITY } from "./availability-badge";
import { Flag } from "./flag";
import { plural } from "./format";
import { Latency } from "./latency";

/**
 * Country tile on a protocol page: protocol and server-count badges, a large round flag, the
 * country name in capitals, live availability, remaining slots and best latency, and a full-width
 * "Get started" button. The whole card is one link (stretched over the card).
 */
export function CountryCard({
  country: c,
  protocolName,
  className,
  style,
}: {
  country: PublicCountrySummary;
  protocolName: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const a = AVAILABILITY[c.availability];
  const open = c.availability === "available";
  return (
    <article
      style={style}
      className={cn(
        "group relative isolate flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1.5 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/10 motion-reduce:hover:translate-y-0",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-28 bg-gradient-to-b from-accent/70 to-transparent" />
      <div className="flex items-center justify-between gap-2 p-4 pb-0">
        <span className="max-w-[60%] truncate rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-semibold text-accent-foreground ring-1 ring-primary/15">{protocolName}</span>
        <span className="rounded-full bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm tabular-nums">
          {plural(c.serverCount, "Server")}
        </span>
      </div>

      <div className="flex flex-col items-center px-5 pt-5 text-center">
        <span className="flex size-28 items-center justify-center rounded-full bg-background shadow-md ring-1 ring-border">
          <Flag
            code={c.code}
            squared
            title={c.name}
            className="size-[4.5rem] rounded-full shadow-md transition-transform duration-500 group-hover:scale-110 motion-reduce:group-hover:scale-100"
          />
        </span>
        <h3 className="mt-4 text-lg font-bold tracking-wide uppercase">
          <Link href={c.href} className="outline-none after:absolute after:inset-0 after:rounded-3xl focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50">
            {c.name}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground">{c.region ?? " "}</p>
      </div>

      <dl className="mx-5 mt-5 grid grid-cols-2 gap-3 border-t pt-4 text-sm">
        <div>
          <dt className="text-[11px] text-muted-foreground">Status</dt>
          <dd className={cn("mt-0.5 flex items-center gap-1.5 font-medium", a.text)}>
            <span className="relative flex size-2">
              {open ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden", a.dot)} /> : null}
              <span className={cn("relative inline-flex size-2 rounded-full", a.dot)} />
            </span>
            {a.label}
          </dd>
        </div>
        <div className="text-right">
          <dt className="text-[11px] text-muted-foreground">Best ping</dt>
          <dd className="mt-0.5 inline-flex items-center gap-1 font-medium">
            <GaugeIcon className="size-3.5 text-muted-foreground" aria-hidden />
            <Latency ms={c.bestLatencyMs} />
          </dd>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-2 rounded-xl bg-muted/60 px-3 py-2">
          <dt className="text-[11px] text-muted-foreground">Accounts</dt>
          <dd className={cn("text-sm font-semibold tabular-nums", c.remaining === 0 ? "text-destructive" : "text-primary")}>
            {c.remaining === null ? "Unlimited" : c.remaining > 0 ? `${c.remaining} remaining` : "No slots left"}
          </dd>
        </div>
      </dl>

      <div className="mt-auto p-5 pt-4">
        <span
          aria-hidden
          className={cn(
            "flex h-11 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors duration-300",
            open ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 group-hover:bg-primary/90" : "bg-muted text-foreground group-hover:bg-muted/70",
          )}
        >
          <KeyRoundIcon className="size-4" />
          {open ? "Get started" : "View servers"}
          <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </span>
      </div>
    </article>
  );
}
