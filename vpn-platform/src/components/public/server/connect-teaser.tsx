import Link from "next/link";
import { ArrowRightIcon, BookOpenIcon, LaptopIcon, SmartphoneIcon } from "lucide-react";

/** "How to connect" teaser under the form, linking to the protocol page's guide (#guide). */
export function ConnectTeaser({ protocolSlug, protocolName }: { protocolSlug: string; protocolName: string }) {
  return (
    <Link
      href={`/${protocolSlug}#guide`}
      className="group flex items-center gap-4 rounded-3xl border bg-card p-5 shadow-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-accent text-accent-foreground">
        <BookOpenIcon className="size-6" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">How to connect</span>
        <span className="block text-sm text-muted-foreground">
          Step-by-step setup for {protocolName} apps on phones and computers.
        </span>
        <span className="mt-1.5 flex items-center gap-2 text-muted-foreground" aria-hidden>
          <SmartphoneIcon className="size-3.5" />
          <LaptopIcon className="size-3.5" />
        </span>
      </span>
      <ArrowRightIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary motion-reduce:transition-none" aria-hidden />
    </Link>
  );
}
