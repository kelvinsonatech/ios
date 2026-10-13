import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning";
}) {
  return (
    <Card className="gap-2 px-5 py-4">
      <div className="flex items-center justify-between text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
        {icon ? (
          <span
            className={cn(
              "[&_svg]:size-4",
              tone === "success" && "text-success",
              tone === "danger" && "text-destructive",
              tone === "warning" && "text-warning",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </Card>
  );
}
