"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PauseIcon, RefreshCwIcon, SearchIcon, SearchXIcon, TimerIcon, XIcon } from "lucide-react";
import { AVAILABILITY } from "@/components/public/availability-badge";
import { Countdown, RelativeTime, useNow } from "@/components/public/live-time";
import { EmptyState } from "@/components/public/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { cn } from "@/lib/utils";
import type { Availability, PublicServerCard, StatusPageData } from "@/lib/public/types";
import { StatusSection } from "./status-section";
import { StatusSummary } from "./status-summary";

/**
 * /server-status board. Starts from the server-rendered data, then refreshes from
 * GET /api/public/status every 30 s (visible countdown, "Refresh now"); refreshing pauses while the
 * tab is hidden and catches up when it becomes visible again. Updates swap data in place with
 * fixed table columns, so nothing jumps. Filters: protocol, country, availability and free text.
 */
const REFRESH_MS = 30_000;
const AVAILABILITY_ORDER: Availability[] = ["available", "full", "maintenance", "offline", "service_stopped"];

function isStatusData(x: unknown): x is StatusPageData {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return typeof o.generatedAt === "string" && !!o.totals && typeof o.totals === "object" && Array.isArray(o.sections);
}

function matchesQuery(s: PublicServerCard, protocolName: string, q: string) {
  if (!q) return true;
  const hay = [s.name, s.slug, s.city, s.region, s.country.name, s.country.code, s.hostname, protocolName].filter(Boolean).join(" ").toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((t) => hay.includes(t));
}

/** Small ring that empties as the next refresh approaches. */
function RefreshRing({ fraction }: { fraction: number }) {
  const r = 8;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 20 20" className="size-5 -rotate-90" aria-hidden>
      <circle cx="10" cy="10" r={r} className="fill-none stroke-muted" strokeWidth="2.5" />
      <circle
        cx="10"
        cy="10"
        r={r}
        className="fill-none stroke-primary transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.max(0, Math.min(1, fraction)))}
      />
    </svg>
  );
}

