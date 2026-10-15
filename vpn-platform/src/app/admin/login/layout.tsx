import { ShieldCheckIcon } from "lucide-react";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { getSiteSettings } from "@/server/settings/service";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const siteName = await getSiteSettings()
    .then((s) => s.siteName)
    .catch(() => undefined);
  return (
    <div className="relative flex min-h-dvh flex-col bg-muted/40">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(60%_100%_at_50%_0%,color-mix(in_oklch,var(--primary)_14%,transparent),transparent)]"
      />
      <header className="relative flex items-center justify-between px-4 py-4 sm:px-6">
        <Brand suffix="Admin" name={siteName} />
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-start justify-center px-4 pt-10 pb-16 sm:pt-20">
        <div className="w-full max-w-sm">{children}</div>
      </main>
      <footer className="relative flex items-center justify-center gap-1.5 pb-6 text-xs text-muted-foreground">
        <ShieldCheckIcon className="size-3.5" /> Restricted area. All access is logged.
      </footer>
    </div>
  );
}
