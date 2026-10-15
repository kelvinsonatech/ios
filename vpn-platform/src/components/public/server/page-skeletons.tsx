import { Skeleton } from "@/components/ui/skeleton";
import { HeroWave } from "@/components/public/hero-wave";
import { Container } from "@/components/public/section";

/** Placeholder hero band matching PageHeader's "hero" variant. */
function HeroSkeleton({ chips = 3 }: { chips?: number }) {
  return (
    <div className="relative isolate overflow-hidden bg-hero">
      <div className="mx-auto flex max-w-6xl flex-col items-center px-4 pt-10 pb-24 sm:px-6 sm:pb-32">
        <div className="h-4 w-48 rounded-full bg-white/20" />
        <div className="mt-10 size-16 rounded-2xl bg-white/20" />
        <div className="mt-6 h-9 w-72 max-w-full rounded-xl bg-white/25 sm:h-12 sm:w-[30rem]" />
        <div className="mt-4 h-4 w-60 max-w-full rounded-full bg-white/15" />
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          {Array.from({ length: chips }, (_, i) => (
            <div key={i} className="h-8 w-28 rounded-full bg-white/15" />
          ))}
        </div>
      </div>
      <HeroWave className="absolute inset-x-0 -bottom-px" />
    </div>
  );
}

/** Loading state of /<protocol>/<country>/<server>: form card + server info card. */
export function ServerPageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <HeroSkeleton chips={4} />
      <Container className="pt-2 pb-16">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
          <div className="overflow-hidden rounded-2xl border bg-card">
            <div className="flex items-center gap-3 border-b px-5 py-4 sm:px-6">
              <Skeleton className="size-10 rounded-xl" />
              <div className="grid flex-1 gap-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-64 max-w-full" />
              </div>
            </div>
            <div className="grid gap-5 px-5 py-6 sm:px-6">
              {[0, 1].map((i) => (
                <div key={i} className="grid gap-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-11 w-full" />
                </div>
              ))}
              <div className="grid gap-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
          <div className="overflow-hidden rounded-3xl border bg-card">
            <div className="flex items-center gap-3 px-5 py-4">
              <Skeleton className="size-10 rounded-xl" />
              <Skeleton className="h-5 w-32" />
            </div>
            <div className="grid gap-4 border-t px-5 py-5">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}

/** Loading state of /server-status: refresh bar, summary tiles and one table. */
export function StatusPageSkeleton() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <HeroSkeleton />
      <Container className="grid gap-6 pt-2 pb-16">
        <Skeleton className="h-16 w-full rounded-2xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-[4.75rem] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-28 w-full rounded-2xl" />
        <div className="overflow-hidden rounded-3xl border bg-card">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="h-5 w-36" />
          </div>
          <div className="grid gap-3 p-5">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      </Container>
    </div>
  );
}
