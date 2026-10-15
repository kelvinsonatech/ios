import { cn } from "@/lib/utils";
import type { Availability } from "@/lib/public/types";

export const AVAILABILITY: Record<Availability, { label: string; dot: string; text: string; soft: string }> = {
  available: { label: "Online", dot: "bg-success", text: "text-success", soft: "bg-success-soft" },
  full: { label: "Full", dot: "bg-info", text: "text-info", soft: "bg-info-soft" },
  maintenance: { label: "Maintenance", dot: "bg-warning", text: "text-warning-strong", soft: "bg-warning-soft" },
  offline: { label: "Offline", dot: "bg-destructive", text: "text-destructive", soft: "bg-danger-soft" },
  service_stopped: { label: "Unavailable", dot: "bg-destructive", text: "text-destructive", soft: "bg-danger-soft" },
};

/** Status pill with a live dot ("Online" pulses). */
export function AvailabilityBadge({ availability, className }: { availability: Availability; className?: string }) {
  const a = AVAILABILITY[availability];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", a.soft, a.text, className)}>
      <span className="relative flex size-2">
        {availability === "available" ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60", a.dot)} /> : null}
        <span className={cn("relative inline-flex size-2 rounded-full", a.dot)} />
      </span>
      {a.label}
    </span>
  );
}
