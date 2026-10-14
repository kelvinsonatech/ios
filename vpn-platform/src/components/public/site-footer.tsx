import Link from "next/link";
import { ActivityIcon, GlobeIcon, MailIcon, SendIcon, ShieldCheckIcon, SparklesIcon } from "lucide-react";
import { BrandMark } from "@/components/brand";
import { ProtocolIcon } from "@/components/protocol-icon";
import { mailtoHref, safeHref } from "@/lib/seo";
import type { PublicSiteSettings, SiteStats } from "@/lib/public/types";
import type { NavProtocol } from "./services-menu";

const fmt = new Intl.NumberFormat("en-US");

const RESOURCES = [
  { href: "/server-status", label: "Server status" },
  { href: "/my-accounts", label: "My accounts" },
  { href: "/report", label: "Report a problem" },
  { href: "/#how-it-works", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
];
const COMPANY = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy policy" },
  { href: "/terms", label: "Terms of service" },
  { href: "/acceptable-use", label: "Acceptable use" },
];

/**
 * Dark site footer: brand and contact, protocol links, resources, legal pages and (when
 * settings.display.showStats is on) live counters: accounts created in total and "+N today" per
 * protocol, servers online and countries.
 */
export function SiteFooter({
  settings,
  protocols,
  stats,
}: {
  settings: Pick<PublicSiteSettings, "siteName" | "tagline" | "contact" | "display">;
  protocols: NavProtocol[];
  stats: SiteStats | null;
}) {
  const email = mailtoHref(settings.contact.email);
  const telegram = safeHref(settings.contact.telegramUrl);
  const showStats = settings.display.showStats && stats !== null;
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-24 bg-footer text-footer-foreground" aria-labelledby="footer-title">
      <h2 id="footer-title" className="sr-only">
        Site footer
      </h2>
      <svg aria-hidden viewBox="0 0 1440 60" preserveAspectRatio="none" className="absolute inset-x-0 -top-px block h-8 w-full sm:h-12">
        <path d="M0 0h1440v18c-160 26-340 40-560 30S460 6 260 8 60 34 0 42Z" className="fill-background" />
      </svg>

      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-20 pb-12 sm:px-6 sm:pt-24 md:grid-cols-2 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <Link href="/" className="inline-flex items-center gap-2.5 rounded-lg text-xl font-semibold tracking-tight outline-none focus-visible:ring-[3px] focus-visible:ring-white/40">
            <BrandMark className="size-9" />
            {settings.siteName}
          </Link>
          <p className="mt-4 max-w-sm text-sm leading-6 text-footer-muted">
            {settings.tagline || "Private tunnels, provisioned in seconds."} Accounts are created on the server in seconds, shown to you once and
            never stored.
          </p>
          {stats ? (
            <div className="mt-6 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-400" />
                </span>
                <span className="tabular-nums">{fmt.format(stats.serversOnline)}</span> servers online
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-3 py-1.5 ring-1 ring-white/10">
                <GlobeIcon className="size-3.5 text-footer-muted" aria-hidden />
                <span className="tabular-nums">{fmt.format(stats.countries)}</span> {stats.countries === 1 ? "country" : "countries"}
              </span>
            </div>
          ) : null}
          {email || telegram ? (
            <div className="mt-6 flex flex-wrap gap-2">
              {email ? (
                <a href={email} className={footerButton}>
                  <MailIcon className="size-4" aria-hidden />
                  Email us
                </a>
              ) : null}
              {telegram ? (
                <a href={telegram} target="_blank" rel="noopener noreferrer" className={footerButton}>
                  <SendIcon className="size-4" aria-hidden />
                  Telegram
                </a>
              ) : null}
            </div>
          ) : null}
        </div>

        <FooterColumn title="Services" className="lg:col-span-2">
          {protocols.length === 0 ? <li className="text-footer-muted">Coming soon</li> : null}
          {protocols.map((p) => (
            <li key={p.slug}>
              <Link href={p.href} className={footerLink}>
                <ProtocolIcon name={p.icon} className="size-3.5 opacity-70" />
                {p.name}
              </Link>
            </li>
          ))}
        </FooterColumn>

        <FooterColumn title="Resources" className="lg:col-span-2">
          {RESOURCES.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className={footerLink}>
                {l.label}
              </Link>
            </li>
          ))}
        </FooterColumn>

        {showStats && stats ? (
          <div className="md:col-span-2 lg:col-span-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <ActivityIcon className="size-4 text-emerald-400" aria-hidden />
              Live statistics
            </h3>
            <dl className="mt-4 grid grid-cols-2 gap-2">
              <StatTile label="Accounts created" value={fmt.format(stats.accountsTotal)} />
              <StatTile label="Created today" value={`+${fmt.format(stats.accountsToday)}`} accent />
            </dl>
            {stats.byProtocol.length > 0 ? (
              <ul className="mt-3 divide-y divide-footer-border rounded-xl bg-white/[0.03] px-3 ring-1 ring-white/10">
                {stats.byProtocol.map((p) => (
                  <li key={p.slug} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="truncate text-footer-muted">{p.name}</span>
                    <span className="flex items-baseline gap-2 tabular-nums">
                      <span className="font-medium">{fmt.format(p.total)}</span>
                      <span className={p.today > 0 ? "text-xs font-semibold text-emerald-400" : "text-xs text-footer-muted"}>+{fmt.format(p.today)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <FooterColumn title="Company" className="lg:col-span-4">
            {COMPANY.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className={footerLink}>
                  {l.label}
                </Link>
              </li>
            ))}
          </FooterColumn>
        )}
      </div>

      <div className="border-t border-footer-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 text-xs text-footer-muted sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>
              © {year} {settings.siteName}
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheckIcon className="size-3.5 text-emerald-400" aria-hidden />
              No raw IPs stored · results delivered once
            </span>
            <span className="inline-flex items-center gap-1">
              <SparklesIcon className="size-3.5 text-emerald-400" aria-hidden />
              Every account gets its own avatar
            </span>
          </p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {(showStats ? COMPANY : COMPANY.slice(2)).map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="rounded transition-colors hover:text-footer-foreground focus-visible:outline-2 focus-visible:outline-white/50">
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  );
}

const footerLink =
  "inline-flex items-center gap-2 rounded py-0.5 text-sm text-footer-muted transition-colors hover:text-footer-foreground focus-visible:outline-2 focus-visible:outline-white/50";
const footerButton =
  "inline-flex h-10 items-center gap-2 rounded-full bg-white/8 px-4 text-sm font-medium ring-1 ring-white/12 transition-colors hover:bg-white/14 focus-visible:outline-2 focus-visible:outline-white/50";

function FooterColumn({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <nav aria-label={title} className={className}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-4 space-y-2">{children}</ul>
    </nav>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-white/10">
      <dt className="text-[11px] text-footer-muted">{label}</dt>
      <dd className={accent ? "text-lg font-semibold text-emerald-400 tabular-nums" : "text-lg font-semibold tabular-nums"}>{value}</dd>
    </div>
  );
}
