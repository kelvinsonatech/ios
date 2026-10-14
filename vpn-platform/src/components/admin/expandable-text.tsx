"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Long user-supplied text, clamped to a few lines with a "Show more" toggle. Rendered as plain
 * text (React escaping, line breaks preserved), never as HTML.
 */
export function ExpandableText({ text, lines = 2, threshold = 160, className }: { text: string; lines?: 2 | 3; threshold?: number; className?: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold || text.split("\n").length > lines;
  return (
    <div className={cn("grid min-w-0 justify-items-start gap-1", className)}>
      <p className={cn("text-sm break-words whitespace-pre-line", !open && long && (lines === 2 ? "line-clamp-2" : "line-clamp-3"))}>{text}</p>
      {long ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="rounded-sm text-xs font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          {open ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
