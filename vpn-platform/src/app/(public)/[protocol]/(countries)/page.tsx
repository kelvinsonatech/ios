import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActivityIcon, BanIcon, BookOpenIcon, CircleCheckIcon, ClockIcon, GlobeIcon, LightbulbIcon, MapPinIcon, ServerIcon } from "lucide-react";
import { ProtocolIcon } from "@/components/protocol-icon";
import { breadcrumbJsonLd, type Crumb } from "@/components/public/breadcrumbs";
import { CtaBand, heroPrimaryButton, heroSecondaryButton } from "@/components/public/cta-band";
import { formatDays, plural } from "@/components/public/format";
import { GuideSection } from "@/components/public/guide-section";
import { JsonLd } from "@/components/public/json-ld";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { Container, EmptyState, SectionHeading } from "@/components/public/section";
import { categoryLabel } from "@/components/public/nav";
import { guideFor } from "@/lib/protocol-guides";
import { absoluteUrl, pageMetadata, siteOrigin } from "@/lib/seo";
import { loadProtocolPage, loadSettings } from "@/app/(public)/_lib/data";
import { CountriesGrid } from "./countries-client";

type Props = { params: Promise<{ protocol: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { protocol: slug } = await params;
  const [data, settings] = await Promise.all([loadProtocolPage(slug), loadSettings()]);
  if (!data) return { title: "Not found", robots: { index: false } };
  const p = data.protocol;
  const where = data.countries.length ? ` in ${plural(data.countries.length, "country", "countries")}` : "";
  return pageMetadata({
    title: `Free ${p.name} accounts`,
    description: `${p.description} Create a free ${p.name} account valid for ${formatDays(p.durationOptions)} on servers${where}. Live status and free slots for every server.`.slice(0, 300),
    path: p.href,
    siteName: settings.siteName,
  });
}

export default async function ProtocolPage({ params }: Props) {
  await connection();
  const { protocol: slug } = await params;
  const [data, settings] = await Promise.all([loadProtocolPage(slug), loadSettings()]);
  if (!data) notFound();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const { protocol: p, countries } = data;
  const guide = guideFor(p.slug, p.name);
  const crumbs: Crumb[] = [{ label: "Home", href: "/" }, { label: p.name, href: p.href }];
  const open = countries.filter((c) => c.availability === "available").length;

  const jsonLd = [
    breadcrumbJsonLd(crumbs, siteOrigin()),
    {
      "@context": "https://schema.org",
      "@type": "Service",
      name: `${p.name} accounts`,
      serviceType: `${p.name} VPN account`,
      description: p.description,
      url: absoluteUrl(p.href),
      provider: { "@type": "Organization", name: settings.siteName, url: absoluteUrl("/") },
      areaServed: countries.map((c) => ({ "@type": "Country", name: c.name })),
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD", availability: open > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" },
    },
  ];

  return (
    <>
      <JsonLd data={jsonLd} nonce={nonce} />
      <PageHeader
        crumbs={crumbs}
        icon={<ProtocolIcon name={p.icon} />}
        eyebrow={categoryLabel(p.category)}
        title={`${p.name} accounts`}
        description={`${p.description} Pick a location below: every server shows live status, ping and free slots.`}
      >
        <HeroChip icon={<ClockIcon />}>Valid {formatDays(p.durationOptions)}</HeroChip>
        <HeroChip icon={<ServerIcon />}>
          {plural(p.serverCount, "server")} in {plural(countries.length, "country", "countries")}
        </HeroChip>
        <HeroChip icon={<span className={open > 0 ? "size-2 rounded-full bg-emerald-300" : "size-2 rounded-full bg-white/50"} />}>
          {p.availableCount} open now
        </HeroChip>
        <Link href="#guide" className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-white/60">
          <HeroChip icon={<BookOpenIcon />} className="bg-white/20 transition-colors hover:bg-white/30">
            How to connect
          </HeroChip>
        </Link>
      </PageHeader>

      <section aria-labelledby="locations-title" className="pt-4 sm:pt-6">
        <Container>
          <SectionHeading
            id="locations-title"
            eyebrow={
              <>
                <MapPinIcon /> Locations
              </>
            }
            title={`Choose a ${p.name} location`}
            description="Closer usually means faster. Servers refill their free slots at every reset."
          />
          {countries.length === 0 ? (
            <EmptyState
              icon={<GlobeIcon />}
              title={`No ${p.name} servers right now`}
              description="All servers for this protocol are offline or not published yet. Check the server status page or try another protocol."
            >
              <Link href="/server-status" className="text-sm font-semibold text-primary hover:underline">
                Server status →
              </Link>
              <Link href="/#protocols" className="text-sm font-semibold text-primary hover:underline">
                Other protocols →
              </Link>
            </EmptyState>
          ) : (
            <CountriesGrid countries={countries} protocolName={p.name} />
          )}
        </Container>
      </section>

      <section aria-labelledby="about-title" className="mt-20 sm:mt-28">
        <Container>
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
              <h2 id="about-title" className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <ProtocolIcon name={p.icon} className="size-5 text-primary" />
                What is {p.name}?
              </h2>
              <p className="mt-2 text-sm text-pretty text-muted-foreground">{guide.summary}</p>
              <ul className="mt-5 space-y-3 text-sm">
                {guide.highlights.map((h) => (
                  <li key={h} className="flex items-start gap-2.5">
                    <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    {h}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
              <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight">
                <LightbulbIcon className="size-5 text-warning" aria-hidden />
                Good to know
              </h2>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                {guide.tips.map((t) => (
                  <li key={t} className="flex items-start gap-2.5">
                    <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-warning" />
                    {t}
                  </li>
                ))}
              </ul>
              {settings.rules.length > 0 ? (
                <div className="mt-6 border-t pt-5">
                  <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">House rules</p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {settings.rules.map((r) => (
                      <li key={r} className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1 text-xs font-medium text-destructive">
                        <BanIcon className="size-3.5" aria-hidden />
                        {r}
                      </li>
                    ))}
                  </ul>
                  <Link href="/acceptable-use" className="mt-3 inline-block text-xs font-medium text-primary hover:underline">
                    Read the acceptable use policy
                  </Link>
                </div>
              ) : null}
            </div>
          </div>
        </Container>
      </section>

      <section id="guide" aria-labelledby="guide-title" className="mt-20 scroll-mt-24 sm:mt-28">
        <Container>
          <SectionHeading
            id="guide-title"
            eyebrow={
              <>
                <BookOpenIcon /> Guide
              </>
            }
            title={`How to connect to ${p.name}`}
            description={`${guide.label}: the apps we recommend and the few steps it takes.`}
          />
          <GuideSection guide={guide} protocolName={p.name} />
        </Container>
      </section>

      <Container className="mt-20 sm:mt-28">
        <CtaBand
          title={open > 0 ? `${plural(open, "location")} ready for you` : "Check back after the next reset"}
          description="Live status, ping and remaining slots for every server are on the status page."
        >
          {countries[0] ? (
            <Link href={(countries.find((c) => c.availability === "available") ?? countries[0]).href} className={heroPrimaryButton}>
              <MapPinIcon />
              {open > 0 ? "Open the best location" : "View locations"}
            </Link>
          ) : null}
          <Link href="/server-status" className={heroSecondaryButton}>
            <ActivityIcon />
            Server status
          </Link>
        </CtaBand>
      </Container>
    </>
  );
}
