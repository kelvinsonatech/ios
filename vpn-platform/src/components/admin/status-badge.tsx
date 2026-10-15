import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type ServerStatus = "pending" | "online" | "offline" | "maintenance" | "disabled" | "full";
type Compatibility = "unknown" | "compatible" | "outdated" | "unsupported";

const STATUS: Record<ServerStatus, { label: string; variant: "success" | "danger" | "warning" | "muted" | "info"; dot: string }> = {
  online: { label: "Online", variant: "success", dot: "bg-success" },
  offline: { label: "Offline", variant: "danger", dot: "bg-destructive" },
  maintenance: { label: "Maintenance", variant: "warning", dot: "bg-warning" },
  disabled: { label: "Disabled", variant: "muted", dot: "bg-muted-foreground" },
  full: { label: "Full", variant: "info", dot: "bg-info" },
  pending: { label: "Pending setup", variant: "muted", dot: "bg-muted-foreground" },
};

export function ServerStatusBadge({ status, className }: { status: ServerStatus; className?: string }) {
  const s = STATUS[status];
  return (
    <Badge variant={s.variant} className={cn("gap-1.5 uppercase tracking-wide", className)}>
      <span className={cn("size-1.5 rounded-full", s.dot, status === "online" && "animate-pulse")} />
      {s.label}
    </Badge>
  );
}

export function CompatibilityBadge({ compatibility }: { compatibility: Compatibility }) {
  if (compatibility === "compatible") return null;
  if (compatibility === "unknown") return <Badge variant="muted">Version unknown</Badge>;
  return (
    <Badge variant={compatibility === "unsupported" ? "danger" : "warning"} className="uppercase tracking-wide">
      {compatibility === "unsupported" ? "Script unsupported" : "Server script outdated"}
    </Badge>
  );
}

export function ServiceDot({ status, className }: { status: string; className?: string }) {
  const color = status === "running" ? "bg-success" : status === "stopped" ? "bg-destructive" : "bg-muted-foreground/50";
  return <span title={status} className={cn("inline-block size-2 rounded-full", color, className)} />;
}
