import { cn } from "@/lib/utils";

/**
 * Full-width message block for 404 and error pages: big code, title, text and actions, on a soft
 * brand glow. Works inside the public layout and standalone (root not-found).
 */
export function StatusMessage({
  code,
  icon,
  title,
  description,
  children,
  className,
}: {
  code?: string;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative isolate flex flex-col items-center px-4 py-20 text-center sm:py-28", className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute top-6 left-1/2 -z-10 h-72 w-[40rem] max-w-[120vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_20%,transparent),transparent)]"
      />
      {code ? (
        <p className="bg-hero bg-clip-text font-mono text-7xl font-bold tracking-tighter text-transparent sm:text-8xl" aria-hidden>
          {code}
        </p>
      ) : null}
      {icon ? <span className="mt-2 flex size-14 items-center justify-center rounded-2xl bg-accent text-primary [&_svg]:size-7">{icon}</span> : null}
      <h1 className="mt-6 text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
      {description ? <p className="mt-3 max-w-md text-pretty text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-8 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
    </div>
  );
}

export const pillPrimary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/20 transition-colors outline-none hover:bg-primary/90 focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4";
export const pillOutline =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full border bg-card px-5 text-sm font-semibold transition-colors outline-none hover:border-primary/40 hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4";
