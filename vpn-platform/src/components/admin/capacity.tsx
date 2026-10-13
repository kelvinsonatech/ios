import { Progress } from "@/components/ui/progress";

export function Capacity({ current, max, compact }: { current: number; max: number | null; compact?: boolean }) {
  if (!max) return <span className="text-sm tabular-nums">{current} / ∞</span>;
  const pct = (current / max) * 100;
  return (
    <div className={compact ? "grid w-28 gap-1" : "grid gap-1.5"}>
      <div className="flex justify-between text-xs tabular-nums">
        <span>
          {current} / {max}
        </span>
        {!compact ? <span className="text-muted-foreground">{Math.round(pct)}%</span> : null}
      </div>
      <Progress value={pct} />
    </div>
  );
}
