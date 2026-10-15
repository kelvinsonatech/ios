import type { Metadata } from "next";
import { connection } from "next/server";
import { ActivityIcon, RefreshCwIcon, ServerIcon, WifiIcon } from "lucide-react";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { Container } from "@/components/public/section";
import { StatusBoard } from "@/components/public/status/status-board";
import { pageMetadata } from "@/lib/seo";
import { loadSettings, loadStatus, resetSchedule } from "@/app/(public)/_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const settings = await loadSettings();
  return pageMetadata({
    title: "Server status",
    description: `Live status of every ${settings.siteName} server: online or offline, response time, last check and remaining slots. Updates every 30 seconds.`,
    path: "/server-status",
    siteName: settings.siteName,
  });
}

/** /server-status: live health and capacity of every published server, grouped by protocol. */
export default async function ServerStatusPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const protocol = typeof sp.protocol === "string" && /^[a-z0-9-]{1,64}$/.test(sp.protocol) ? sp.protocol : null;
  const [status, settings] = await Promise.all([loadStatus(), loadSettings()]);
  const schedule = resetSchedule(settings.quota);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "Server status" }]}
        icon={<ActivityIcon />}
        eyebrow="Live"
        title="Server status"
        description="Every server we run, checked around the clock: whether it's online, how fast it answers and how many slots are left."
      >
        {status ? (
          <>
            <HeroChip icon={<ServerIcon />}>
              {status.totals.servers} {status.totals.servers === 1 ? "server" : "servers"}
            </HeroChip>
            <HeroChip icon={<WifiIcon />}>{status.totals.online} online</HeroChip>
          </>
        ) : null}
        <HeroChip icon={<RefreshCwIcon />}>Auto-refresh every 30 s</HeroChip>
      </PageHeader>

      <Container className="pt-2 pb-16 sm:pb-24">
        <StatusBoard
          initial={status}
          initialProtocol={protocol}
          resetLabel={`${schedule.timesLabel} (${schedule.zoneLabel})`}
          nextResetAt={schedule.nextResetAt}
        />
      </Container>
    </>
  );
}
