/**
 * Quota reset schedule maths for the settings page preview ("Next reset in 3 h 12 min"). Pure and
 * client-safe so the preview follows unsaved edits. The worker/backend has its own authoritative
 * implementation (src/server/provisioning/quota.ts); both interpret "HH:MM in time zone" the same way.
 */

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of `ms` in `timeZone`. */
function wallClock(ms: number, timeZone: string) {
  const p: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(ms)) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { year: p.year!, month: p.month!, day: p.day!, hour: p.hour! % 24, minute: p.minute!, second: p.second! };
}

/** Offset of `timeZone` from UTC at instant `ms`, in milliseconds (UTC+7 → 25 200 000). */
export function zoneOffsetMs(ms: number, timeZone: string): number {
  const w = wallClock(ms, timeZone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(ms / 1000) * 1000;
}

/** UTC instant of a local wall-clock time in `timeZone` (DST gaps resolve forward). */
export function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let ms = guess - zoneOffsetMs(guess, timeZone);
  const corrected = guess - zoneOffsetMs(ms, timeZone);
  if (corrected !== ms) ms = corrected;
  return ms;
}

export interface ResetSchedule {
  /** Start of the current quota window (the latest reset at or before now). */
  windowStart: Date;
  /** The next reset. */
  nextReset: Date;
}

/**
 * Current window and next reset for reset times ("HH:MM") in `timeZone`. Returns null for an empty
 * list or an unknown time zone.
 */
export function resetSchedule(resetTimes: string[], timeZone: string, now: number = Date.now()): ResetSchedule | null {
  const times = resetTimes
    .map((t) => /^(\d{2}):(\d{2})$/.exec(t))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [Number(m[1]), Number(m[2])] as const)
    .filter(([h, m]) => h < 24 && m < 60);
  if (times.length === 0) return null;
  let today: ReturnType<typeof wallClock>;
  try {
    today = wallClock(now, timeZone);
  } catch {
    return null;
  }
  const candidates: number[] = [];
  for (const dayOffset of [-1, 0, 1]) {
    const base = new Date(Date.UTC(today.year, today.month - 1, today.day + dayOffset));
    for (const [h, m] of times) {
      candidates.push(zonedTimeToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), h, m, timeZone));
    }
  }
  candidates.sort((a, b) => a - b);
  const past = candidates.filter((c) => c <= now);
  const future = candidates.filter((c) => c > now);
  return { windowStart: new Date(past[past.length - 1]!), nextReset: new Date(future[0]!) };
}

/** "3 h 12 min", "45 min", "under a minute". */
export function formatCountdown(ms: number): string {
  const totalMin = Math.floor(ms / 60_000);
  if (totalMin < 1) return "under a minute";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "UTC+07:00" for an offset in milliseconds. */
export function formatOffset(offsetMs: number): string {
  const sign = offsetMs < 0 ? "-" : "+";
  const abs = Math.abs(Math.round(offsetMs / 60_000));
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** Minutes since local midnight in `timeZone` (for the 24 h timeline); null for an unknown zone. */
export function minutesOfDay(now: number, timeZone: string): number | null {
  try {
    const w = wallClock(now, timeZone);
    return w.hour * 60 + w.minute;
  } catch {
    return null;
  }
}
