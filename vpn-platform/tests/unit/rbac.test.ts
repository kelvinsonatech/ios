import { describe, expect, it } from "vitest";
import { can, PERMISSIONS, ROLE_PERMISSIONS } from "@/server/auth/rbac";

describe("role permissions", () => {
  it("gives super admins everything", () => {
    for (const p of PERMISSIONS) expect(can("super_admin", p)).toBe(true);
  });
  it("keeps administrator management with super admins only", () => {
    expect(can("administrator", "admins:manage")).toBe(false);
    expect(can("server_manager", "admins:manage")).toBe(false);
    expect(can("support", "admins:manage")).toBe(false);
  });
  it("lets server managers operate but not delete servers or edit protocols", () => {
    expect(can("server_manager", "servers:create")).toBe(true);
    expect(can("server_manager", "servers:operate")).toBe(true);
    expect(can("server_manager", "servers:delete")).toBe(false);
    expect(can("server_manager", "protocols:edit")).toBe(false);
  });
  it("lets support manage accounts but not servers", () => {
    expect(can("support", "accounts:manage")).toBe(true);
    expect(can("support", "servers:edit")).toBe(false);
    expect(can("support", "audit:view")).toBe(false);
  });
  it("keeps site settings with super admins and administrators", () => {
    expect(can("super_admin", "settings:manage")).toBe(true);
    expect(can("administrator", "settings:manage")).toBe(true);
    expect(can("server_manager", "settings:manage")).toBe(false);
    expect(can("support", "settings:manage")).toBe(false);
  });
  it("lets every role read and handle problem reports", () => {
    for (const role of Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]) {
      expect(can(role, "reports:view")).toBe(true);
      expect(can(role, "reports:manage")).toBe(true);
    }
  });
  it("only grants known permissions", () => {
    for (const perms of Object.values(ROLE_PERMISSIONS)) for (const p of perms) expect(PERMISSIONS).toContain(p);
  });
});
