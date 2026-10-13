import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { RelativeTime } from "@/components/admin/relative-time";
import { requireAdmin } from "@/server/auth/guards";
import { ROLE_LABELS } from "@/server/auth/rbac";
import { listOwnSessions } from "@/server/admins/service";
import { ChangePasswordForm, MfaPanel, RevokeSessionButton } from "./account-forms";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const { admin, session } = await requireAdmin();
  const sessions = await listOwnSessions(admin.id);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="My account" description={`${admin.email} · ${ROLE_LABELS[admin.role]}`} />
      <div className="grid gap-6">
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
              <div key={s.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{s.userAgent ?? "Unknown device"}</p>
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
