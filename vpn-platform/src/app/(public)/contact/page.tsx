import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { ActivityIcon, ArrowRightIcon, BookOpenIcon, FlagIcon, MailIcon, MessageCircleQuestionIcon, SendIcon, ShieldAlertIcon, UserRoundIcon } from "lucide-react";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { Container, SectionHeading } from "@/components/public/section";
import { mailtoHref, pageMetadata, safeHref } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { loadSettings } from "@/app/(public)/_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  const settings = await loadSettings();
  return pageMetadata({
    title: "Contact",
    description: `How to reach the ${settings.siteName} team: report a server problem, ask a question or send feedback.`,
    path: "/contact",
    siteName: settings.siteName,
  });
}

/**
 * Contact options: the channels configured in Admin → Settings (email, Telegram), the report form for
 * server problems and self-help links. Admin-entered values are validated on save and again here.
 */
export default async function ContactPage() {
  await connection();
  const settings = await loadSettings();
  const email = mailtoHref(settings.contact.email);
  const telegram = safeHref(settings.contact.telegramUrl);

  const selfHelp = [
    { href: "/server-status", icon: <ActivityIcon />, title: "Server status", text: "Live status, ping and free slots of every server." },
    { href: "/my-accounts", icon: <UserRoundIcon />, title: "My accounts", text: "Accounts you created on this device and when they expire." },
    { href: "/#faq", icon: <MessageCircleQuestionIcon />, title: "FAQ", text: "Slots, validity, devices and what we store." },
    { href: "/#protocols", icon: <BookOpenIcon />, title: "Setup guides", text: "Each protocol page explains which app to use and how." },
  ];

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Home", href: "/" },
          { label: "Contact", href: "/contact" },
        ]}
        icon={<MailIcon />}
        eyebrow="Support"
        title="Get in touch"
        description="Something not working, or a question we haven't answered yet? Pick the channel that fits best."
      >
        <HeroChip icon={<FlagIcon />}>Server problems: use the report form</HeroChip>
      </PageHeader>

      <Container className="pt-4">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <ContactCard
            icon={<FlagIcon />}
            title="Report a problem"
            text="A server is down, slow or refuses your account? Tell us which one: reports go straight to the admin queue."
            highlight
          >
            <Link href="/report" className={cardButton(true)}>
              Open the report form
              <ArrowRightIcon />
            </Link>
          </ContactCard>

          {email ? (
            <ContactCard icon={<MailIcon />} title="Email" text="Questions, feedback or anything else. We usually reply within a day or two.">
              <a href={email} className={cardButton(false)}>
                <span className="truncate font-mono text-[0.8rem]">{settings.contact.email}</span>
              </a>
            </ContactCard>
          ) : null}

          {telegram ? (
            <ContactCard icon={<SendIcon />} title="Telegram" text="Join the channel for announcements, maintenance notices and quick help.">
              <a href={telegram} target="_blank" rel="noopener noreferrer" className={cardButton(false)}>
                Open Telegram
                <ArrowRightIcon />
              </a>
            </ContactCard>
          ) : null}

          {!email && !telegram ? (
            <ContactCard
              icon={<MessageCircleQuestionIcon />}
              title="Questions and feedback"
              text="Use the report form and choose “Other”: describe your question and, if you want an answer, leave an email address."
            >
              <Link href="/report" className={cardButton(false)}>
                Send a message
                <ArrowRightIcon />
              </Link>
            </ContactCard>
          ) : null}
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-2xl border bg-card p-4 text-sm text-muted-foreground shadow-sm sm:p-5">
          <ShieldAlertIcon className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <p className="text-pretty">
            <strong className="font-semibold text-foreground">Never send us your password, keys or config.</strong> We will never ask for them, and
            we cannot see them either: account details are shown to you once and are not stored on our side.
          </p>
        </div>
      </Container>

      <section className="mt-20 sm:mt-28" aria-labelledby="self-help-title">
        <Container>
          <SectionHeading id="self-help-title" eyebrow="Self-help" title="Maybe it's already answered" />
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {selfHelp.map((s) => (
              <li key={s.href}>
                <Link
                  href={s.href}
                  className="group flex h-full flex-col rounded-3xl border bg-card p-5 shadow-sm transition-all duration-300 outline-none hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/10 focus-visible:ring-[3px] focus-visible:ring-ring/50 motion-reduce:hover:translate-y-0"
                >
                  <span className="flex size-11 items-center justify-center rounded-2xl bg-accent text-primary [&_svg]:size-5">{s.icon}</span>
                  <span className="mt-4 flex items-center gap-1.5 font-semibold">
                    {s.title}
                    <ArrowRightIcon className="size-4 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-primary" aria-hidden />
                  </span>
                  <span className="mt-1 text-sm text-pretty text-muted-foreground">{s.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Container>
      </section>
    </>
  );
}

const cardButton = (primary: boolean) =>
  cn(
    "inline-flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&_svg]:size-4 [&_svg]:shrink-0",
    primary ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90" : "border bg-background hover:border-primary/40 hover:text-primary",
  );

function ContactCard({
  icon,
  title,
  text,
  highlight,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("relative flex flex-col overflow-hidden rounded-3xl border bg-card p-6 shadow-sm", highlight && "border-primary/30 shadow-md shadow-primary/10")}>
      {highlight ? <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-accent/80 to-transparent" /> : null}
      <span className="relative flex size-12 items-center justify-center rounded-2xl bg-accent text-primary ring-1 ring-primary/10 [&_svg]:size-6">{icon}</span>
      <h2 className="relative mt-5 text-lg font-semibold tracking-tight">{title}</h2>
      <p className="relative mt-1.5 flex-1 text-sm text-pretty text-muted-foreground">{text}</p>
      <div className="relative mt-6">{children}</div>
    </div>
  );
}
