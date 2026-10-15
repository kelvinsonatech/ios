import Link from "next/link";
import { ArrowRightIcon, PlusIcon } from "lucide-react";
import { ProtocolIcon } from "@/components/protocol-icon";
import { AvailabilityBadge } from "@/components/public/availability-badge";
import { Flag } from "@/components/public/flag";
import { Latency } from "@/components/public/latency";
import { Countdown, RelativeTime } from "@/components/public/live-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PublicCapacity, PublicServerCard, StatusPageData } from "@/lib/public/types";

type Section = StatusPageData["sections"][number];

/** "Online" for this page means the server answers (available or full). */
export function isOnline(s: PublicServerCard) {
  return s.availability === "available" || s.availability === "full";
}

/**
 * Row layout shared by the header and every server. One markup for all widths (half the DOM of a
 * table plus separate cards): on phones and tablets each row is a card laid out with grid areas,
 * from lg up the same cells line up as table columns. Column tracks have minimum widths for the
 * badge and the button, so refreshes never shift the layout.
 */
const COLS =
  "lg:grid-cols-[minmax(0,2.2fr)_minmax(0,2fr)_minmax(8.5rem,1.2fr)_minmax(5rem,0.9fr)_minmax(6.75rem,1fr)_minmax(7rem,1.1fr)_8rem] lg:[grid-template-areas:'server_host_status_resp_check_rem_action']";
const ROW = cn(
  "grid grid-cols-3 gap-y-3 px-4 py-4 [grid-template-areas:'server_server_status'_'host_host_host'_'resp_check_rem'_'action_action_action']",
  "lg:items-center lg:gap-0 lg:px-0 lg:py-0",
  COLS,
);
/** Desktop cell padding (the first and last columns get the card's 20 px inset instead). */
const CELL = "min-w-0 lg:py-3";
const PAD = "lg:px-3";
/** The three metrics form one tinted strip on phones. */
const METRIC = "min-w-0 bg-muted/40 px-3 py-2.5 text-xs lg:bg-transparent lg:px-3 lg:py-3 lg:text-sm";

function MobileLabel({ children }: { children: React.ReactNode }) {
  // The column header already names the cell for assistive tech.
  return (
    <span aria-hidden className="mb-0.5 block text-muted-foreground lg:hidden">
      {children}
    </span>
  );
}

function Slots({ capacity, className }: { capacity: PublicCapacity; className?: string }) {
  const { remaining, limit } = capacity;
  if (remaining === null) return <span className={cn("text-xs text-muted-foreground", className)}>Unlimited</span>;
  const pct = limit && limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : remaining > 0 ? 100 : 0;
  const tone = remaining === 0 ? "bg-destructive" : pct <= 20 ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("min-w-0", className)}>
      <span className="text-sm font-semibold tabular-nums">
        {remaining} <span className="text-xs font-normal text-muted-foreground">{remaining === 1 ? "slot" : "slots"}</span>
      </span>
      <div
        className="mt-1 h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-foreground/10"
        role="meter"
        aria-label="Remaining slots"
        aria-valuemin={0}
        aria-valuemax={limit ?? remaining}
        aria-valuenow={remaining}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none", tone)} style={{ width: `${pct}%` }} />
      </div>
      {remaining === 0 && capacity.quotaResetsAt ? (
        <Countdown iso={capacity.quotaResetsAt} label="Resets" doneText="Resetting now" className="mt-1 block text-[11px] text-muted-foreground" />
      ) : null}
    </div>
  );
}

function Action({ server, protocolName }: { server: PublicServerCard; protocolName: string }) {
  if (server.availability === "available") {
    return (
      <Button asChild size="sm" className="h-10 w-full rounded-lg sm:w-auto sm:px-5 lg:h-9 lg:px-2.5">
        <Link href={server.href} aria-label={`Create ${protocolName} account on ${server.name}`}>
          <PlusIcon aria-hidden />
          Create
        </Link>
      </Button>
    );
  }
  if (server.availability === "full") {
    return (
      <Badge variant="info" className="h-10 w-full rounded-lg text-sm sm:w-auto sm:px-5 lg:h-7 lg:rounded-md lg:px-2.5 lg:text-xs">
        Full
      </Badge>
    );
  }
  return (
    <span className="text-sm text-muted-foreground">
      <span aria-hidden>—</span>
      <span className="sr-only">No action available</span>
    </span>
  );
}

function HostCell({ server }: { server: PublicServerCard }) {
  if (server.hostname) {
    return (
      <span className="block truncate font-mono text-xs text-muted-foreground lg:text-[0.8rem] lg:text-foreground" title={server.hostname}>
        {server.hostname}
      </span>
    );
  }
  return <span className="block truncate text-xs text-muted-foreground lg:text-sm">{server.city ?? server.country.name}</span>;
}

