import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FaqItem {
  q: string;
  a: string;
}

/** Accordion built on native <details>/<summary>: keyboard and screen-reader friendly, no JS. */
export function Faq({ items, className }: { items: FaqItem[]; className?: string }) {
  return (
    <div className={cn("divide-y overflow-hidden rounded-3xl border bg-card shadow-sm", className)}>
      {items.map((item) => (
        <details key={item.q} className="group [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left font-medium transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset sm:px-6">
            <span>{item.q}</span>
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted transition-[transform,background-color] duration-300 group-open:rotate-180 group-open:bg-accent group-open:text-accent-foreground">
              <ChevronDownIcon className="size-4" aria-hidden />
            </span>
          </summary>
          <div className="px-5 pb-5 text-sm leading-6 text-pretty text-muted-foreground sm:px-6">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/** schema.org FAQPage for <JsonLd>. */
export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}
