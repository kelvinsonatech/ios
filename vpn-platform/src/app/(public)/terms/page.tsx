import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { CalendarClockIcon, GiftIcon, ScaleIcon, SmartphoneIcon } from "lucide-react";
import { LegalArticle, type ArticleSection } from "@/components/public/legal-article";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { pageMetadata } from "@/lib/seo";
import { LEGAL_UPDATED, SHOW_REVIEW_NOTICE } from "@/app/(public)/_lib/legal";
import { joinTimes, loadSettings, zoneLabel } from "@/app/(public)/_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSettings();
  return pageMetadata({
    title: "Terms of service",
    description: `The terms for using ${settings.siteName}: free accounts, fair use, availability and liability.`,
    path: "/terms",
    siteName: settings.siteName,
  });
}

export default async function TermsPage() {
  await connection();
  const settings = await loadSettings();
  const name = settings.siteName;
  const resets = `${joinTimes(settings.quota.resetTimes)} (${zoneLabel(settings.quota.timezone)})`;

  const sections: ArticleSection[] = [
    {
      id: "agreement",
      title: "Agreement",
      body: (
        <p>
          By creating an account or otherwise using {name} (the &ldquo;service&rdquo;) you agree to these terms, to our{" "}
          <Link href="/acceptable-use">acceptable use policy</Link> and to our <Link href="/privacy">privacy policy</Link>. If you do not agree, please do
          not use the service.
        </p>
      ),
    },
    {
      id: "service",
      title: "The service",
      body: (
        <>
          <p>
            {name} provides free, temporary tunnel accounts (such as SSH, V2Ray, Trojan, Hysteria and UDP) on servers we operate. Accounts are created
            automatically and are valid for the period you choose on the server page. They expire on their own and are then removed from the server.
          </p>
          <p>
            Each server accepts a limited number of new accounts per period. The counters reset every day at {resets}. When a server is full, choose
            another one or wait for the next reset.
          </p>
        </>
      ),
    },
    {
      id: "your-account",
      title: "Your account",
      body: (
        <ul>
          <li>One account is meant for one device. Create another account for each additional device.</li>
          <li>Keep your details private. Anyone who has them can use your account, and we cannot show them to you again.</li>
          <li>Do not sell, rent or publish accounts, and do not create accounts in bulk or with automated tools.</li>
          <li>You are responsible for what happens through your account.</li>
        </ul>
      ),
    },
    {
      id: "fair-use",
      title: "Fair use and enforcement",
      body: (
        <p>
          You must follow the <Link href="/acceptable-use">acceptable use policy</Link>. We may limit, suspend or delete any account, and block access to
          the service, at any time and without notice when we believe it is being misused or to protect our servers and other users.
        </p>
      ),
    },
    {
      id: "availability",
      title: "Availability and changes",
      body: (
        <p>
          We try hard to keep every server running, but the service is free and offered without any availability guarantee. Servers, locations,
          protocols, validity periods and limits may change, be paused for maintenance or be retired at any time. Live information is on the{" "}
          <Link href="/server-status">server status</Link> page.
        </p>
      ),
    },
    {
      id: "warranty",
      title: "No warranty",
      body: (
        <p>
          The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, express or implied, including fitness
          for a particular purpose, uninterrupted access or that it will meet your requirements. A tunnel changes how your traffic travels; it does not
          make illegal activity legal and is not a guarantee of anonymity.
        </p>
      ),
    },
    {
      id: "liability",
      title: "Limitation of liability",
      body: (
        <p>
          To the fullest extent permitted by law, {name} and its operators are not liable for any indirect, incidental or consequential damages, or for
          any loss of data, profits or access, arising from your use of, or inability to use, the service.
        </p>
      ),
    },
    {
      id: "third-party",
      title: "Third-party apps",
      body: (
        <p>
          To connect you use apps made by others. We link to their official pages for convenience but are not affiliated with them and are not
          responsible for them. Download apps only from their official sources.
        </p>
      ),
    },
    {
      id: "changes",
      title: "Changes to these terms",
      body: (
        <p>
          We may update these terms. The date at the top shows the latest version. Continuing to use the service after a change means you accept the
          updated terms. Questions? <Link href="/contact">Contact us</Link>.
        </p>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Terms of service", href: "/terms" },
        ]}
        icon={<ScaleIcon />}
        eyebrow="Legal"
        title="Terms of service"
        description={`The ground rules for using ${name}, in plain language.`}
      >
        <HeroChip icon={<GiftIcon />}>Free accounts</HeroChip>
        <HeroChip icon={<SmartphoneIcon />}>One device per account</HeroChip>
        <HeroChip icon={<CalendarClockIcon />}>Expires automatically</HeroChip>
      </PageHeader>
      <LegalArticle sections={sections} updated={LEGAL_UPDATED} reviewNotice={SHOW_REVIEW_NOTICE} />
    </>
  );
}
