import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { AdminNav, type NavKey } from "@/components/admin/nav";
import { MobileNav } from "@/components/admin/mobile-nav";
import { UserMenu } from "@/components/admin/user-menu";
import { requireAdmin } from "@/server/auth/guards";
import { can, ROLE_LABELS } from "@/server/auth/rbac";
import { logoutAction } from "../login/actions";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { admin } = await requireAdmin();
  const allowed: NavKey[] = [];
  if (can(admin.role, "dashboard:view")) allowed.push("dashboard");
  if (can(admin.role, "servers:view")) allowed.push("servers");
  if (can(admin.role, "protocols:view")) allowed.push("protocols");
  if (can(admin.role, "accounts:view")) allowed.push("accounts");
  if (can(admin.role, "logs:view")) allowed.push("logs");
  if (can(admin.role, "admins:manage")) allowed.push("admins");

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <Link href="/admin" className="px-1.5">
          <Brand suffix="Admin" />
        </Link>
        <AdminNav allowed={allowed} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6">
          <MobileNav allowed={allowed} />
          <Link href="/admin" className="lg:hidden">
            <Brand />
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu name={admin.name} email={admin.email} roleLabel={ROLE_LABELS[admin.role]} logout={logoutAction} />
          </div>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
