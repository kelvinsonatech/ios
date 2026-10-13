import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pager({ page, hasMore, params }: { page: number; hasMore: boolean; params: Record<string, string | undefined> }) {
  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    sp.set("page", String(p));
    return `?${sp.toString()}`;
  };
  if (page === 1 && !hasMore) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button asChild variant="outline" size="sm" className={page <= 1 ? "pointer-events-none opacity-50" : undefined}>
        <Link href={href(Math.max(1, page - 1))} aria-disabled={page <= 1}>
          <ChevronLeftIcon /> Previous
        </Link>
      </Button>
      <span className="text-sm text-muted-foreground tabular-nums">Page {page}</span>
      <Button asChild variant="outline" size="sm" className={!hasMore ? "pointer-events-none opacity-50" : undefined}>
        <Link href={href(page + 1)} aria-disabled={!hasMore}>
          Next <ChevronRightIcon />
        </Link>
      </Button>
    </div>
  );
}
