import "flag-icons/css/flag-icons.min.css";
import { cn } from "@/lib/utils";

/**
 * Country flag from the self-hosted `flag-icons` SVG set (emoji flags do not render on Windows).
 * `squared` uses the 1:1 artwork; the default is 4:3.
 */
export function Flag({ code, squared, className, title }: { code: string; squared?: boolean; className?: string; title?: string }) {
  const cc = /^[A-Za-z]{2}$/.test(code) ? code.toLowerCase() : "xx";
  return (
    <span
      role="img"
      aria-label={title ?? code.toUpperCase()}
      title={title}
      className={cn("fi inline-block shrink-0 overflow-hidden rounded-[3px] bg-muted shadow-[0_0_0_1px_var(--border)]", `fi-${cc}`, squared && "fis", className)}
    />
  );
}
