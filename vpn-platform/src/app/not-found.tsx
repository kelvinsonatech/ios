import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { StatusMessage, pillPrimary } from "@/components/public/status-message";

/** Fallback 404 for URLs outside every layout (the public site has its own, with header and footer). */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <Link href="/" className="rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
        <Brand className="text-lg" markClassName="size-8" />
      </Link>
      <StatusMessage code="404" title="This page could not be found" description="The link may be broken or the page may have moved." className="py-12 sm:py-16">
        <Link href="/" className={pillPrimary}>
          <HomeIcon />
          Back to home
        </Link>
      </StatusMessage>
    </main>
  );
}
