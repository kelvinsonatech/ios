import { PageHeader } from "@/components/admin/page-header";
import { COUNTRIES } from "@/lib/countries";
import { requirePermission } from "@/server/auth/guards";
import { nodeDrivers } from "@/server/nodes/drivers";
import { createServerAction } from "../actions";
import { AddServerForm } from "../server-form";

export const metadata = { title: "Add server" };

export default async function NewServerPage() {
  await requirePermission("servers:create");
  const drivers = Object.entries(nodeDrivers).map(([key, d]) => ({ key, label: d.label }));
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        back={{ href: "/admin/servers", label: "Servers" }}
        title="Add server"
        description="Prepare the VPS with your installation script first. Then enter its details and connect."
      />
      <AddServerForm action={createServerAction} drivers={drivers} countries={COUNTRIES} />
    </div>
  );
}
