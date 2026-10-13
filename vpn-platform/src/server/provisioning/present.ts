import type { JsonObject } from "@/server/db/schema";
import { getAdapter } from "./adapters/registry";
import type { PresentedAccount, ProtocolDefinition, ProvisionedAccount } from "./types";

/**
 * Apply the admin's presentation settings (labels, order, visibility) to adapter output.
 * Sensitivity can only be raised by the admin, never lowered below what the adapter declares.
 */
export function presentAccount(
  def: ProtocolDefinition,
  provisioned: ProvisionedAccount,
  server: { id: string; name: string },
): PresentedAccount {
  const defs = def.outputFields.length ? def.outputFields : getAdapter(def.adapterKey).outputFields;
  const fields = defs
    .filter((d) => !d.hidden && provisioned.values[d.key] !== undefined)
    .map((d) => {
      const v = provisioned.values[d.key]!;
      const sensitive = v.sensitive || d.sensitive;
      return {
        key: d.key,
        label: d.label,
        kind: sensitive && d.kind === "text" ? ("secret" as const) : d.kind,
        value: v.value,
        sensitive,
        copyable: d.copyable,
        qr: !!d.qr,
      };
    });
  return {
    protocol: { slug: def.slug, name: def.name },
    server,
    username: provisioned.username,
    expiresAt: provisioned.expiresAt.toISOString(),
    fields,
    artifacts: provisioned.artifacts,
  };
}

/** Non-secret values persisted in vpn_accounts.metadata (shown to admins later). */
export function safeMetadata(def: ProtocolDefinition, provisioned: ProvisionedAccount): JsonObject {
  const adminSensitive = new Set(def.outputFields.filter((d) => d.sensitive).map((d) => d.key));
  const out: JsonObject = {};
  for (const [k, v] of Object.entries(provisioned.values)) {
    if (!v.sensitive && !adminSensitive.has(k)) out[k] = v.value;
  }
  if (provisioned.artifacts.length) out._artifacts = provisioned.artifacts.map((a) => a.label);
  return out;
}
