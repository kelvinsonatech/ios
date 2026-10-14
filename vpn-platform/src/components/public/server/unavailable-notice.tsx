import Link from "next/link";
import { ArrowRightIcon, CircleAlertIcon, WrenchIcon, WifiOffIcon, HourglassIcon } from "lucide-react";
import { Flag } from "@/components/public/flag";
import { Latency } from "@/components/public/latency";
import type { Availability, PublicServerCard } from "@/lib/public/types";
import { Countdown } from "@/components/public/live-time";

const REASONS: Record<Exclude<Availability, "available">, { icon: React.ReactNode; title: string; body: (protocol: string) => string }> = {
  full: {
    icon: <HourglassIcon />,
    title: "All slots are taken",
    body: () => "Every account slot on this server is in use for the current period.",
  },
  maintenance: {
    icon: <WrenchIcon />,
    title: "Under maintenance",
    body: () => "We're working on this server. Please pick another one or check back a little later.",
  },
  offline: {
    icon: <WifiOffIcon />,
    title: "Server is offline",
    body: () => "This server isn't responding right now. We check it automatically and reopen it as soon as it recovers.",
  },
  service_stopped: {
    icon: <CircleAlertIcon />,
    title: "Service paused",
    body: (protocol) => `${protocol} is temporarily stopped on this server.`,
  },
};

/**
 * Shown instead of an active form when the server cannot take new accounts: why, when it may
 * reopen, and other servers of the same protocol and country that are available now.
 */
export function UnavailableNotice({
  availability,
  protocolName,
  protocolHref,
  quotaResetsAt,
  alternatives,
}: {
  availability: Exclude<Availability, "available">;
  protocolName: string;
  protocolHref: string;
  quotaResetsAt: string | null;
  alternatives: PublicServerCard[];
}) {
  const r = REASONS[availability];
  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-4 sm:p-5" role="status">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-warning [&_svg]:size-5" aria-hidden>
          {r.icon}
        </span>
        <div className="min-w-0">
          <p className="font-medium">{r.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {r.body(protocolName)}
            {availability === "full" && quotaResetsAt ? (
              <>
                {" "}
                <Countdown iso={quotaResetsAt} label="New slots open" doneText="New slots are opening now" className="font-medium text-foreground" />.
              </>
            ) : null}
          </p>
        </div>
      </div>
      {alternatives.length ? (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">Available now</p>
          <ul className="grid gap-2">
            {alternatives.slice(0, 4).map((s) => (
              <li key={s.id}>
                <Link
                  href={s.href}
                  className="group flex min-h-12 items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Flag code={s.country.code} className="h-4 w-5.5" title={s.country.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {s.city ?? s.country.name}
                      {s.capacity.remaining !== null ? ` · ${s.capacity.remaining} slots left` : ""}
                    </span>
                  </span>
                  <Latency ms={s.latencyMs} className="text-xs" />
                  <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Link href={protocolHref} className="mt-4 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        See all {protocolName} locations
        <ArrowRightIcon className="size-4" aria-hidden />
      </Link>
    </div>
  );
}
