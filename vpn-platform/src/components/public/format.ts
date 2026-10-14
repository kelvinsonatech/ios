/** Small text helpers shared by the public pages (client-safe). */

const nf = new Intl.NumberFormat("en-US");

export function formatCount(n: number): string {
  return nf.format(n);
}

/** "1 server", "3 servers". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${nf.format(n)} ${n === 1 ? one : many}`;
}

/** [3, 7, 30] → "3, 7 or 30 days"; [7] → "7 days". */
export function formatDays(options: number[]): string {
  const sorted = [...new Set(options)].filter((d) => d > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  const unit = sorted.length === 1 && sorted[0] === 1 ? "day" : "days";
  if (sorted.length === 1) return `${sorted[0]} ${unit}`;
  return `${sorted.slice(0, -1).join(", ")} or ${sorted[sorted.length - 1]} ${unit}`;
}

/** [3, 7, 30] → "3–30 days" (for compact chips). */
export function formatDayRange(options: number[]): string {
  const sorted = [...new Set(options)].filter((d) => d > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  if (sorted.length === 1) return `${sorted[0]} day${sorted[0] === 1 ? "" : "s"}`;
  return `${sorted[0]}–${sorted[sorted.length - 1]} days`;
}
