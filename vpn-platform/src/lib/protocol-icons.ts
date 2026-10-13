/** Icon names an administrator can choose for a protocol (lucide-react). */
export const PROTOCOL_ICON_NAMES = [
  "terminal",
  "lock",
  "globe",
  "radar",
  "zap",
  "shield",
  "shield-check",
  "eye-off",
  "waypoints",
  "route",
  "swords",
  "rocket",
  "network",
  "key-round",
  "wifi",
  "cloud",
  "radio",
  "cable",
  "satellite",
  "server",
] as const;

export type ProtocolIconName = (typeof PROTOCOL_ICON_NAMES)[number];
