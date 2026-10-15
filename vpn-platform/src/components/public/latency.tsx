import { cn } from "@/lib/utils";

/** Round-trip time with a colour hint (green < 150 ms, amber < 400 ms, red otherwise). */
export function Latency({ ms, className }: { ms: number | null; className?: string }) {
  if (ms === null) return <span className={cn("text-muted-foreground", className)}>—</span>;
  const tone = ms < 150 ? "text-success" : ms < 400 ? "text-warning-strong" : "text-destructive";
  return <span className={cn("tabular-nums", tone, className)}>{ms} ms</span>;
}
