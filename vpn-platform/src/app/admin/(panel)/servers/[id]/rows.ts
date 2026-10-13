import type { ServerDetail } from "@/server/servers/queries";
import type { ProtocolSettingRow } from "../protocol-settings-form";

/** Rows for the protocol settings table: every known protocol, detected ones first. */
export function toSettingRows(detail: ServerDetail, newSince?: Date | null): ProtocolSettingRow[] {
  return detail.protocols
    .filter((p) => p.serverProtocolId || p.globallyEnabled)
    .map((p) => ({
      protocolId: p.protocolId,
      name: p.name,
      icon: p.icon,
      globallyEnabled: p.globallyEnabled,
      detected: !!p.detected,
      enabled: !!p.enabled,
      serviceStatus: p.serviceStatus ?? "unknown",
      nodeIdentifier: p.nodeIdentifier,
      ports: (p.ports ?? {}) as Record<string, number[] | string>,
      transports: p.transports ?? [],
      maxAccounts: p.maxAccounts,
      currentAccounts: p.currentAccounts ?? 0,
      isNew: !!(p.detected && !p.enabled && detail.server.lifecycle !== "draft"),
    }))
    .sort((a, b) => Number(b.detected) - Number(a.detected));
}
