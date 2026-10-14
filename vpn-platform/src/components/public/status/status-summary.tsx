import { CircleSlashIcon, LayersIcon, ServerIcon, WifiIcon, WifiOffIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusPageData } from "@/lib/public/types";

const nf = new Intl.NumberFormat("en-US");

function Tile({
  icon,
  label,
  value,
  tone,
  className,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "primary" | "success" | "danger" | "warning" | "muted";
  className?: string;
}) {
  const toneClass = {
    primary: "bg-accent text-accent-foreground",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-destructive",
    warning: "bg-warning-soft text-warning",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className={cn("flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-xs", className)}>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5", toneClass)} aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-2xl leading-none font-bold tracking-tight tabular-nums">{nf.format(value)}</p>
        <p className="mt-1 truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

/** Summary tiles above the status tables (services, servers, online, offline, maintenance/full). */
export function StatusSummary({ totals, className }: { totals: StatusPageData["totals"]; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5", className)}>
      <Tile icon={<LayersIcon />} label="Services" value={totals.protocols} tone="primary" className="col-span-2 sm:col-span-1" />
      <Tile icon={<ServerIcon />} label="Servers" value={totals.servers} tone="muted" />
      <Tile icon={<WifiIcon />} label="Online" value={totals.online} tone="success" />
      <Tile icon={<WifiOffIcon />} label="Offline" value={totals.offline} tone="danger" />
      <Tile icon={<CircleSlashIcon />} label="Maintenance / full" value={totals.maintenance + totals.full} tone="warning" className="col-span-2 sm:col-span-1" />
    </div>
  );
}
