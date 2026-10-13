import type { AdminRole } from "@/server/db/schema";

export const PERMISSIONS = [
  "dashboard:view",
  "servers:view",
  "servers:create",
  "servers:edit",
  "servers:operate",
  "servers:delete",
  "protocols:view",
  "protocols:edit",
  "accounts:view",
  "accounts:manage",
  "logs:view",
  "audit:view",
  "admins:manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role → permission matrix.
 *  - Super Admin:    everything, including administrator management.
 *  - Administrator:  everything except managing administrators.
 *  - Server Manager: add/edit/operate servers and their protocols; read accounts and logs.
 *  - Support:        read servers/protocols, manage accounts (revoke/renew), read logs.
 */
export const ROLE_PERMISSIONS: Record<AdminRole, readonly Permission[]> = {
  super_admin: PERMISSIONS,
  administrator: PERMISSIONS.filter((p) => p !== "admins:manage"),
  server_manager: [
    "dashboard:view",
    "servers:view",
    "servers:create",
    "servers:edit",
    "servers:operate",
    "protocols:view",
    "accounts:view",
    "logs:view",
  ],
  support: ["dashboard:view", "servers:view", "protocols:view", "accounts:view", "accounts:manage", "logs:view"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: "Super Admin",
  administrator: "Administrator",
  server_manager: "Server Manager",
  support: "Support",
};

export function can(role: AdminRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}
