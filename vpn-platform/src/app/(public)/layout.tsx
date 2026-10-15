import type { Metadata } from "next";
import { connection } from "next/server";
import { AnnouncementBar } from "@/components/public/announcement-bar";
import { BackToTop } from "@/components/public/back-to-top";
import { SiteFooter } from "@/components/public/site-footer";
import { SiteHeader } from "@/components/public/site-header";
import type { NavProtocol } from "@/components/public/nav";
import { loadProtocols, loadSettings, loadStats, resetSchedule } from "./_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSettings();
  return {
    title: { default: `${settings.siteName} · ${settings.tagline || "Private tunnels"}`, template: `%s · ${settings.siteName}` },
    description: settings.seoDescription,
    applicationName: settings.siteName,
    openGraph: { siteName: settings.siteName, type: "website", locale: "en_US" },
  };
}

/**
 * Chrome of every public page: reset/announcement bar, sticky header with the Services menu,
 * main content and the footer with live statistics. Every data source degrades on its own
 * (see ./_lib/data.ts), so the shell renders even while the database is unavailable.
 */
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  await connection();
  const [settings, protocols, stats] = await Promise.all([loadSettings(), loadProtocols(), loadStats()]);
  const schedule = resetSchedule(settings.quota);
  const nav: NavProtocol[] = protocols.map((p) => ({
    slug: p.slug,
    name: p.name,
    description: p.description,
    icon: p.icon,
    category: p.category,
    serverCount: p.serverCount,
    availableCount: p.availableCount,
    href: p.href,
  }));

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip">
      <a
        href="#main"
        className="sr-only z-[60] rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <AnnouncementBar
        announcement={settings.announcement}
        resetTimesLabel={schedule.timesLabel}
        timeZoneLabel={schedule.zoneLabel}
        nextResetAt={schedule.nextResetAt}
      />
      <SiteHeader siteName={settings.siteName} protocols={nav} />
      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>
      <SiteFooter settings={settings} protocols={nav} stats={stats} />
      <BackToTop />
    </div>
  );
}
