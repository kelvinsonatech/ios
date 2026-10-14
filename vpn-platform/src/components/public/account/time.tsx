"use client";

import { useNow } from "@/components/public/live-time";
import { cn } from "@/lib/utils";

/**
 * Account time displays. They use the site-wide shared clock (live-time.tsx): before hydration a
 * deterministic UTC value is rendered, then the viewer's local time / live countdown.
 */

/** Absolute date and time in the viewer's locale and zone (client only). */
export function formatLocalDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(d);
}

/** Deterministic UTC date and time (safe on the server). */
export function formatUtcDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(d)} UTC`;
}

/** "6d 23h 59m 12s", "3h 05m 09s", "4m 02s", "12s". */
export function formatCountdownSeconds(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  if (d) return `${d}d ${h}h ${p(m)}m ${p(s)}s`;
  if (h) return `${h}h ${p(m)}m ${p(s)}s`;
  if (m) return `${m}m ${p(s)}s`;
  return `${s}s`;
}

export function LocalDateTime({ iso, className }: { iso: string; className?: string }) {
  const now = useNow();
  return (
    <time dateTime={iso} className={className}>
      {now === null ? formatUtcDateTime(iso) : formatLocalDateTime(iso)}
    </time>
  );
}

/** Live "6d 23h 59m 12s left" / "Expired" for an account expiry. */
export function ExpiryCountdown({ iso, className, suffix = " left" }: { iso: string; className?: string; suffix?: string }) {
  const now = useNow();
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  if (now === null) return <span className={className}>&nbsp;</span>;
  const left = t - now;
  if (left <= 0) return <span className={cn("font-medium text-destructive", className)}>Expired</span>;
  return (
    <time dateTime={iso} className={cn("tabular-nums", className)}>
      {formatCountdownSeconds(left)}
      {suffix}
    </time>
  );
}

/** True once `iso` is in the past (false until the clock is known). */
export function useExpired(iso: string): boolean {
  const now = useNow();
  const t = Date.parse(iso);
  return now !== null && !Number.isNaN(t) && t <= now;
}
