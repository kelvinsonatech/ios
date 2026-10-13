import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/admin/page-header";
import { COUNTRIES } from "@/lib/countries";
import { requirePermission } from "@/server/auth/guards";
import { nodeDrivers } from "@/server/nodes/drivers";
import { getServerDetail } from "@/server/servers/queries";
import { updateServerConnectionAction, updateServerDetailsAction } from "../../actions";
import { EditConnectionForm, EditDetailsForm } from "../../server-form";
import { TestConnectionButton } from "../../operation-buttons";

export const metadata = { title: "Edit server" };

export default async function EditServerPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("servers:edit");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const detail = await getServerDetail(id);
  if (!detail) notFound();
  const { server, credential } = detail;
  const drivers = Object.entries(nodeDrivers).map(([key, d]) => ({ key, label: d.label }));

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={{ href: `/admin/servers/${server.id}`, label: server.name }} title={`Edit ${server.name}`} actions={<TestConnectionButton serverId={server.id} />} />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Server details</CardTitle>
          </CardHeader>
          <CardContent>
            <EditDetailsForm
              action={updateServerDetailsAction.bind(null, server.id)}
              drivers={drivers}
              countries={COUNTRIES}
              values={{
                name: server.name,
                countryCode: server.countryCode,
                city: server.city,
                region: server.region,
                provider: server.provider,
                hostname: server.hostname,
                ipAddress: server.ipAddress,
                apiPort: server.apiPort,
                apiBasePath: server.apiBasePath,
                maxAccounts: server.maxAccounts,
                notes: server.notes,
                driver: server.driver,
              }}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Connection & credentials</CardTitle>
            <CardDescription>
              The current secret is never displayed.{" "}
              {credential ? `Credential version ${credential.version}${credential.rotatedAt ? `, rotated ${credential.rotatedAt.toISOString().slice(0, 10)}` : ""}.` : "No credential stored."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EditConnectionForm
              action={updateServerConnectionAction.bind(null, server.id)}
              values={{
                authMethod: credential?.authMethod,
                keyId: credential?.keyId,
                tlsMode: credential?.tlsMode,
                tlsServerName: credential?.tlsServerName,
                caCertificatePem: credential?.caCertificatePem,
                pinnedFingerprintSha256: credential?.pinnedFingerprintSha256,
                clientCertificatePem: credential?.clientCertificatePem,
                hasClientKey: credential?.hasClientKey,
              }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
