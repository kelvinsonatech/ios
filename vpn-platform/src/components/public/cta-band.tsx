import { cn } from "@/lib/utils";
import { HeroDecor } from "./page-header";

/** Rounded brand-gradient call-to-action panel (end of home, protocol and about pages). */
export function CtaBand({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("relative isolate overflow-hidden rounded-[2rem] bg-hero px-6 py-12 text-center text-hero-foreground shadow-xl shadow-primary/10 sm:px-12 sm:py-16", className)}>
      <HeroDecor />
      <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description ? <p className="mx-auto mt-3 max-w-xl text-pretty text-white/85">{description}</p> : null}
      {children ? <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
    </section>
  );
}

/** White pill button for use on gradient backgrounds. */
export const heroPrimaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-slate-900 shadow-lg shadow-black/10 transition-[transform,box-shadow,background-color] duration-300 outline-none hover:-translate-y-0.5 hover:bg-white/95 hover:shadow-xl focus-visible:ring-[3px] focus-visible:ring-white/60 motion-reduce:hover:translate-y-0 [&_svg]:size-4";

/** Glass outline pill button for use on gradient backgrounds. */
export const heroSecondaryButton =
  "inline-flex h-12 items-center justify-center gap-2 rounded-full bg-white/10 px-6 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm transition-colors duration-300 outline-none hover:bg-white/20 focus-visible:ring-[3px] focus-visible:ring-white/60 [&_svg]:size-4";
