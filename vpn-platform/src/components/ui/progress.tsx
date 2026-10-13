import * as React from "react";
import { cn } from "@/lib/utils";

/** Static progress bar (server-rendered). `tone` switches colour as capacity fills up. */
function Progress({
  value,
  className,
  tone,
  ...props
}: React.ComponentProps<"div"> & { value: number; tone?: "default" | "warning" | "danger" }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const auto = tone ?? (pct >= 90 ? "danger" : pct >= 75 ? "warning" : "default");
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn("relative h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width]",
          auto === "danger" ? "bg-destructive" : auto === "warning" ? "bg-warning" : "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export { Progress };
