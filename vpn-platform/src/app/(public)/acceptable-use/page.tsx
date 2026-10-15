import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { BanIcon, FlagIcon, HandIcon, ShieldAlertIcon } from "lucide-react";
import { LegalArticle, type ArticleSection } from "@/components/public/legal-article";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { pageMetadata } from "@/lib/seo";
import { LEGAL_UPDATED, SHOW_REVIEW_NOTICE } from "@/app/(public)/_lib/legal";
import { loadSettings } from "@/app/(public)/_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSettings();
  return pageMetadata({
    title: "Acceptable use policy",
    description: `What you may and may not do with a ${settings.siteName} account. Breaking these rules gets the account removed.`,
    path: "/acceptable-use",
    siteName: settings.siteName,
  });
}

const PROHIBITED = [
  "Anything illegal where you are or where our server is located.",
  "Attacks of any kind: DDoS and flooding, port or vulnerability scanning, brute-forcing logins, exploiting or breaking into systems.",
  "Fraud: carding, phishing, scams, account takeovers and fake sign-ups.",
  "Sending spam or bulk unsolicited messages, including email, SMS and comments.",
  "Spreading malware, running botnets or command-and-control servers.",
  "Sharing material that sexually exploits minors, promotes terrorism, or infringes copyright (including torrenting and P2P file sharing).",
  "Harassing, threatening or doxxing other people.",
  "Reselling, renting or publishing accounts, or creating them in bulk or with scripts to get around the slot limits.",
  "Using so much bandwidth or so many connections that other users of the same server suffer.",
];

export default async function AcceptableUsePage() {
  await connection();
  const settings = await loadSettings();
  const name = settings.siteName;

  const sections: ArticleSection[] = [
    {
      id: "house-rules",
      title: "House rules",
      body: (
        <>
          <p>These rules are shown next to every account form. They apply to every account on every server:</p>
          {settings.rules.length > 0 ? (
            // Not a <ul>: the prose list styles (bullets, indent) do not suit chips.
            <div role="list" className="my-4 flex flex-wrap gap-2">
              {settings.rules.map((r) => (
                <span key={r} role="listitem" className="inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1.5 text-sm font-medium text-destructive">
                  <BanIcon className="size-3.5" aria-hidden />
                  {r}
                </span>
              ))}
            </div>
          ) : (
            <p>Use your account for normal, lawful browsing and apps on a single device.</p>
          )}
        </>
      ),
    },
    {
      id: "prohibited",
      title: "Not allowed",
      body: (
        <>
          <p>In addition to the house rules, you may not use {name} for:</p>
          <ul>
            {PROHIBITED.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      ),
    },
    {
      id: "fair-share",
      title: "Fair share",
      body: (
        <p>
          Our servers are shared by many people. Use one account per device, disconnect when you no longer need the tunnel, and let the account expire
          instead of creating new ones in a row.
        </p>
      ),
    },
    {
      id: "enforcement",
      title: "What happens if rules are broken",
      body: (
        <p>
          We may revoke the account immediately and without warning, block further account creation, and, where the law requires it, cooperate with
          the authorities. Because we keep very little data, we usually cannot tell who created an account, but we will not hesitate to shut one down.
        </p>
      ),
    },
    {
      id: "report",
      title: "Reporting abuse",
      body: (
        <p>
          If you see one of our servers being misused, please tell us through the <Link href="/report">report form</Link> or the{" "}
          <Link href="/contact">contact page</Link>. Include the server name and the time it happened.
        </p>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Acceptable use", href: "/acceptable-use" },
        ]}
        icon={<HandIcon />}
        eyebrow="Legal"
        title="Acceptable use policy"
        description="Free servers only stay free when everyone plays fair. Here is what that means."
      >
        <HeroChip icon={<ShieldAlertIcon />}>Abuse gets accounts removed</HeroChip>
        <HeroChip icon={<FlagIcon />}>Report misuse any time</HeroChip>
      </PageHeader>
      <LegalArticle sections={sections} updated={LEGAL_UPDATED} reviewNotice={SHOW_REVIEW_NOTICE} />
    </>
  );
}
