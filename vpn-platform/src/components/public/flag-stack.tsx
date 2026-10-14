import { cn } from "@/lib/utils";
import type { PublicCountry } from "@/lib/public/types";
import { Flag } from "./flag";

/** Overlapping round flags of the countries a protocol is offered in ("+3" when there are more). */
export function FlagStack({ countries, max = 5, className }: { countries: PublicCountry[]; max?: number; className?: string }) {
  if (countries.length === 0) return null;
  const shown = countries.slice(0, max);
  const more = countries.length - shown.length;
  return (
    <span className={cn("flex items-center", className)}>
      <span className="flex -space-x-1.5">
        {shown.map((c) => (
          <Flag key={c.code} code={c.code} squared title={c.name} className="size-6 rounded-full ring-2 ring-card" />
        ))}
      </span>
      {more > 0 ? <span className="ml-1.5 text-xs font-medium text-muted-foreground">+{more}</span> : null}
    </span>
  );
}