function ServerRow({ server: s, protocolName }: { server: PublicServerCard; protocolName: string }) {
  const actionable = s.availability === "available" || s.availability === "full";
  return (
    <div role="row" className={cn(ROW, "transition-colors lg:hover:bg-muted/30")}>
      <div role="cell" className={cn(CELL, "[grid-area:server] lg:pr-3 lg:pl-5")}>
        <div className="flex min-w-0 items-center gap-2.5">
          <Flag code={s.country.code} className="h-4 w-5.5 lg:h-3.5 lg:w-5" title={s.country.name} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{s.name}</p>
            <p className="hidden truncate text-xs text-muted-foreground lg:block">{[s.city, s.country.name].filter(Boolean).join(", ")}</p>
          </div>
        </div>
      </div>
      <div role="cell" className={cn(CELL, "-mt-2 pl-8 [grid-area:host] lg:mt-0 lg:pr-3 lg:pl-3")}>
        <HostCell server={s} />
      </div>
      <div role="cell" className={cn(CELL, PAD, "self-start justify-self-end [grid-area:status] lg:self-center lg:justify-self-start")}>
        <AvailabilityBadge availability={s.availability} />
      </div>
      <div role="cell" className={cn(METRIC, "rounded-l-xl [grid-area:resp] lg:rounded-none")}>
        <MobileLabel>Response</MobileLabel>
        <Latency ms={s.latencyMs} className="font-medium" />
      </div>
      <div role="cell" className={cn(METRIC, "text-muted-foreground [grid-area:check]")}>
        <MobileLabel>Checked</MobileLabel>
        <RelativeTime iso={s.lastCheckedAt} fallback="Not yet" className="block truncate font-medium text-foreground lg:font-normal lg:text-muted-foreground" />
      </div>
      <div role="cell" className={cn(METRIC, "rounded-r-xl [grid-area:rem] lg:rounded-none")}>
        <MobileLabel>Remaining</MobileLabel>
        <Slots capacity={s.capacity} />
      </div>
      <div role="cell" className={cn(CELL, "[grid-area:action] sm:text-right lg:pr-5 lg:pl-3", !actionable && "hidden lg:block")}>
        <Action server={s} protocolName={protocolName} />
      </div>
    </div>
  );
}

/** One protocol on the status page: header with a health dot, then the responsive server table. */
export function StatusSection({ section }: { section: Section }) {
  const { protocol, servers } = section;
  const online = servers.filter(isOnline).length;
  const available = servers.some((s) => s.availability === "available");
  const dot = available ? "bg-success" : online > 0 ? "bg-warning" : "bg-destructive";
  const headingId = `status-${protocol.slug}`;

  return (
    <section aria-labelledby={headingId} className="scroll-mt-28 overflow-hidden rounded-3xl border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ProtocolIcon name={protocol.icon} className="size-5" />
            <span className={cn("absolute -top-0.5 -right-0.5 size-3 rounded-full ring-2 ring-card", dot)} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="truncate font-bold tracking-tight">
              {protocol.name}
            </h2>
            <p className="text-xs text-muted-foreground tabular-nums">
              {servers.length} {servers.length === 1 ? "server" : "servers"} · {online} online
            </p>
          </div>
        </div>
        <Link
          href={protocol.href}
          className="inline-flex min-h-10 items-center gap-1 rounded-md text-sm font-medium text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          View servers
          <ArrowRightIcon className="size-4" aria-hidden />
        </Link>
      </header>

      <div role="table" aria-label={`${protocol.name} servers`} aria-rowcount={servers.length + 1} className="text-sm">
        <div role="rowgroup" className="sr-only lg:not-sr-only">
          <div role="row" className={cn("bg-muted/40 text-left text-xs text-muted-foreground lg:grid", COLS)}>
            <span role="columnheader" className="px-5 py-2.5 font-medium [grid-area:server]">
              Server
            </span>
            <span role="columnheader" className="px-3 py-2.5 font-medium [grid-area:host]">
              Host
            </span>
            <span role="columnheader" className="px-3 py-2.5 font-medium [grid-area:status]">
              Status
            </span>
            <span role="columnheader" className="px-3 py-2.5 font-medium [grid-area:resp]">
              Response
            </span>
            <span role="columnheader" className="px-3 py-2.5 font-medium [grid-area:check]">
              Last checked
            </span>
            <span role="columnheader" className="px-3 py-2.5 font-medium [grid-area:rem]">
              Remaining
            </span>
            <span role="columnheader" className="px-5 py-2.5 text-right font-medium [grid-area:action]">
              Action
            </span>
          </div>
        </div>
        <div role="rowgroup" className="divide-y">
          {servers.map((s) => (
            <ServerRow key={s.id} server={s} protocolName={protocol.name} />
          ))}
        </div>
      </div>
    </section>
  );
}
