import { PageHeader } from "@/components/admin/page-header";
import { PROTOCOL_ICON_NAMES } from "@/lib/protocol-icons";
import { requirePermission } from "@/server/auth/guards";
import { createProtocolAction } from "../actions";
import { adapterInfos } from "../adapters";
import { ProtocolEditor } from "../protocol-editor";

export const metadata = { title: "New protocol" };

export default async function NewProtocolPage() {
  await requirePermission("protocols:edit");
  const adapters = adapterInfos();
  const generic = adapters.find((a) => a.key === "generic")!;
  return (
    <>
      <PageHeader
        back={{ href: "/admin/protocols", label: "Protocols" }}
        title="New protocol"
        description="Define a protocol your servers can provide. Use an existing adapter, or the generic adapter to map the server's output without code changes."
      />
      <ProtocolEditor
        mode="create"
        isSystem={false}
        canEdit
        icons={PROTOCOL_ICON_NAMES}
        adapters={adapters}
        action={createProtocolAction}
        initial={{
          name: "",
          slug: "",
          description: "",
          icon: "network",
          category: "vpn",
          adapterKey: "generic",
          nodeIdentifiers: [],
          enabled: false,
          displayOrder: 200,
          durationOptions: [3, 7, 14, 30],
          defaultDurationDays: 7,
          maxAccountsPerIpPerDay: 3,
          fields: generic.defaultFields,
          outputFields: [{ key: "host", label: "Host", kind: "text", sensitive: false, copyable: true, path: "host" }],
        }}
      />
    </>
  );
}
