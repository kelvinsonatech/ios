import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActivityIcon, ArrowLeftIcon, BookOpenIcon, ClockIcon, FlagIcon, ServerIcon, ServerOffIcon } from "lucide-react";
import { breadcrumbJsonLd, type Crumb } from "@/components/public/breadcrumbs";
import { Flag } from "@/components/public/flag";
import { formatDays, plural } from "@/components/public/format";
import { JsonLd } from "@/components/public/json-ld";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { Countdown } from "@/components/public/live-time";
import { Container, EmptyState, SERVER_GRID, SectionHeading } from "@/components/public/section";
import { ServerCard } from "@/components/public/server-card";
import { absoluteUrl, pageMetadata, siteOrigin } from "@/lib/seo";
import { loadCountryPage, loadSettings } from "@/app/(public)/_lib/data";

type Props = { params: Promise<{ protocol: string; country: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { protocol, country } = await params;
  const [data, settings] = await Promise.all([loadCountryPage(protocol, country), loadSettings()]);
  if (!data) return { title: "Not found", robots: { index: false } };
  const { protocol: p, country: c, servers } = data;
  return pageMetadata({
    title: `${p.name} servers in ${c.name}`,
    description: `Free ${p.name} accounts on ${plural(servers.length, "server")} in ${c.name}, valid for ${formatDays(p.durationOptions)}. Live status, ping and free slots.`,
    path: `${p.href}/${c.slug}`,
    siteName: settings.siteName,
    // Every server here is offline right now: keep the page (empty state) out of search results.
    noIndex: servers.length === 0,
  });
}

export default async function CountryPage({ params }: Props) {
  await connection();
  const { protocol, country } = await params;
  const data = await loadCountryPage(protocol, country);
  if (!data) notFound();
  const settings = await loadSettings();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const { protocol: p, country: c, servers } = data;
  const path = `${p.href}/${c.slug}`;
  const crumbs: Crumb[] = [
    { label: "Home", href: "/" },
    { label: p.name, href: p.href },
    { label: c.name, href: path },
  ];
  const open = servers.filter((s) => s.availability === "available").length;
  const nextReset = servers
    .map((s) => s.capacity.quotaResetsAt)
    .filter((v): v is string => !!v)
    .sort()[0];

  const jsonLd = [
    breadcrumbJsonLd(crumbs, siteOrigin()),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: `${p.name} servers in ${c.name}`,
      serviceType: `${p.name} VPN account`,
      url: absoluteUrl(path),
      provider: { "@type": "Organization", name: settings.siteName, url: absoluteUrl("/") },
      areaServed: { "@type": "Country", name: c.name },
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} nonce={nonce} />
      <PageHeader
        crumbs={crumbs}
        icon={<Flag code={c.code} squared title={c.name} className="size-11 rounded-xl shadow-md" />}
        eyebrow={p.name}
        title={`${p.name} servers in ${c.name}`}
        description={`Fast ${p.name} servers in ${c.name}. Accounts are valid for ${formatDays(p.durationOptions)} and created in seconds.`}
      >
        <HeroChip icon={<ServerIcon />}>{plural(servers.length, "server")}</HeroChip>
        <HeroChip icon={<span className={open > 0 ? "size-2 rounded-full bg-emerald-300" : "size-2 rounded-full bg-white/50"} />}>{open} open now</HeroChip>
        <HeroChip icon={<ClockIcon />}>Valid {formatDays(p.durationOptions)}</HeroChip>
        {nextReset ? (
          <HeroChip icon={<ActivityIcon />}>
            <Countdown iso={nextReset} label="Slots reset" doneText="Slots resetting" />
          </HeroChip>
        ) : null}
      </PageHeader>

      <section aria-labelledby="servers-title" className="pt-4 sm:pt-6">
        <Container>
          <SectionHeading
            id="servers-title"
            eyebrow={
              <>
                <ServerIcon /> Servers
              </>
            }
            title={`Pick a server in ${c.name}`}
            description="Each card shows the ports, transports, ping and free slots. Create your account on the one you like."
          />
          {servers.length === 0 ? (
            <EmptyState
              icon={<ServerOffIcon />}
              title={`No ${p.name} servers in ${c.name} right now`}
              description="The servers here are offline or full at the moment. Try another country, or check back after the next reset."
            >
              <Link href={p.href} className="text-sm font-semibold text-primary hover:underline">
                All {p.name} locations →
              </Link>
              <Link href="/server-status" className="text-sm font-semibold text-primary hover:underline">
                Server status →
              </Link>
            </EmptyState>
          ) : (
            <div className={SERVER_GRID}>
              {servers.map((s, i) => (
                <ServerCard
                  key={s.id}
                  server={s}
                  protocol={p}
                  className="animate-in duration-500 fade-in fill-mode-both slide-in-from-bottom-3"
                  style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                />
              ))}
            </div>
          )}

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3 text-sm">
            <Link href={p.href} className="inline-flex h-11 items-center gap-2 rounded-full border bg-card px-5 font-medium transition-colors hover:border-primary/40 hover:text-primary">
              <ArrowLeftIcon className="size-4" />
              All {p.name} locations
            </Link>
            <Link
              href={`${p.href}#guide`}
              className="inline-flex h-11 items-center gap-2 rounded-full border bg-card px-5 font-medium transition-colors hover:border-primary/40 hover:text-primary"
            >
              <BookOpenIcon className="size-4" />
              How to connect
            </Link>
            <Link href="/report" className="inline-flex h-11 items-center gap-2 rounded-full border bg-card px-5 font-medium transition-colors hover:border-primary/40 hover:text-primary">
              <FlagIcon className="size-4" />
              Report a problem
            </Link>
          </div>
        </Container>
      </section>
    </>
  );
}