export function StatusBoard({
  initial,
  initialProtocol,
  resetLabel,
  nextResetAt,
}: {
  initial: StatusPageData | null;
  initialProtocol: string | null;
  /** "00:00 & 12:00 (GMT+7)" */
  resetLabel: string;
  nextResetAt: string | null;
}) {
  const [data, setData] = useState<StatusPageData | null>(initial);
  const [nextAt, setNextAt] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const inflight = useRef(false);
  const nextAtRef = useRef<number | null>(null);
  const lastSummary = useRef<string | null>(initial ? `${initial.totals.online} of ${initial.totals.servers} servers online` : null);
  const failedRef = useRef(false);

  const protocols = useMemo(() => (data?.sections ?? []).map((s) => s.protocol), [data]);
  const [protocol, setProtocol] = useState<string>(() =>
    initialProtocol && (initial?.sections ?? []).some((s) => s.protocol.slug === initialProtocol) ? initialProtocol : "all",
  );
  const [country, setCountry] = useState("all");
  const [availability, setAvailability] = useState<"all" | Availability>("all");
  const [query, setQuery] = useState("");

  const schedule = useCallback(() => {
    const at = Date.now() + REFRESH_MS;
    nextAtRef.current = at;
    setNextAt(at);
  }, []);

  const refresh = useCallback(async (manual = false) => {
    if (inflight.current) return;
    inflight.current = true;
    setRefreshing(true);
    try {
      const res = await fetch("/api/public/status", { cache: "no-store", headers: { accept: "application/json" } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json: unknown = await res.json();
      if (!isStatusData(json)) throw new Error("unexpected response");
      setData(json);
      setFailed(false);
      failedRef.current = false;
      // Speak only when asked or when something changed: a 30 s heartbeat would be noise.
      const summary = `${json.totals.online} of ${json.totals.servers} servers online`;
      if (manual || (lastSummary.current !== null && lastSummary.current !== summary)) setAnnouncement(`Status updated: ${summary}.`);
      lastSummary.current = summary;
    } catch {
      setFailed(true);
      if (manual || !failedRef.current) setAnnouncement("Couldn't refresh the status. Showing the last known data.");
      failedRef.current = true;
    } finally {
      inflight.current = false;
      setRefreshing(false);
      schedule();
    }
  }, [schedule]);

  useEffect(() => {
    const first = setTimeout(() => {
      setPaused(document.visibilityState !== "visible");
      if (initial === null) void refresh();
      else schedule();
    }, 0);
    const tick = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (nextAtRef.current !== null && Date.now() >= nextAtRef.current) void refresh();
    }, 1000);
    const onVisibility = () => {
      const hidden = document.visibilityState !== "visible";
      setPaused(hidden);
      if (!hidden && nextAtRef.current !== null && Date.now() >= nextAtRef.current) void refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(first);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [initial, refresh, schedule]);

  const now = useNow();
  const secondsLeft = nextAt !== null && now !== null ? Math.max(0, Math.ceil((nextAt - now) / 1000)) : null;

  const countries = useMemo(() => {
    const map = new Map<string, string>();
    for (const sec of data?.sections ?? []) for (const s of sec.servers) map.set(s.country.code, s.country.name);
    return [...map.entries()].map(([code, name]) => ({ code, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  const sections = useMemo(() => {
    return (data?.sections ?? [])
      .filter((sec) => protocol === "all" || sec.protocol.slug === protocol)
      .map((sec) => ({
        ...sec,
        servers: sec.servers.filter(
          (s) =>
            (country === "all" || s.country.code === country) &&
            (availability === "all" || s.availability === availability) &&
            matchesQuery(s, sec.protocol.name, query.trim()),
        ),
      }))
      .filter((sec) => sec.servers.length > 0);
  }, [data, protocol, country, availability, query]);

  const filtered = protocol !== "all" || country !== "all" || availability !== "all" || query.trim() !== "";
  const clearFilters = () => {
    setCountry("all");
    setAvailability("all");
    setQuery("");
    selectProtocol("all");
  };

  function selectProtocol(slug: string) {
    setProtocol(slug);
    try {
      const url = new URL(window.location.href);
      if (slug === "all") url.searchParams.delete("protocol");
      else url.searchParams.set("protocol", slug);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // ignore
    }
  }

  const chip = (active: boolean) =>
    cn(
      "inline-flex min-h-10 shrink-0 items-center rounded-full border px-4 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
      active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
    );

  return (
    <div className="grid gap-6">
      <p className="sr-only" aria-live="polite" role="status">
        {announcement}
      </p>

      {/* Refresh bar */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card px-4 py-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3 text-sm">
          {paused ? (
            <PauseIcon className="size-5 text-muted-foreground" aria-hidden />
          ) : refreshing ? (
            <RefreshCwIcon className="size-5 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
          ) : (
            <RefreshRing fraction={secondsLeft === null ? 1 : secondsLeft / (REFRESH_MS / 1000)} />
          )}
          <div className="min-w-0">
            <p className="font-medium">
              {paused ? "Paused while this tab is in the background" : refreshing ? "Updating…" : secondsLeft === null ? "Live status" : `Next update in ${secondsLeft} s`}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {data ? (
                <>
                  Updated <RelativeTime iso={data.generatedAt} />
                </>
              ) : (
                "Loading…"
              )}
              {failed ? <span className="text-destructive"> · couldn&apos;t refresh, retrying</span> : null}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" className="h-10 shrink-0" onClick={() => void refresh(true)} disabled={refreshing}>
          <RefreshCwIcon className={cn(refreshing && "animate-spin motion-reduce:animate-none")} aria-hidden />
          Refresh now
        </Button>
      </div>

      {data ? <StatusSummary totals={data.totals} /> : null}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <TimerIcon className="size-4 text-primary" aria-hidden />
        <span>Slots reset daily at {resetLabel}</span>
        {nextResetAt ? (
          <span className="whitespace-nowrap">
            <span aria-hidden className="hidden sm:inline">
              ·{" "}
            </span>
            <Countdown iso={nextResetAt} label="Next reset" doneText="Resetting now" className="font-medium text-foreground" />
          </span>
        ) : null}
      </p>

      {/* Filters */}
      <div className="grid gap-3 rounded-2xl border bg-card p-3 shadow-xs sm:p-4">
        <div role="group" aria-label="Filter by service" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible sm:pb-0">
          <button type="button" className={chip(protocol === "all")} aria-pressed={protocol === "all"} onClick={() => selectProtocol("all")}>
            All services
          </button>
          {protocols.map((p) => (
            <button key={p.slug} type="button" className={chip(protocol === p.slug)} aria-pressed={protocol === p.slug} onClick={() => selectProtocol(p.slug)}>
              {p.name}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value.slice(0, 80))}
              placeholder="Search server, city or host"
              aria-label="Search servers"
              className="h-10 pl-9"
            />
          </div>
          <NativeSelect value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Filter by country" className="h-10">
            <option value="all">All countries</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={availability}
            onChange={(e) => setAvailability(e.target.value as "all" | Availability)}
            aria-label="Filter by status"
            className="h-10"
          >
            <option value="all">Any status</option>
            {AVAILABILITY_ORDER.map((a) => (
              <option key={a} value={a}>
                {AVAILABILITY[a].label}
              </option>
            ))}
          </NativeSelect>
        </div>
        {filtered ? (
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {sections.reduce((n, s) => n + s.servers.length, 0)} matching {sections.reduce((n, s) => n + s.servers.length, 0) === 1 ? "server" : "servers"}
            </span>
            <button type="button" onClick={clearFilters} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 font-medium text-primary hover:bg-accent">
              <XIcon className="size-3.5" aria-hidden />
              Clear filters
            </button>
          </div>
        ) : null}
      </div>

      {!data ? (
        <EmptyState
          icon={<RefreshCwIcon />}
          title="Status is loading"
          description={failed ? "We couldn't load the server status right now. We'll keep trying automatically." : "Fetching the latest checks…"}
        />
      ) : sections.length === 0 ? (
        <EmptyState
          icon={<SearchXIcon />}
          title={filtered ? "No servers match your filters" : "No servers yet"}
          description={filtered ? "Try another service, country or status." : "Servers appear here as soon as they are published."}
        >
          {filtered ? (
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null}
        </EmptyState>
      ) : (
        <div className="grid gap-6">
          {sections.map((sec) => (
            <StatusSection key={sec.protocol.slug} section={sec} previewOnMobile={!filtered} />
          ))}
        </div>
      )}
    </div>
  );
}
