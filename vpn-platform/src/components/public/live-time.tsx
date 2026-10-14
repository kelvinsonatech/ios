"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * Live relative times ("checked 2 min ago") and countdowns ("resets in 3h 12m") that stay fresh
 * without reloading. One shared 1 s clock drives every instance on the page. During server render
 * and hydration the clock is unknown, so a deterministic UTC time is shown first (no hydration
 * mismatch), then the live text replaces it right after hydration.
 */

let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now || Date.now();
const getServerSnapshot = () => null;

/** Current time in ms, updated every second; null during server render and hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function utcClock(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
}

/** "just now", "45 s ago", "2 min ago", "3 h ago", "2 days ago". */
export function formatRelative(thenMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - thenMs) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.floor(h / 24)} days ago`;
}

/** "3h 12m", "12m 05s", "45s"; "now" when elapsed. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now";
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

/** <time> showing how long ago `iso` was ("2 min ago"). */
export function RelativeTime({ iso, prefix, fallback = "never", className }: { iso: string | null; prefix?: string; fallback?: string; className?: string }) {
  const nowMs = useNow();
  const then = iso ? Date.parse(iso) : NaN;
  if (!iso || Number.isNaN(then)) return <span className={className}>{fallback}</span>;
  const text = nowMs === null ? `at ${utcClock(then)}` : formatRelative(then, nowMs);
  return (
    <time dateTime={iso} title={new Date(then).toISOString().replace("T", " ").slice(0, 16) + " UTC"} className={cn("tabular-nums", className)}>
      {prefix ? `${prefix} ` : null}
      {text}
    </time>
  );
}

/**
 * <time> counting down to `iso`. With label "Resets": "Resets in 3h 12m" (live), "Resets at
 * 12:00 UTC" (before hydration) and `doneText` once the moment has passed.
 */
export function Countdown({ iso, label, doneText = "any moment now", className }: { iso: string | null; label?: string; doneText?: string; className?: string }) {
  const nowMs = useNow();
  const target = iso ? Date.parse(iso) : NaN;
  if (!iso || Number.isNaN(target)) return null;
  const left = nowMs === null ? null : target - nowMs;
  let text: string;
  if (left === null) text = label ? `${label} at ${utcClock(target)}` : utcClock(target);
  else if (left <= 0) text = doneText;
  else text = label ? `${label} in ${formatCountdown(left)}` : formatCountdown(left);
  return (
    <time dateTime={iso} className={cn("tabular-nums", className)}>
      {text}
    </time>
  );
}
