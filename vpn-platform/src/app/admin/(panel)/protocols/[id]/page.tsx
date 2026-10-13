import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/admin/page-header";
import { PROTOCOL_ICON_NAMES } from "@/lib/protocol-icons";
import { requirePermission } from "@/server/auth/guards";
import { can } from "@/server/auth/rbac";
import { getProtocolWithFields } from "@/server/protocols/service";
import { saveProtocolAction } from "../actions";
import { adapterInfos } from "../adapters";
import { ProtocolEditor } from "../protocol-editor";

export const metadata = { title: "Edit protocol" };

export default async function EditProtocolPage({ params }: { params: Promise<{ id: string }> }) {
  const { admin } = await requirePermission("protocols:view");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const loaded = await getProtocolWithFields({ id });
  if (!loaded) notFound();
  const { protocol: p, fields } = loaded;
  return (
    <>
      <PageHeader back={{ href: "/admin/protocols", label: "Protocols" }} title={p.name}>
        <div className="mt-2 flex gap-2">
          <Badge variant="secondary" className="font-mono">
            /{p.slug}
          </Badge>
          {p.isSystem ? <Badge variant="muted">Built-in</Badge> : <Badge variant="info">Custom</Badge>}
          {!p.enabled ? <Badge variant="warning">Disabled</Badge> : null}
        </div>
      </PageHeader>
      <ProtocolEditor
        mode="edit"
        isSystem={p.isSystem}
        canEdit={can(admin.role, "protocols:edit")}
        icons={PROTOCOL_ICON_NAMES}
        adapters={adapterInfos()}
        action={saveProtocolAction.bind(null, p.id)}
        initial={{
          name: p.name,
          slug: p.slug,
          description: p.description,
          icon: p.icon,
          category: p.category as "ssh" | "v2ray" | "vpn" | "proxy",
          adapterKey: p.adapterKey,
          nodeIdentifiers: p.nodeIdentifiers,
          enabled: p.enabled,
          displayOrder: p.displayOrder,
          durationOptions: p.durationOptions,
          defaultDurationDays: p.defaultDurationDays,
          maxAccountsPerIpPerDay: p.maxAccountsPerIpPerDay,
          outputFields: p.outputFields,
          fields: fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            required: f.required,
            placeholder: f.placeholder,
            helpText: f.helpText,
            options: f.options,
            validation: f.validation,
            defaultValue: f.defaultValue,
          })),
        }}
      />
    </>
  );
}
