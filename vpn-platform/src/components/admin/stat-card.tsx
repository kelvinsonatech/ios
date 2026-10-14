import Link from "next/link";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "default" | "success" | "danger" | "warning";
  /** Makes the whole card a link (e.g. to the list behind the number). */
  href?: string;
}) {
  const card = (
    <Card className={cn("h-full gap-2 px-5 py-4", href && "transition-colors group-hover:border-primary/40 group-hover:bg-muted/30")}>
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
  if (!href) return card;
  return (
    <Link href={href} className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
      {card}
    </Link>
  );
}
