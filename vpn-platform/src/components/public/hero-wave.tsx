import { cn } from "@/lib/utils";

/**
 * Two-layer wave that closes a gradient hero band into the page background. Decorative only; the
 * front layer is filled with the page background colour so the band blends into the content.
 */
export function HeroWave({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 120"
      preserveAspectRatio="none"
      className={cn("pointer-events-none block h-10 w-full sm:h-16 lg:h-20", flip && "rotate-180", className)}
    >
      <path d="M0 70C180 38 360 18 560 34s380 62 580 58 230-40 300-56v84H0Z" className="fill-background/35" />
      <path d="M0 96c200-44 420-66 640-50 230 17 400 64 600 54 90-4 150-18 200-32v52H0Z" className="fill-background" />
    </svg>
  );
}
