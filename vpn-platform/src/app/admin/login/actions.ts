"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { attemptLogin, completeMfa } from "@/server/auth/login";
import { clearSessionCookie, readSessionCookie, setSessionCookie } from "@/server/auth/cookies";
import { requestContext } from "@/server/auth/request-context";
import { revokeSession, validateSessionToken } from "@/server/auth/session";
import { audit } from "@/server/audit";

const loginSchema = z.object({
  email: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(256),
});

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = loginSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "Enter your email and password." };
  const ctx = await requestContext();
  const result = await attemptLogin({ ...parsed.data, ...ctx });
  if (!result.ok) return { error: result.error };
  await setSessionCookie(result.token);
  redirect(result.mfaRequired ? "/admin/login/mfa" : "/admin");
}

export async function mfaAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const code = String(formData.get("code") ?? "").slice(0, 32);
  const s = await validateSessionToken(await readSessionCookie());
  if (!s) redirect("/admin/login");
  if (s.session.mfaVerified) redirect("/admin");
  const ctx = await requestContext();
  const result = await completeMfa({ admin: s.admin, sessionId: s.session.id, code, ...ctx });
  if (!result.ok) return { error: result.error };
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const s = await validateSessionToken(await readSessionCookie());
  if (s) {
    await revokeSession(s.session.id);
    const ctx = await requestContext();
    await audit({ adminId: s.admin.id, email: s.admin.email, ...ctx }, "auth.logout");
  }
  await clearSessionCookie();
  redirect("/admin/login");
}
