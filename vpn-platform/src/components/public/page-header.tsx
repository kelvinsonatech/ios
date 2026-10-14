import { cn } from "@/lib/utils";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";

/**
 * Standard header for public inner pages: breadcrumbs, optional eyebrow/icon, title, description
 * and an actions/meta slot. Keeps protocol, country, server, status and report pages consistent.
 */
export function PageHeader({
  crumbs,
  eyebrow,
  icon,
  title,
  description,
  children,
  className,
}: {
  crumbs?: Crumb[];
  eyebrow?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
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
