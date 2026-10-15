import Link from "next/link";
import { ArrowRightIcon, BanIcon, CableIcon, ClockIcon, GaugeIcon, MapPinIcon, ServerIcon, WrenchIcon } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { ProtocolIcon } from "@/components/protocol-icon";
import { cn } from "@/lib/utils";
import type { Availability, PublicServerCard } from "@/lib/public/types";
import { AVAILABILITY, AvailabilityBadge } from "./availability-badge";
import { Flag } from "./flag";
import { formatDays } from "./format";
import { Latency } from "./latency";
import { Countdown, RelativeTime } from "./live-time";
import { describePorts, transportLabel } from "./port-rows";
import { RemainingMeter } from "./remaining-meter";

const UNAVAILABLE: Record<Exclude<Availability, "available">, { label: string; reason: string; icon: React.ReactNode }> = {
  full: { label: "Full", reason: "All slots are taken for now.", icon: <BanIcon /> },
  maintenance: { label: "Maintenance", reason: "This server is being serviced.", icon: <WrenchIcon /> },
  offline: { label: "Offline", reason: "This server is not responding right now.", icon: <ServerIcon /> },
  service_stopped: { label: "Unavailable", reason: "This service is paused on the server.", icon: <BanIcon /> },
};

/**
 * Server card on a country page: protocol badge and live status, name and location, then one
 * labelled row each for the host, location, every service port ("SSH 22", "Dropbear 109, 143",
 * "UDP 6000-19999"), transports, validity and status with latency ("checked … ago"), remaining slots
 * with the quota reset countdown, and the "Create account" button (disabled with the reason when the server
 * cannot take new accounts). Other protocols on the same server are linked underneath.
 */
export function ServerCard({
  server: s,
  protocol,
  className,
  style,
}: {
  server: PublicServerCard;
  protocol: { name: string; icon: string; durationOptions: number[] };
  className?: string;
  style?: React.CSSProperties;
}) {
  const available = s.availability === "available";
  const blocked = s.availability === "available" ? null : UNAVAILABLE[s.availability];
  const location = [s.city, s.country.name].filter(Boolean).join(", ");
  const ports = describePorts(s.ports);
  const status = AVAILABILITY[s.availability];

  return (
    <article
      style={style}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-3xl border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10 motion-reduce:hover:translate-y-0",
        available ? "hover:border-primary/30" : "opacity-95",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-accent/70 to-transparent" />
      <div className="relative flex items-center justify-between gap-2 p-4 pb-0">
        <span className="inline-flex max-w-[60%] items-center gap-1.5 truncate rounded-full bg-card/80 px-2.5 py-1 text-[11px] font-semibold text-accent-foreground ring-1 ring-primary/15">
          <ProtocolIcon name={protocol.icon} className="size-3.5 text-primary" />
          {protocol.name}
        </span>
        <AvailabilityBadge availability={s.availability} />
      </div>

      <div className="relative px-5 pt-4 text-center">
        <h3 className="text-xl font-bold tracking-tight">{s.name}</h3>
        <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          <Flag code={s.country.code} className="h-3 w-4" title={s.country.name} />
          {location}
        </p>
      </div>

      <dl className="relative mt-5 divide-y divide-border/60 px-5 text-sm">
        <Row icon={<ServerIcon />} label="Host">
          {s.hostname ? (
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate font-mono text-[0.8rem] font-medium" title={s.hostname}>
                {s.hostname}
              </span>
              <CopyButton value={s.hostname} label={`Copy host ${s.hostname}`} />
            </span>
          ) : (
            <span className="truncate font-medium">{s.city ?? s.country.name}</span>
          )}
        </Row>
        <Row icon={<MapPinIcon />} label="Location">
          <span className="truncate font-medium">{location}</span>
        </Row>
        {ports.length > 0 ? (
          ports.map((r) => (
            <Row key={r.key} icon={<r.icon />} label={r.label}>
              <span className="truncate font-mono text-[0.8rem] font-semibold" title={r.value}>
                {r.value}
              </span>
            </Row>
          ))
        ) : (
          <Row icon={<CableIcon />} label="Ports">
            <span className="text-muted-foreground">Shown with your account</span>
          </Row>
        )}
        {s.transports.length > 0 ? (
          <Row icon={<CableIcon />} label="Transport">
            <span className="truncate font-medium">{s.transports.map(transportLabel).join(", ")}</span>
          </Row>
        ) : null}
        <Row icon={<ClockIcon />} label="Validity">
          <span className="font-medium">{formatDays(protocol.durationOptions)}</span>
        </Row>
        <Row icon={<GaugeIcon />} label="Status">
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-2">
            <span className={cn("inline-flex items-center gap-1.5 font-medium", status.text)}>
              <span className={cn("size-2 rounded-full", status.dot)} aria-hidden />
              {status.label}
            </span>
            <Latency ms={s.latencyMs} className="font-medium" />
          </span>
        </Row>
      </dl>
      <p className="relative mt-1 px-5 text-right text-[11px] text-muted-foreground">
        <RelativeTime iso={s.lastCheckedAt} prefix="Checked" fallback="Not checked yet" />
      </p>

      <div className="relative mx-5 mt-5 rounded-2xl bg-muted/60 p-3">
        <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Accounts</span>
          {s.capacity.quotaResetsAt ? <Countdown iso={s.capacity.quotaResetsAt} label="Resets" doneText="Resetting now" /> : null}
        </div>
        <RemainingMeter capacity={s.capacity} />
      </div>

      <div className="relative mt-auto p-5 pt-4">
        {available ? (
          <Link
            href={s.href}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-colors outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            Create account
            <ArrowRightIcon className="size-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        ) : (
          <>
            <button
              type="button"
              disabled
              aria-describedby={`why-${s.id}`}
              className="flex h-11 w-full cursor-not-allowed items-center justify-center gap-2 rounded-full bg-muted text-sm font-semibold text-muted-foreground [&_svg]:size-4"
            >
              {blocked?.icon}
              {blocked?.label}
            </button>
            <p id={`why-${s.id}`} className="mt-2 text-center text-xs text-muted-foreground">
              {blocked?.reason}
              {s.availability === "full" && s.capacity.quotaResetsAt ? (
                <>
                  {" "}
                  <Countdown iso={s.capacity.quotaResetsAt} label="New slots" doneText="New slots any moment." className="font-medium text-foreground" />
                </>
              ) : null}
            </p>
          </>
        )}
        {s.otherProtocols.length > 0 ? (
          <p className="mt-4 flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <span>Also here:</span>
            {s.otherProtocols.map((o) => (
              <Link
                key={o.slug}
                href={`/${o.slug}/${s.country.slug}/${s.slug}`}
                className="rounded-full border px-2 py-0.5 font-medium text-foreground transition-colors hover:border-primary/40 hover:text-primary"
              >
                {o.name}
              </Link>
            ))}
          </p>
        ) : null}
      </div>
    </article>
  );
}

/** One labelled line of the card ("SSL" … "443, 777"); values align right and truncate. */
function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 py-1.5">
      <dt className="flex shrink-0 items-center gap-2 text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary">
        {icon}
        {label}
      </dt>
      <dd className="flex min-w-0 flex-1 justify-end text-right">{children}</dd>
    </div>
  );
}
