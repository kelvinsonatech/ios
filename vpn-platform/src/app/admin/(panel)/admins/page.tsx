import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/admin/page-header";
import { RelativeTime } from "@/components/admin/relative-time";
import { UserAvatar } from "@/components/user-avatar";
import { requirePermission } from "@/server/auth/guards";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/server/auth/rbac";
import { listAdmins } from "@/server/admins/service";
import { adminAvatar } from "@/server/avatar";
import { getSiteSettings } from "@/server/settings/service";
import { AdminRowMenu, CreateAdminForm } from "./admin-forms";

export const metadata = { title: "Administrators" };

export default async function AdminsPage() {
  const { admin: me } = await requirePermission("admins:manage");
  const [rows, settings] = await Promise.all([listAdmins(), getSiteSettings()]);
  return (
    <>
      <PageHeader title="Administrators" description="Who can access the admin panel, and what they can do." />
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="min-w-0 py-0 lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Administrator</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="hidden sm:table-cell">2FA</TableHead>
                <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
                <TableHead className="w-10">
                  <span className="sr-only">Avatar</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((a) => (
                <TableRow key={a.id} className={!a.isActive ? "opacity-60" : undefined}>
                  <TableCell>
                    <span className="flex items-center gap-3">
                      <UserAvatar src={adminAvatar(a.id, settings.avatarStyle)} size={40} />
                      <span className="grid min-w-0">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="truncate">{a.name}</span>
                          {a.id === me.id ? <Badge variant="info">You</Badge> : null}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{a.email}</span>
                        <span className={`text-xs sm:hidden ${a.mfaEnabled ? "text-success" : "text-warning-strong"}`}>2FA {a.mfaEnabled ? "on" : "off"}</span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={a.role === "super_admin" ? "default" : "secondary"}>{ROLE_LABELS[a.role]}</Badge>
                    {!a.isActive ? <Badge variant="muted" className="ml-1">Inactive</Badge> : null}
                    {a.lockedUntil && a.lockedUntil > new Date() ? <Badge variant="warning" className="ml-1">Locked</Badge> : null}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{a.mfaEnabled ? <Badge variant="success">On</Badge> : <Badge variant="warning">Off</Badge>}</TableCell>
                  <TableCell className="hidden text-sm md:table-cell">
                    <RelativeTime date={a.lastLoginAt} />
                  </TableCell>
                  <TableCell>
                    <AdminRowMenu id={a.id} email={a.email} role={a.role} active={a.isActive} isSelf={a.id === me.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>Roles</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => (
              <div key={r}>
                <p className="font-medium">{ROLE_LABELS[r]}</p>
                <p className="text-xs text-muted-foreground">{ROLE_PERMISSIONS[r].join(", ")}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Add administrator</CardTitle>
            <CardDescription>Give each person their own account — never share credentials.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateAdminForm />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
