import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ActivityIcon, EyeOffIcon, FingerprintIcon, GlobeIcon, HeartHandshakeIcon, InfoIcon, KeyRoundIcon, ServerIcon, ShieldCheckIcon, UserRoundIcon, ZapIcon } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { CtaBand, heroPrimaryButton, heroSecondaryButton } from "@/components/public/cta-band";
import { formatCount } from "@/components/public/format";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { Container, SectionHeading } from "@/components/public/section";
import { pageMetadata } from "@/lib/seo";
import { avatarDataUri } from "@/server/avatar";
import { loadProtocols, loadSettings, loadStats } from "../_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSettings();
  return pageMetadata({
    title: "About",
    description: `What ${settings.siteName} is, how accounts are created and what we do (and don't) keep.`,
    path: "/about",
    siteName: settings.siteName,
  });
}

export default async function AboutPage() {
  await connection();
  const [settings, protocols, stats] = await Promise.all([loadSettings(), loadProtocols(), loadStats()]);
  const avatars = ["north", "delta", "orbit"].map((seed) => ({ seed, src: avatarDataUri(`about:${seed}`, settings.avatarStyle) }));

  const values = [
    {
      icon: <ZapIcon />,
      title: "Instant, automatic",
      text: "When you press create, our website asks the VPN server to add your account through a small, locked-down API. No human in the loop, no waiting.",
    },
    {
      icon: <EyeOffIcon />,
      title: "Shown once",
      text: "Your credentials travel to your browser as an encrypted one-time result. After you have seen them, the copy on our side is gone.",
    },
    {
      icon: <FingerprintIcon />,
      title: "No raw IPs",
      text: "We protect the service from abuse with a keyed hash of your IP address that cannot be turned back into the address itself.",
    },
    {
      icon: <ShieldCheckIcon />,
      title: "Locked-down servers",
      text: "Your browser never talks to our VPN servers' management API. Only predefined operations exist: create, renew and delete an account.",
    },
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "About", href: "/about" },
        ]}
        icon={<InfoIcon />}
        eyebrow="About us"
        title={`About ${settings.siteName}`}
        description={settings.tagline || "Private tunnels, provisioned in seconds."}
      >
        {stats ? (
          <>
            <HeroChip icon={<ServerIcon />}>{formatCount(stats.serversOnline)} servers online</HeroChip>
            <HeroChip icon={<GlobeIcon />}>{formatCount(stats.countries)} countries</HeroChip>
            <HeroChip icon={<UserRoundIcon />}>{formatCount(stats.accountsTotal)} accounts created</HeroChip>
          </>
        ) : (
          <HeroChip icon={<ServerIcon />}>{protocols.length} protocols</HeroChip>
        )}
      </PageHeader>

      <Container className="pt-4">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading align="start" eyebrow="What we do" title="Free tunnels without the hassle" className="mb-5 sm:mb-6" />
            <div className="space-y-4 text-pretty text-muted-foreground">
              <p>
                {settings.siteName} hands out free SSH, V2Ray, Trojan, Hysteria and UDP accounts on servers we run ourselves. Pick a protocol and a
                location, choose how long you need the account, and it is created on the server within seconds.
              </p>
              <p>
                Every server shows its live status, ping and the number of free slots left, so you always know where an account will work. Slots refill
                at fixed times every day; existing accounts keep working until they expire.
              </p>
              <p>
                We built the site around one rule: <strong className="font-semibold text-foreground">keep as little as possible</strong>. Credentials
                are shown once, raw IP addresses are never stored and accounts are removed automatically when they expire.
              </p>
            </div>
          </div>
          <div className="relative rounded-[2rem] border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex -space-x-3">
              {avatars.map((a) => (
                <UserAvatar key={a.seed} src={a.src} size={56} className="ring-4 ring-card" />
              ))}
            </div>
            <h3 className="mt-5 text-lg font-semibold">A face for every account</h3>
            <p className="mt-1.5 text-sm text-pretty text-muted-foreground">
              Each account gets its own avatar, generated on our server from a random seed. It makes your accounts easy to tell apart under My accounts
              and never involves an upload or a third-party request.
            </p>
            <div className="mt-6 grid grid-cols-3 gap-2 text-center">
              {[
                { k: "Protocols", v: protocols.length },
                { k: "Servers", v: stats?.serversOnline ?? protocols.reduce((n, p) => Math.max(n, p.serverCount), 0) },
                { k: "Today", v: stats?.accountsToday ?? 0 },
              ].map((x) => (
                <div key={x.k} className="rounded-2xl bg-muted/60 px-2 py-3">
                  <p className="text-xl font-bold tabular-nums">{formatCount(x.v)}</p>
                  <p className="text-[11px] text-muted-foreground">{x.k}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Container>

      <section className="mt-20 sm:mt-28" aria-labelledby="values-title">
        <Container>
          <SectionHeading id="values-title" eyebrow={<><HeartHandshakeIcon /> Our principles</>} title="Private by design" />
          <div className="grid gap-4 sm:grid-cols-2">
            {values.map((v) => (
              <div key={v.title} className="flex gap-4 rounded-3xl border bg-card p-6 shadow-sm">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent text-primary [&_svg]:size-5">{v.icon}</span>
                <div>
                  <h3 className="font-semibold">{v.title}</h3>
                  <p className="mt-1 text-sm text-pretty text-muted-foreground">{v.text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            The details are in our{" "}
            <Link href="/privacy" className="font-medium text-primary hover:underline">
              privacy policy
            </Link>{" "}
            and{" "}
            <Link href="/acceptable-use" className="font-medium text-primary hover:underline">
              acceptable use policy
            </Link>
            .
          </p>
        </Container>
      </section>

      <Container className="mt-20 sm:mt-28">
        <CtaBand title="Try it now" description="Pick a protocol and have a working account in about a minute.">
          <Link href="/#protocols" className={heroPrimaryButton}>
            <KeyRoundIcon />
            Create free account
          </Link>
          <Link href="/server-status" className={heroSecondaryButton}>
            <ActivityIcon />
            Server status
          </Link>
        </CtaBand>
      </Container>
    </>
  );
}
