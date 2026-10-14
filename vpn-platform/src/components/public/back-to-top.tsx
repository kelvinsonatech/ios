"use client";

import { useSyncExternalStore } from "react";
import { ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";

function subscribe(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}
const farDown = () => window.scrollY > 900;

/** Floating "back to top" button that appears after scrolling down a long page. */
export function BackToTop() {
  const visible = useSyncExternalStore(subscribe, farDown, () => false);
  return (
    <button
      type="button"
      aria-label="Back to top"
      tabIndex={visible ? 0 : -1}
      aria-hidden={!visible}
      onClick={() => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        document.getElementById("main")?.focus({ preventScroll: true });
      }}
      className={cn(
        "fixed right-4 bottom-4 z-30 inline-flex size-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/25 ring-1 ring-black/5 transition-all duration-300 outline-none hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:right-6 sm:bottom-6",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUpIcon className="size-5" />
    </button>
  );
}
