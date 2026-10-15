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
        className="mt-1 h-1.5 w-full max-w-28 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Remaining slots"
        aria-valuemin={0}
        aria-valuemax={limit ?? remaining}
        aria-valuenow={remaining}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${pct}%` }} />
      </div>
      {remaining === 0 && capacity.quotaResetsAt ? (
        <Countdown iso={capacity.quotaResetsAt} label="Resets" doneText="Resetting now" className="mt-1 block text-[11px] text-muted-foreground" />
      ) : null}
    </div>
  );
}

function Action({ server, protocolName, block }: { server: PublicServerCard; protocolName: string; block?: boolean }) {
  if (server.availability === "available") {
    return (
      <Button asChild size="sm" className={cn("h-9 rounded-lg", block && "h-10 w-full")}>
        <Link href={server.href} aria-label={`Create ${protocolName} account on ${server.name}`}>
          <PlusIcon aria-hidden />
          Create
        </Link>
      </Button>
    );
  }
  if (server.availability === "full") {
    return (
      <Badge variant="info" className={cn("h-7 px-2.5", block && "h-10 w-full rounded-lg text-sm")}>
        Full
      </Badge>
    );
  }
  return <span className="text-sm text-muted-foreground" aria-label="No action available">—</span>;
}

function HostCell({ server }: { server: PublicServerCard }) {
  if (server.hostname) {
    return (
      <span className="block truncate font-mono text-[0.8rem]" title={server.hostname}>
        {server.hostname}
      </span>
    );
  }
  return <span className="block truncate text-muted-foreground">{server.city ?? server.country.name}</span>;
}

/**
 * One protocol on the status page: a table on desktop and stacked cards on phones (only one of
 * the two is displayed; the other is display:none so assistive tech reads each server once).
 */
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

      <table className="hidden w-full table-fixed text-sm md:table">
        <caption className="sr-only">{protocol.name} servers</caption>
        <colgroup>
          <col className="w-[22%]" />
          <col className="w-[22%]" />
          <col className="w-[13%]" />
          <col className="w-[10%]" />
          <col className="w-[11%]" />
          <col className="w-[12%]" />
          <col className="w-[10%]" />
        </colgroup>
        <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-2.5 font-medium">Server</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Host</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Response</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Last checked</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Remaining</th>
            <th scope="col" className="px-5 py-2.5 text-right font-medium">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {servers.map((s) => (
            <tr key={s.id} className="transition-colors hover:bg-muted/30">
              <td className="px-5 py-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Flag code={s.country.code} className="h-3.5 w-5" title={s.country.name} />
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{s.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{[s.city, s.country.name].filter(Boolean).join(", ")}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-3">
                <HostCell server={s} />
              </td>
              <td className="px-3 py-3">
                <AvailabilityBadge availability={s.availability} />
              </td>
              <td className="px-3 py-3">
                <Latency ms={s.latencyMs} className="font-medium" />
              </td>
              <td className="px-3 py-3 text-muted-foreground">
                <RelativeTime iso={s.lastCheckedAt} fallback="Not yet" />
              </td>
              <td className="px-3 py-3">
                <Slots capacity={s.capacity} />
              </td>
              <td className="px-5 py-3 text-right">
                <Action server={s} protocolName={protocol.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="divide-y md:hidden">
        {servers.map((s) => (
          <li key={s.id} className="grid gap-3 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Flag code={s.country.code} className="h-4 w-5.5" title={s.country.name} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.name}</p>
                  <div className="truncate text-xs">
                    <HostCell server={s} />
                  </div>
                </div>
              </div>
              <AvailabilityBadge availability={s.availability} className="shrink-0" />
            </div>
            <dl className="grid grid-cols-3 gap-2 rounded-xl bg-muted/40 p-3 text-xs">
              <div className="min-w-0">
                <dt className="text-muted-foreground">Response</dt>
                <dd className="mt-0.5 font-medium">
                  <Latency ms={s.latencyMs} />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Checked</dt>
                <dd className="mt-0.5 truncate font-medium">
                  <RelativeTime iso={s.lastCheckedAt} fallback="Not yet" />
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground">Remaining</dt>
                <dd className="mt-0.5">
                  <Slots capacity={s.capacity} />
                </dd>
              </div>
            </dl>
            {s.availability === "available" || s.availability === "full" ? <Action server={s} protocolName={protocol.name} block /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
