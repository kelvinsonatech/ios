import Link from "next/link";
import { ActivityIcon, BanIcon, CalendarClockIcon, ClockIcon, FlagIcon, GaugeIcon, MapPinIcon, NetworkIcon, ServerIcon, TimerIcon } from "lucide-react";
import { AvailabilityBadge } from "@/components/public/availability-badge";
import { Flag } from "@/components/public/flag";
import { Latency } from "@/components/public/latency";
import { Countdown, RelativeTime } from "@/components/public/live-time";
import { PortRows, transportLabel } from "@/components/public/port-rows";
import { RemainingMeter } from "@/components/public/remaining-meter";
import { cn } from "@/lib/utils";
import type { PublicCountry, PublicProtocolDetail, PublicServerCard } from "@/lib/public/types";

/** Report link prefilled with this server and protocol. */
export function reportHref(serverId: string, protocolSlug: string) {
  return `/report?${new URLSearchParams({ server: serverId, protocol: protocolSlug }).toString()}`;
}

function Section({ icon, title, children, className }: { icon: React.ReactNode; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-t px-5 py-4", className)}>
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase [&_svg]:size-3.5">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Stat({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-5 py-3.5">
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 truncate text-sm font-semibold">{children}</dd>
    </div>
  );
}

/**
 * Side card of the server page: live status, response time, last check, location and host, slots
 * with the reset countdown, service ports and transports, validity options, the site's fair-use
 * rules, other protocols on the same machine and a "Report a problem" link.
 */
export function ServerInfoCard({
  protocol,
  country,
  server,
  rules,
  resetLabel,
  className,
}: {
  protocol: Pick<PublicProtocolDetail, "slug" | "durationOptions" | "defaultDurationDays">;
  country: PublicCountry;
  server: PublicServerCard;
  rules: string[];
  /** "00:00 & 12:00 (GMT+7)" */
  resetLabel: string;
  className?: string;
}) {
  const { capacity } = server;
  const location = [server.city, country.name].filter(Boolean).join(", ");
  return (
    <div className={cn("overflow-hidden rounded-3xl border bg-card text-card-foreground shadow-sm", className)}>
      <div className="relative flex items-center justify-between gap-3 px-5 py-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-full bg-gradient-to-b from-accent/60 to-transparent" />
        <div className="relative flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card text-primary shadow-sm ring-1 ring-primary/15">
            <ServerIcon className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Server</p>
            <h2 className="truncate font-bold tracking-tight">{server.name}</h2>
          </div>
        </div>
        <AvailabilityBadge availability={server.availability} className="relative" />
      </div>

      <dl className="grid grid-cols-2 gap-px border-t bg-border">
        <Stat icon={<ActivityIcon />} label="Response time">
          <Latency ms={server.latencyMs} />
        </Stat>
        <Stat icon={<ClockIcon />} label="Last checked">
          <RelativeTime iso={server.lastCheckedAt} fallback="Not yet" />
        </Stat>
      </dl>

      <dl className="grid gap-2.5 border-t px-5 py-4 text-sm">
        <div className="flex items-center justify-between gap-4">
          <dt className="flex items-center gap-1.5 text-muted-foreground">
            <MapPinIcon className="size-3.5" aria-hidden />
            Location
          </dt>
          <dd className="flex min-w-0 items-center gap-2 font-medium">
            <Flag code={country.code} className="h-3.5 w-5" title={country.name} />
            <span className="truncate">{location}</span>
          </dd>
        </div>
        {server.hostname ? (
          <div className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              <NetworkIcon className="size-3.5" aria-hidden />
              Host
            </dt>
            <dd className="min-w-0 truncate font-mono text-[0.8rem] font-medium" title={server.hostname}>
              {server.hostname}
            </dd>
          </div>
        ) : null}
      </dl>

      <Section icon={<GaugeIcon />} title="Slots">
        <RemainingMeter capacity={capacity} />
        {capacity.quotaResetsAt ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <TimerIcon className="size-3.5" aria-hidden />
            <Countdown iso={capacity.quotaResetsAt} label="Resets" doneText="Resetting now" className="font-medium text-foreground" />
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted-foreground">New slots open daily at {resetLabel}.</p>
      </Section>

      <Section icon={<NetworkIcon />} title="Ports & transports">
        <PortRows ports={server.ports} variant="rows" />
        {server.transports.length ? (
          <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Transports">
            {server.transports.map((t) => (
              <li key={t} className="rounded-lg border bg-muted/50 px-2 py-0.5 font-mono text-xs font-medium">
                {transportLabel(t)}
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section icon={<CalendarClockIcon />} title="Validity">
        <ul className="flex flex-wrap gap-1.5">
          {protocol.durationOptions.map((d) => (
            <li
              key={d}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium tabular-nums",
                d === protocol.defaultDurationDays ? "border-primary/40 bg-accent text-accent-foreground" : "bg-muted/40 text-muted-foreground",
              )}
            >
              {d} {d === 1 ? "day" : "days"}
            </li>
          ))}
        </ul>
      </Section>

      {rules.length ? (
        <Section icon={<BanIcon />} title="Fair use">
          <ul className="flex flex-wrap gap-1.5">
            {rules.map((r) => (
              <li key={r} className="inline-flex items-center gap-1.5 rounded-lg bg-danger-soft px-2 py-1 text-xs font-medium text-destructive">
                <BanIcon className="size-3" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {server.otherProtocols.length ? (
        <Section icon={<ServerIcon />} title="Also on this server">
          <ul className="flex flex-wrap gap-1.5">
            {server.otherProtocols.map((p) => (
              <li key={p.slug}>
                <Link
                  href={`/${p.slug}/${country.slug}/${server.slug}`}
                  className="inline-flex min-h-8 items-center rounded-lg border px-2.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-accent hover:text-accent-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {p.name}
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <div className="border-t bg-muted/30 px-5 py-2">
        <Link
          href={reportHref(server.id, protocol.slug)}
          className="inline-flex min-h-10 items-center gap-2 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <FlagIcon className="size-4" aria-hidden />
          Report a problem with this server
        </Link>
      </div>
    </div>
  );
}
