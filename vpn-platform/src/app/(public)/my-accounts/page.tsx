import type { Metadata } from "next";
import { connection } from "next/server";
import { HardDriveIcon, ShieldCheckIcon, TimerIcon, UsersRoundIcon } from "lucide-react";
import { MyAccountsList } from "@/components/public/account/my-accounts-list";
import { HeroChip, PageHeader } from "@/components/public/page-header";
import { Container } from "@/components/public/section";
import { pageMetadata } from "@/lib/seo";
import { loadSettings } from "@/app/(public)/_lib/data";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  const settings = await loadSettings();
  return pageMetadata({
    title: "My accounts",
    description: `The ${settings.siteName} accounts you created on this device, with their avatars and live expiry countdowns.`,
    path: "/my-accounts",
    siteName: settings.siteName,
    // The list lives in each visitor's own browser: nothing here for search engines.
    noIndex: true,
  });
}

/**
 * /my-accounts: accounts created in this browser (non-secret summaries from localStorage, rendered
 * entirely on the client). The server only renders the frame.
 */
export default async function MyAccountsPage() {
  await connection();
  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: "/" }, { label: "My accounts" }]}
        icon={<UsersRoundIcon />}
        eyebrow="This device"
        title="My accounts"
        description="Every account you created in this browser, each with its own avatar and a live countdown to when it expires."
      >
        <HeroChip icon={<HardDriveIcon />}>Saved only in this browser</HeroChip>
        <HeroChip icon={<ShieldCheckIcon />}>No passwords stored</HeroChip>
        <HeroChip icon={<TimerIcon />}>Live expiry countdowns</HeroChip>
      </PageHeader>

      <Container className="pt-2 pb-16 sm:pb-24">
        <MyAccountsList />
      </Container>
    </>
  );
}
