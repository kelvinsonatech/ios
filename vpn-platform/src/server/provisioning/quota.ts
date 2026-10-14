/**
 * Creation-quota windows. Every server/protocol quota resets at the same local wall-clock times
 * (site setting `quota.resetTimes`, e.g. ["00:00", "12:00"] in `quota.timezone`). A window runs from
 * the most recent reset instant (inclusive) to the next one (exclusive).
 *
 * No date library: local times are resolved with Intl.DateTimeFormat, DST included.
 *  - A reset time that does not exist on a given day (spring-forward gap) happens at the first
 *    valid instant after the gap, e.g. 02:30 in Europe/Berlin on the last Sunday of March → 03:30 CEST.
 *  - A reset time that occurs twice (fall-back overlap) happens at its first occurrence.
 * Pure functions: safe to import from the worker and scripts.
 */

export interface QuotaWindow {
  /** Most recent reset instant <= now. */
  start: Date;
  /** Next reset instant > now. */
  end: Date;
}

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MINUTE = 60_000;
const DAY = 86_400_000;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    // Throws RangeError for unknown zones (settings are validated, so this signals a programming error).
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Wall-clock fields of an instant in a zone, expressed as a UTC timestamp ("local as if UTC"). */
function localAsUtc(instant: number, timeZone: string): number {
  const parts: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(new Date(instant))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour! % 24, parts.minute!, parts.second!);
}

/** UTC offset (ms) of a zone at an instant, rounded to whole minutes. */
function offsetAt(instant: number, timeZone: string): number {
  const floored = Math.floor(instant / 1000) * 1000;
  return Math.round((localAsUtc(floored, timeZone) - floored) / MINUTE) * MINUTE;
}

/**
 * The instant at which a local wall-clock time occurs in a zone ("compatible" disambiguation:
 * earlier instant in an overlap, shifted forward across a gap).
 */
export function zonedWallTimeToInstant(wall: number, timeZone: string): number {
  const before = offsetAt(wall - DAY, timeZone);
  const after = offsetAt(wall + DAY, timeZone);
  const candidates = [...new Set([wall - before, wall - after])].filter((t) => localAsUtc(t, timeZone) === wall);
  if (candidates.length) return Math.min(...candidates);
  // Gap: the wall time is skipped; using the offset in force before the transition moves it forward.
  return wall - before;
}

function parseResetTimes(resetTimes: string[]): { h: number; m: number }[] {
  const out: { h: number; m: number }[] = [];
  for (const t of resetTimes) {
    const match = HH_MM.exec(t.trim());
    if (match) out.push({ h: Number(match[1]), m: Number(match[2]) });
  }
  // Settings require at least one valid time; fall back to midnight rather than failing requests.
  return out.length ? out : [{ h: 0, m: 0 }];
}

/** Current quota window for `now` given local reset times ("HH:MM", any order) in an IANA zone. */
export function quotaWindow(now: Date, resetTimes: string[], timeZone: string): QuotaWindow {
  const t = now.getTime();
  const times = parseResetTimes(resetTimes);
  const today = new Date(localAsUtc(t, timeZone));
  const instants: number[] = [];
  // Two days either side covers every combination of reset times and DST shifts.
  for (let d = -2; d <= 2; d++) {
    for (const { h, m } of times) {
      const wall = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + d, h, m);
      instants.push(zonedWallTimeToInstant(wall, timeZone));
    }
  }
  let start = -Infinity;
  let end = Infinity;
  for (const i of instants) {
    if (i <= t && i > start) start = i;
    if (i > t && i < end) end = i;
  }
  return { start: new Date(start), end: new Date(end) };
}

/** Start of the current local day (00:00) in a zone, e.g. for "created today" statistics. */
export function startOfLocalDay(now: Date, timeZone: string): Date {
  return quotaWindow(now, ["00:00"], timeZone).start;
}

/** "12:00" style local time of an instant in a zone. */
export function formatLocalTime(instant: Date, timeZone: string): string {
  const local = new Date(localAsUtc(instant.getTime(), timeZone));
  return `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}
