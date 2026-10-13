import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Admin, AdminSession } from "@/server/db/schema";
import type { AuditActor } from "@/server/audit";
import { readSessionCookie } from "./cookies";
import { can, type Permission } from "./rbac";
import { validateSessionToken } from "./session";
import { requestContext } from "./request-context";

export interface AdminContext {
  admin: Admin;
  session: AdminSession;
  actor: AuditActor;
}

/** Session lookup, memoised per request. */
export const getSession = cache(async () => validateSessionToken(await readSessionCookie()));

/** For pages and layouts: redirect to login unless fully authenticated (password + MFA if enabled). */
export async function requireAdmin(): Promise<AdminContext> {
  const s = await getSession();
  if (!s) redirect("/admin/login");
  if (s.admin.mfaEnabled && !s.session.mfaVerified) redirect("/admin/login/mfa");
  const ctx = await requestContext();
  return { ...s, actor: { adminId: s.admin.id, email: s.admin.email, ...ctx } };
}

/** For pages: additionally require a permission (renders the 403 page otherwise). */
export async function requirePermission(permission: Permission): Promise<AdminContext> {
  const c = await requireAdmin();
  if (!can(c.admin.role, permission)) redirect("/admin/forbidden");
  return c;
}

export class AuthorizationError extends Error {
  constructor(message = "You do not have permission to perform this action.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

/**
 * For Server Actions and route handlers: never redirect silently on mutations — throw instead.
 * Every action must call this itself; page-level checks do not protect actions.
 */
export async function authorize(permission: Permission): Promise<AdminContext> {
  const s = await getSession();
  if (!s || (s.admin.mfaEnabled && !s.session.mfaVerified)) throw new AuthorizationError("Your session has expired. Please sign in again.");
  if (!can(s.admin.role, permission)) throw new AuthorizationError();
  const ctx = await requestContext();
  return { ...s, actor: { adminId: s.admin.id, email: s.admin.email, ...ctx } };
}
