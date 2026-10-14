import { cn } from "@/lib/utils";
import type { PublicCapacity } from "@/lib/public/types";

/** "37 of 50 left" with a bar that shrinks as slots are used. Unlimited capacity shows no bar. */
export function RemainingMeter({ capacity, className, compact }: { capacity: PublicCapacity; className?: string; compact?: boolean }) {
  const { remaining, limit } = capacity;
  if (remaining === null || limit === null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Unlimited slots</span>;
  }
  const pct = limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : 0;
  const tone = remaining === 0 ? "bg-destructive" : pct <= 20 ? "bg-warning" : "bg-primary";
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium tabular-nums">
          {remaining}
          {compact ? null : <span className="text-muted-foreground"> / {limit}</span>}
        </span>
        <span className="text-muted-foreground">{remaining === 0 ? "Full" : "slots left"}</span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-label="Remaining slots"
        aria-valuemin={0}
        aria-valuemax={limit}
        aria-valuenow={remaining}
      >
        <div className={cn("h-full rounded-full transition-[width] duration-500", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
