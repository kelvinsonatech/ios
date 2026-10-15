import { Skeleton } from "@/components/ui/skeleton";
import { HeroWave } from "./hero-wave";
import { COUNTRY_GRID, Container, SERVER_GRID } from "./section";

/** Loading state for browse pages: a hero band with placeholder text and a grid of card skeletons. */
export function PageSkeleton({ cards = 6, variant = "country" }: { cards?: number; variant?: "country" | "server" }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="relative isolate overflow-hidden bg-hero">
        <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-10 pb-24 sm:px-6 sm:pb-32">
          <div className="h-4 w-40 rounded-full bg-white/20" />
          <div className="mt-10 size-16 rounded-2xl bg-white/20" />
          <div className="mt-6 h-9 w-72 max-w-full rounded-xl bg-white/25 sm:h-12 sm:w-[28rem]" />
          <div className="mt-4 h-4 w-80 max-w-full rounded-full bg-white/15" />
          <div className="mt-2 h-4 w-64 max-w-full rounded-full bg-white/15" />
          <div className="mt-7 flex gap-2.5">
            <div className="h-8 w-28 rounded-full bg-white/15" />
            <div className="h-8 w-32 rounded-full bg-white/15" />
            <div className="hidden h-8 w-24 rounded-full bg-white/15 sm:block" />
          </div>
        </div>
        <HeroWave className="absolute inset-x-0 -bottom-px" />
      </div>
      <Container className="pt-6">
        <div className="mx-auto mb-10 flex max-w-md flex-col items-center gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-72 max-w-full" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className={variant === "country" ? COUNTRY_GRID : SERVER_GRID}>
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className="flex flex-col items-center rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex w-full justify-between">
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              {variant === "country" ? <Skeleton className="mt-6 size-28 rounded-[1.6rem]" /> : <Skeleton className="mt-6 h-6 w-40" />}
              <Skeleton className="mt-4 h-5 w-32" />
              <div className="mt-6 w-full space-y-3">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                {variant === "server" ? (
                  <>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-14 w-full rounded-2xl" />
                  </>
                ) : null}
              </div>
              <Skeleton className="mt-6 h-11 w-full rounded-full" />
            </div>
          ))}
        </div>
      </Container>
    </div>
  );
}
