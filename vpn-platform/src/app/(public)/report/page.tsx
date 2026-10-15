import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import {
  ActivityIcon,
  ArrowRightIcon,
  CalendarClockIcon,
  ClockIcon,
  FlagIcon,
  LifeBuoyIcon,
  MailIcon,
  PlugZapIcon,
  SendIcon,
  ShieldCheckIcon,
  WifiIcon,
} from "lucide-react";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { ReportForm } from "@/components/public/report/report-form";
import { initialTarget, reportOptionsFromStatus, targetLabel } from "@/components/public/report/report-target";
import { Container } from "@/components/public/section";
import { mailtoHref, pageMetadata, safeHref } from "@/lib/seo";
import { loadSettings, loadStatus } from "@/app/(public)/_lib/data";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const settings = await loadSettings();
  return pageMetadata({
    title: "Report a problem",
    description: `Something not working on ${settings.siteName}? Tell us which server and what happened, and we'll look into it.`,
    path: "/report",
    siteName: settings.siteName,
  });
}

const TIPS = [
  { icon: <ActivityIcon />, title: "Check the server status", body: "If the server shows Offline or Maintenance, we already know and are on it." },
  { icon: <PlugZapIcon />, title: "Try another port or server", body: "Some networks block certain ports. Another port or location often works right away." },
  { icon: <CalendarClockIcon />, title: "Check the expiry date", body: "Accounts stop working when they expire. My accounts shows how long yours has left." },
];

/** /report: "Report a problem" form, prefilled from ?server=<id>&protocol=<slug> (server page link). */
export default async function ReportPage({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const serverParam = typeof sp.server === "string" && UUID.test(sp.server) ? sp.server.toLowerCase() : null;
  const protocolParam = typeof sp.protocol === "string" && SLUG.test(sp.protocol) ? sp.protocol : null;

  const [settings, status, nonce] = await Promise.all([loadSettings(), loadStatus(), headers().then((h) => h.get("x-nonce") ?? undefined)]);
  const options = reportOptionsFromStatus(status);
  const initialValue = initialTarget(options, serverParam, protocolParam);
  const preselected = targetLabel(options, initialValue);
  const { email } = settings.contact;
  // Settings are validated on save; these render-time checks are the second line of defence.
  const mailto = mailtoHref(email);
  const telegramUrl = safeHref(settings.contact.telegramUrl);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Report a problem" }]}
        icon={<LifeBuoyIcon />}
        eyebrow="Support"
        title="Report a problem"
        description="Can't connect, slow speeds or an account that doesn't work? Tell us what happened and we'll look into it."
      >
        {preselected ? <HeroChip icon={<FlagIcon />}>{preselected}</HeroChip> : null}
        {status ? (
          <HeroChip icon={<WifiIcon />}>
            {status.totals.online} of {status.totals.servers} servers online
          </HeroChip>
        ) : null}
        <HeroChip icon={<ClockIcon />}>Every report is read</HeroChip>
      </PageHeader>

      <Container className="pt-2 pb-16 sm:pb-24">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
          <div className="min-w-0">
            <ReportForm options={options} initialValue={initialValue} captchaSiteKey={settings.captchaSiteKey} nonce={nonce} />
          </div>

          <aside aria-label="Before you report" className="grid min-w-0 gap-4">
            <section className="overflow-hidden rounded-3xl border bg-card shadow-sm" aria-labelledby="report-tips">
              <h2 id="report-tips" className="border-b px-5 py-4 font-semibold">
                Quick checks first
              </h2>
              <ul className="divide-y">
                {TIPS.map((t) => (
                  <li key={t.title} className="flex gap-3 px-5 py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-4.5" aria-hidden>
                      {t.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-pretty text-muted-foreground">{t.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="grid gap-1 border-t bg-muted/30 px-5 py-3">
                <Link
                  href="/server-status"
                  className="inline-flex min-h-10 items-center justify-between gap-2 rounded-md text-sm font-medium text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  Open server status
                  <ArrowRightIcon className="size-4" aria-hidden />
                </Link>
                <Link
                  href="/my-accounts"
                  className="inline-flex min-h-10 items-center justify-between gap-2 rounded-md text-sm font-medium text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  My accounts
                  <ArrowRightIcon className="size-4" aria-hidden />
                </Link>
              </div>
            </section>

            {mailto || telegramUrl ? (
              <section className="rounded-3xl border bg-card p-5 shadow-sm" aria-labelledby="report-contact">
                <h2 id="report-contact" className="font-semibold">
                  Other ways to reach us
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">For anything that isn&apos;t a server problem.</p>
                <ul className="mt-3 grid gap-2">
                  {mailto ? (
                    <li>
                      <a
                        href={mailto}
                        className="flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <MailIcon className="size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 truncate">{email}</span>
                      </a>
                    </li>
                  ) : null}
                  {telegramUrl ? (
                    <li>
                      <a
                        href={telegramUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex min-h-11 items-center gap-3 rounded-xl border px-3 text-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                      >
                        <SendIcon className="size-4 shrink-0 text-primary" aria-hidden />
                        <span className="min-w-0 truncate">Telegram</span>
                      </a>
                    </li>
                  ) : null}
                </ul>
              </section>
            ) : null}

            <p className="flex items-start gap-2 px-1 text-xs text-pretty text-muted-foreground">
              <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
              We never ask for your password. Reports are stored without your IP address and are only seen by our team.
            </p>
          </aside>
        </div>
      </Container>
    </>
  );
}
