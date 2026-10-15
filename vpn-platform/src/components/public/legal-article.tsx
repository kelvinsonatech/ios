import { FileWarningIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container } from "./section";

export interface ArticleSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

/**
 * Long-form page body (about and legal pages): a sticky "On this page" index on wide screens and
 * the sections as prose in a card. `reviewNotice` shows a visible reminder that template text still
 * needs the operator's review.
 */
export function LegalArticle({
  sections,
  updated,
  reviewNotice,
  className,
}: {
  sections: ArticleSection[];
  updated?: string;
  reviewNotice?: boolean;
  className?: string;
}) {
  return (
    <Container className={cn("grid gap-8 pt-4 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-12", className)}>
      <aside className="hidden lg:block">
        <nav aria-label="On this page" className="sticky top-24">
          <p className="mb-3 text-xs font-semibold tracking-wider text-muted-foreground uppercase">On this page</p>
          <ol className="space-y-1 border-l text-sm">
            {sections.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-muted-foreground transition-colors hover:border-primary hover:text-foreground">
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </aside>
      <article className="min-w-0 rounded-3xl border bg-card p-6 shadow-sm sm:p-10">
        {reviewNotice ? (
          <p className="mb-8 flex items-start gap-3 rounded-2xl bg-warning-soft p-4 text-sm text-foreground">
            <FileWarningIcon className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <span>
              <strong className="font-semibold">Template text.</strong> This page is a starting point written for this service and must be reviewed
              (and adapted to your jurisdiction) by the operator before launch.
            </span>
          </p>
        ) : null}
        {updated ? <p className="mb-6 text-xs text-muted-foreground">Last updated: {updated}</p> : null}
        <div className="prose-vl">
          {sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-28">
              <h2 id={`${s.id}-title`}>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
      </article>
    </Container>
  );
}
