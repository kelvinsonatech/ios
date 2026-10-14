import type { Metadata } from "next";
import { cache } from "react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ActivityIcon, CalendarClockIcon, GaugeIcon } from "lucide-react";
import { ProtocolIcon } from "@/components/protocol-icon";
import { CreateAccountPanel } from "@/components/public/account/create-account-panel";
import { AVAILABILITY } from "@/components/public/availability-badge";
import { breadcrumbJsonLd, type Crumb } from "@/components/public/breadcrumbs";
import { Flag } from "@/components/public/flag";
import { formatDayRange } from "@/components/public/format";
import { JsonLd } from "@/components/public/json-ld";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { Container } from "@/components/public/section";
import { ConnectTeaser } from "@/components/public/server/connect-teaser";
import { ServerInfoCard } from "@/components/public/server/server-info-card";
import { absoluteUrl, pageMetadata, siteOrigin } from "@/lib/seo";
import { SERVER_SLUG_PATTERN } from "@/lib/slug";
import { cn } from "@/lib/utils";
import type { PublicServerCard } from "@/lib/public/types";
import { getCountryPage, getServerPage } from "@/server/public/catalog";
import { loadSettings, resetSchedule } from "@/app/(public)/_lib/data";

type Params = { protocol: string; country: string; server: string };

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** One catalogue lookup per request (shared by generateMetadata and the page). */
const loadServer = cache(async (protocol: string, country: string, server: string) => {
  if (!SLUG.test(protocol) || !SLUG.test(country) || !SERVER_SLUG_PATTERN.test(server)) return null;
  return getServerPage(protocol, country, server);
});

/** Other servers of the same protocol and country that can take an account right now. */
async function availableAlternatives(protocol: string, country: string, exceptId: string): Promise<PublicServerCard[]> {
  try {
    const page = await getCountryPage(protocol, country);
    return (page?.servers ?? []).filter((s) => s.id !== exceptId && s.availability === "available");
  } catch {
    return [];
  }
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  await connection();
  const p = await params;
  const data = await loadServer(p.protocol, p.country, p.server);
  if (!data) return { title: "Server not found", robots: { index: false, follow: true } };
  const settings = await loadSettings();
  const { protocol, country, server } = data;
  const where = [server.city, country.name].filter(Boolean).join(", ");
  return pageMetadata({
    title: `Create ${protocol.name} account · ${server.name} (${country.name})`,
    description: `Free ${protocol.name} account on ${server.name} in ${where}. Valid for ${formatDayRange(protocol.durationOptions)}, created in seconds, no sign-up.`,
    path: server.href,
    siteName: settings.siteName,
  });
}

/**
 * /<protocol>/<country>/<server>: create an account on one server. The form (left, first on
 * phones) turns into progress and then the one-time result in place; the side card shows live
 * status, slots with the reset countdown, ports, validity and the fair-use rules.
 */
export default async function ServerPage({ params }: { params: Promise<Params> }) {
  await connection();
  const p = await params;
  const data = await loadServer(p.protocol, p.country, p.server);
  if (!data) notFound();
  const { protocol, country, server } = data;

  const [settings, nonce, alternatives] = await Promise.all([
    loadSettings(),
    headers().then((h) => h.get("x-nonce") ?? undefined),
    server.availability === "available" ? Promise.resolve([]) : availableAlternatives(protocol.slug, country.slug, server.id),
  ]);
  const schedule = resetSchedule(settings.quota);
  const status = AVAILABILITY[server.availability];
  const { remaining } = server.capacity;

  const crumbs: Crumb[] = [
    { label: "Home", href: "/" },
    { label: protocol.name, href: protocol.href },
    { label: country.name, href: `/${protocol.slug}/${country.slug}` },
    { label: server.name },
  ];

  const serviceLd = {
    "@context": "https://schema.org",
    "@type": "Service",
    name: `${protocol.name} account on ${server.name}`,
    serviceType: `${protocol.name} account`,
    url: absoluteUrl(server.href),
    areaServed: { "@type": "Country", name: country.name },
    provider: { "@type": "Organization", name: settings.siteName, url: absoluteUrl("/") },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      availability: server.availability === "available" ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };

  return (
    <>
      <PageHeader
        crumbs={crumbs}
        icon={<ProtocolIcon name={protocol.icon} />}
        eyebrow={
          <>
            <Flag code={country.code} className="h-3 w-4" title={country.name} />
            {country.name}
          </>
        }
        title={`Create ${protocol.name} Account`}
        description={`Server ${server.name} (${country.name})`}
      >
        <HeroChip icon={<span aria-hidden className={cn("size-2 rounded-full ring-2 ring-white/40", status.dot, server.availability === "available" && "animate-pulse")} />}>
          {status.label}
        </HeroChip>
        {server.latencyMs !== null ? <HeroChip icon={<ActivityIcon />}>{server.latencyMs} ms</HeroChip> : null}
        <HeroChip icon={<GaugeIcon />}>{remaining === null ? "Unlimited slots" : `${remaining} ${remaining === 1 ? "slot" : "slots"} left`}</HeroChip>
        <HeroChip icon={<CalendarClockIcon />}>Valid {formatDayRange(protocol.durationOptions)}</HeroChip>
      </PageHeader>

      <Container className="relative pt-2 pb-16 sm:pb-24">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-8">
          <div className="grid min-w-0 gap-6">
            <CreateAccountPanel
              protocol={protocol}
              country={country}
              server={server}
              siteName={settings.siteName}
              captchaSiteKey={settings.captchaSiteKey}
              nonce={nonce}
              alternatives={alternatives}
            />
            <ConnectTeaser protocolSlug={protocol.slug} protocolName={protocol.name} />
          </div>
          <aside aria-label="Server details" className="min-w-0">
            <ServerInfoCard
              protocol={protocol}
              country={country}
              server={server}
              rules={settings.rules}
              resetLabel={`${schedule.timesLabel} (${schedule.zoneLabel})`}
            />
          </aside>
        </div>
      </Container>

      <JsonLd data={breadcrumbJsonLd(crumbs, siteOrigin())} nonce={nonce} />
      <JsonLd data={serviceLd} nonce={nonce} />
    </>
  );
}
