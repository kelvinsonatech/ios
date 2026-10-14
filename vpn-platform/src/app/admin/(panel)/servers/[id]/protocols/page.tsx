import { notFound } from "next/navigation";
import { PageHeader } from "@/components/admin/page-header";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { getServerDetail } from "@/server/servers/queries";
import { getSiteSettings } from "@/server/settings/service";
import { saveServerProtocolsAction } from "../../actions";
import { SyncButton } from "../../operation-buttons";
import { ProtocolSettingsForm } from "../../protocol-settings-form";
import { toSettingRows } from "../rows";

export const metadata = { title: "Server protocols" };

export default async function ServerProtocolsPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requirePermission("servers:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [detail, settings] = await Promise.all([getServerDetail(id), getSiteSettings()]);
  if (!detail) notFound();
  const { server } = detail;
  return (
    <>
      <PageHeader
        back={{ href: `/admin/servers/${server.id}`, label: server.name }}
        title="Protocols"
        description="Enable or disable individual protocols without removing the server, and set how many accounts each one accepts. Only protocols detected on the server can be enabled; sync after installing something new."
        actions={can(admin.role, "servers:operate") ? <SyncButton serverId={server.id} /> : null}
      />
      <ProtocolSettingsForm rows={toSettingRows(detail, settings.quota)} action={saveServerProtocolsAction.bind(null, server.id)} canEdit={can(admin.role, "servers:edit")} />
    </>
  );
}
