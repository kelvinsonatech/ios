import { cn } from "@/lib/utils";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { HeroWave } from "./hero-wave";

/**
 * Standard header for public inner pages: breadcrumbs, optional eyebrow/icon, title, description
 * and an actions/meta slot. Keeps protocol, country, server, status and report pages consistent.
 *
 * variant "hero" (default): a full-width brand-gradient band with centred white text that closes
 * with a wave into the page. It breaks out of a centred page container on its own (full-bleed), so
 * it can be placed first inside the page's container or directly in <main>. Use <HeroChip> for
 * meta items in `children`; buttons work too (use variant="secondary" or a white style).
 * variant "plain": the compact left-aligned header on the page background.
 */
export function PageHeader({
  crumbs,
  eyebrow,
  icon,
  title,
  description,
  children,
  className,
  variant = "hero",
}: {
  crumbs?: Crumb[];
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  variant?: "hero" | "plain";
}) {
  if (variant === "plain") {
    return (
      <header className={cn("relative pt-6 pb-8 sm:pt-10 sm:pb-12", className)}>
        {crumbs?.length ? <Breadcrumbs items={crumbs} className="mb-6" /> : null}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            {icon ? (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border bg-card text-primary shadow-sm [&_svg]:size-6">
                {icon}
              </span>
            ) : null}
            <div className="min-w-0">
              {eyebrow ? <div className="mb-1.5 text-xs font-medium tracking-wide text-primary uppercase">{eyebrow}</div> : null}
              <h1 className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">{title}</h1>
              {description ? <p className="mt-2 max-w-2xl text-pretty text-muted-foreground">{description}</p> : null}
            </div>
          </div>
          {children ? <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div> : null}
        </div>
      </header>
    );
  }

  return (
    <header className={cn("full-bleed relative isolate overflow-hidden bg-hero text-hero-foreground", className)}>
      <HeroDecor />
      <div className="relative mx-auto max-w-6xl px-4 pt-7 pb-20 text-center sm:px-6 sm:pt-10 sm:pb-28 lg:pb-32">
        {crumbs?.length ? <Breadcrumbs items={crumbs} tone="inverted" centered className="mb-8 sm:mb-10" /> : null}
        <div className="animate-in duration-500 fade-in fill-mode-both slide-in-from-bottom-3">
          {icon ? (
            <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-white/15 text-white shadow-lg ring-1 shadow-black/10 ring-white/25 backdrop-blur-sm [&_svg]:size-8">
              {icon}
            </span>
          ) : null}
          {eyebrow ? (
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1 text-xs font-semibold tracking-wider text-white/90 uppercase ring-1 ring-white/20">
              {eyebrow}
            </div>
          ) : null}
          <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-balance drop-shadow-sm sm:text-5xl">{title}</h1>
          {description ? <p className="mx-auto mt-4 max-w-2xl text-base text-pretty text-white/85 sm:text-lg">{description}</p> : null}
        </div>
        {children ? (
          <div className="mt-7 flex animate-in flex-wrap items-center justify-center gap-2.5 delay-100 duration-500 fade-in fill-mode-both slide-in-from-bottom-2">
            {children}
          </div>
        ) : null}
      </div>
      <HeroWave className="absolute inset-x-0 -bottom-px" />
    </header>
  );
}

/** Dot grid and soft glows layered over a `bg-hero` band (decorative). */
export function HeroDecor() {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 bg-hero-dots opacity-70" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-80 w-[48rem] max-w-[140vw] -translate-x-1/2 animate-glow rounded-full bg-[radial-gradient(closest-side,rgb(255_255_255/0.22),transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 -z-10 size-72 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--hero-from)_70%,transparent),transparent)] blur-2xl"
      />
    </>
  );
}

/** Pill for meta information inside a hero band ("Valid 7 days", "4 servers"). */
export function HeroChip({ icon, children, className }: { icon?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full bg-white/12 px-3 py-1.5 text-sm font-medium text-white ring-1 ring-white/20 backdrop-blur-sm [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-white/80",
        className,
      )}
    >
      {icon}
      {children}
    </span>
  );
}
