import Link from "next/link";
import { PaletteIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { RelativeTime } from "@/components/admin/relative-time";
import { UserAvatar } from "@/components/user-avatar";
import { AVATAR_STYLES } from "@/lib/avatar-styles";
import { requireAdmin } from "@/server/auth/guards";
import { can, ROLE_LABELS } from "@/server/auth/rbac";
import { listOwnSessions } from "@/server/admins/service";
import { adminAvatar } from "@/server/avatar";
import { getSiteSettings } from "@/server/settings/service";
import { ChangePasswordForm, MfaPanel, RevokeSessionButton } from "./account-forms";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const { admin, session } = await requireAdmin();
  const [sessions, settings] = await Promise.all([listOwnSessions(admin.id), getSiteSettings()]);
  const style = AVATAR_STYLES[settings.avatarStyle];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My account" description="Your sign-in, two-factor authentication and sessions." />
      <div className="grid gap-6">
        <Card className="overflow-hidden py-0">
          <div className="h-16 bg-linear-to-r from-primary/25 via-accent to-info-soft" aria-hidden />
          <CardContent className="-mt-10 flex flex-col gap-4 pb-5 sm:flex-row sm:items-start">
            <UserAvatar src={adminAvatar(admin.id, settings.avatarStyle)} size={88} className="bg-card ring-4 ring-card" />
            <div className="grid min-w-0 flex-1 gap-1 sm:pt-12">
              <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
                {admin.name}
                <Badge variant={admin.role === "super_admin" ? "default" : "secondary"}>{ROLE_LABELS[admin.role]}</Badge>
              </h2>
              <p className="truncate text-sm text-muted-foreground">{admin.email}</p>
              <p className="text-xs text-muted-foreground">
                Signed in <RelativeTime date={admin.lastLoginAt} /> · member since <RelativeTime date={admin.createdAt} />
              </p>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:shrink-0 sm:pt-14 sm:whitespace-nowrap">
              <PaletteIcon className="size-3.5 shrink-0" />
              <span>
                Avatar style: {style.label}.{" "}
                {can(admin.role, "settings:manage") ? (
                  <Link href="/admin/settings#avatars" className="text-primary underline underline-offset-4">
                    Change for everyone
                  </Link>
                ) : (
                  "Generated from your account."
                )}
              </span>
            </p>
          </CardContent>
        </Card>
        <Card id="mfa">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Two-factor authentication {admin.mfaEnabled ? <Badge variant="success">On</Badge> : <Badge variant="warning">Off</Badge>}
            </CardTitle>
            <CardDescription>A time-based code from your phone is required at sign-in.</CardDescription>
          </CardHeader>
          <CardContent>
            <MfaPanel enabled={admin.mfaEnabled} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Last changed <RelativeTime date={admin.passwordChangedAt} />.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Active sessions</CardTitle>
            <CardDescription>Sessions expire after inactivity and always after a fixed lifetime.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {sessions.map((s) => (
              <div key={s.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="line-clamp-2 [overflow-wrap:anywhere]" title={s.userAgent ?? undefined}>
                    {s.userAgent ?? "Unknown device"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.ip ?? "unknown IP"} · active <RelativeTime date={s.lastSeenAt} />
                  </p>
                </div>
                {s.id === session.id ? <Badge variant="info">This device</Badge> : <RevokeSessionButton id={s.id} />}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
