import type { SiteSettings } from "@/lib/site-settings";
import { formatLocalTime, quotaWindow } from "@/server/provisioning/quota";
import type { ServerDetail } from "@/server/servers/queries";
import type { ProtocolSettingRow } from "../protocol-settings-form";
import { formatCountdown } from "../../settings/schedule";

/**
 * Rows for the protocol settings table: every known protocol, detected ones first. Quota usage is
 * reported for the current reset window only (a row whose window started earlier has used 0 —
 * the lazy reset the provisioning pipeline applies too).
 */
export function toSettingRows(detail: ServerDetail, quota: SiteSettings["quota"], now = new Date()): ProtocolSettingRow[] {
  const window = quotaWindow(now, quota.resetTimes, quota.timezone);
  const resetLabel = `resets ${formatLocalTime(window.end, quota.timezone)} (in ${formatCountdown(window.end.getTime() - now.getTime())})`;
  return detail.protocols
    .filter((p) => p.serverProtocolId || p.globallyEnabled)
    .map((p) => {
      const inWindow = !!p.quotaWindowStart && p.quotaWindowStart.getTime() === window.start.getTime();
      return {
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
        quotaLimit: p.quotaLimit ?? null,
        quotaUsed: inWindow ? (p.quotaUsed ?? 0) : 0,
        quotaResetLabel: resetLabel,
        isNew: !!(p.detected && !p.enabled && detail.server.lifecycle !== "draft"),
      };
    })
    .sort((a, b) => Number(b.detected) - Number(a.detected));
}
