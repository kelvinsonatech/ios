import { cn } from "@/lib/utils";

/** One time slice of health checks (see getHealthTimeline() in src/server/servers/queries.ts). */
export interface HealthSlice {
  start: string;
  checks: number;
  failures: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number | null;
}

const W = 480;
const H = 72;
const PAD_TOP = 6;

function hhmm(d: Date) {
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function sliceState(s: HealthSlice): "none" | "ok" | "partial" | "down" {
  if (s.checks === 0) return "none";
  if (s.failures === 0) return "ok";
  return s.failures === s.checks ? "down" : "partial";
}

const STATE_CLASS = {
  none: "bg-muted",
  ok: "bg-success/70",
  partial: "bg-warning",
  down: "bg-destructive",
} as const;

/**
 * 24 h response-time sparkline with an availability strip underneath, drawn as inline SVG on the
 * server (no chart library, nothing loaded from elsewhere). Hovering a slice shows its numbers.
 */
export function HealthSparkline({ slices, className }: { slices: HealthSlice[]; className?: string }) {
  const n = slices.length;
  const checks = slices.reduce((a, s) => a + s.checks, 0);
  const failures = slices.reduce((a, s) => a + s.failures, 0);
  const latencies = slices.map((s) => s.avgLatencyMs).filter((v): v is number => v !== null);
  const avg = latencies.length ? Math.round(latencies.reduce((a, v) => a + v, 0) / latencies.length) : null;
  const peak = slices.reduce<number | null>((m, s) => (s.maxLatencyMs !== null && (m === null || s.maxLatencyMs > m) ? s.maxLatencyMs : m), null);
  const yMax = Math.max(50, Math.max(0, ...latencies) * 1.2);
  const step = W / Math.max(1, n);
  const x = (i: number) => (i + 0.5) * step;
  const y = (v: number) => PAD_TOP + (H - PAD_TOP) * (1 - v / yMax);

  // Line segments break where a slice has no successful check.
  const segments: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];
  slices.forEach((s, i) => {
    if (s.avgLatencyMs === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push({ i, v: s.avgLatencyMs });
  });
  if (current.length) segments.push(current);

  const line = (seg: { i: number; v: number }[]) => seg.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
  const area = (seg: { i: number; v: number }[]) =>
    `${line(seg)}L${x(seg[seg.length - 1]!.i).toFixed(1)},${H}L${x(seg[0]!.i).toFixed(1)},${H}Z`;

  const describe = (s: HealthSlice, i: number) => {
    const from = new Date(s.start);
    const to = new Date(from.getTime() + (i + 1 < n ? new Date(slices[i + 1]!.start).getTime() - from.getTime() : 30 * 60_000));
    const range = `${hhmm(from)}–${hhmm(to)} UTC`;
    if (s.checks === 0) return `${range}: no checks`;
    return `${range}: ${s.checks} check${s.checks === 1 ? "" : "s"}, ${s.failures} failed${s.avgLatencyMs !== null ? `, avg ${s.avgLatencyMs} ms` : ""}`;
  };

  if (checks === 0) {
    return (
      <div className={cn("grid place-items-center rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground", className)}>
        No health checks in the last 24 hours. The background worker records one every check interval once the server is published.
      </div>
    );
  }

  const uptime = ((checks - failures) / checks) * 100;
  return (
    <figure className={cn("grid gap-2", className)}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Response time, last 24 hours</span>
        <span className="flex flex-wrap gap-x-3 tabular-nums">
          <span>
            Uptime <span className={cn("font-medium", uptime >= 99 ? "text-success" : uptime >= 95 ? "text-warning" : "text-destructive")}>{uptime >= 99.95 ? "100" : uptime.toFixed(1)}%</span>
          </span>
          {avg !== null ? (
            <span>
              Avg <span className="font-medium text-foreground">{avg} ms</span>
            </span>
          ) : null}
          {peak !== null ? (
            <span>
              Peak <span className="font-medium text-foreground">{peak} ms</span>
            </span>
          ) : null}
        </span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-20 w-full overflow-visible text-primary" role="img" aria-label={`Average response time per half hour; uptime ${uptime.toFixed(1)}%`}>
          <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <line x1="0" x2={W} y1={y(yMax / 2)} y2={y(yMax / 2)} className="stroke-border" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
          {segments.map((seg) => (
            <g key={seg[0]!.i}>
              <path d={area(seg)} fill="currentColor" opacity="0.1" />
              {seg.length === 1 ? (
                <circle cx={x(seg[0]!.i)} cy={y(seg[0]!.v)} r="2.5" fill="currentColor" />
              ) : (
                <path d={line(seg)} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              )}
            </g>
          ))}
          {slices.map((s, i) => (
            <rect key={s.start} x={i * step} y="0" width={step} height={H} fill="transparent" className="hover:fill-foreground/5">
              <title>{describe(s, i)}</title>
            </rect>
          ))}
        </svg>
        {/* Labels the dashed mid line (half the scale), sitting just above it. */}
        <span
          className="pointer-events-none absolute right-0 bg-card/80 px-0.5 text-[10px] leading-none text-muted-foreground tabular-nums"
          style={{ top: `calc(${((y(yMax / 2) / H) * 100).toFixed(1)}% - 12px)` }}
        >
          {Math.round(yMax / 2)} ms
        </span>
      </div>
      <div className="flex h-2.5 gap-px" aria-hidden>
        {slices.map((s, i) => (
          <span key={s.start} title={describe(s, i)} className={cn("flex-1 rounded-[2px]", STATE_CLASS[sliceState(s)])} />
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>24 h ago</span>
        <span>now</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-[2px] bg-success/70" /> Reachable
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-[2px] bg-warning" /> Some checks failed
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-[2px] bg-destructive" /> Unreachable
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2 rounded-[2px] bg-muted ring-1 ring-border" /> No data
        </span>
      </div>
    </figure>
  );
}
