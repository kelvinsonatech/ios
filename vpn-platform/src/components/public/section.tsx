import { cn } from "@/lib/utils";

/** Centred page column used by every public page (16 px gutters on phones). */
export function Container({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6", className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Card grids that centre a short list instead of leaving it left-aligned: tracks auto-fit between a
 * minimum and a maximum width (the maximum decides the column count: 4 countries or 3 servers per
 * row in the 6xl container), and phones get a single full-width column.
 */
export const COUNTRY_GRID = "grid grid-cols-1 gap-5 min-[480px]:grid-cols-[repeat(auto-fit,minmax(14.5rem,16.25rem))] min-[480px]:justify-center";
export const SERVER_GRID = "grid grid-cols-1 gap-5 md:grid-cols-[repeat(auto-fit,minmax(20rem,22rem))] md:justify-center";

/** Centred section title with an optional eyebrow and lead paragraph. */
export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  id,
  className,
  children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  align?: "center" | "start";
  id?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-8 sm:mb-10", align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-3xl", className)}>
      {eyebrow ? (
        <p className={cn("mb-2 inline-flex items-center gap-1.5 text-xs font-semibold tracking-wider text-primary uppercase [&_svg]:size-3.5")}>{eyebrow}</p>
      ) : null}
      <h2 id={id} className="scroll-mt-28 text-2xl font-bold tracking-tight text-balance sm:text-3xl">
        {title}
      </h2>
      {description ? <p className="mt-3 text-pretty text-muted-foreground">{description}</p> : null}
      {children}
    </div>
  );
}

/** Empty / error state card with an icon, message and optional actions. */
export function EmptyState({
  icon,
  title,
  description,
  children,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed bg-card/60 px-6 py-14 text-center", className)}>
      {icon ? (
        <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground [&_svg]:size-7">{icon}</span>
      ) : null}
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {description ? <p className="mt-1.5 max-w-md text-sm text-pretty text-muted-foreground">{description}</p> : null}
      {children ? <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{children}</div> : null}
    </div>
  );
}
