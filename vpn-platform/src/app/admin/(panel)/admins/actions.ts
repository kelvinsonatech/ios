"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors, formToObject, safeAction } from "@/server/action-helpers";
import { authorize } from "@/server/auth/guards";
import { adminRole } from "@/server/db/schema";
import { adminSetPassword, createAdmin, createAdminSchema, resetAdminMfa, setAdminActive, updateAdminRole } from "@/server/admins/service";

export async function createAdminAction(fd: FormData): Promise<ActionState> {
  return safeAction("createAdmin", async () => {
    const { actor } = await authorize("admins:manage");
    const parsed = createAdminSchema.safeParse(formToObject(fd));
    if (!parsed.success) return { error: "Please correct the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
    await createAdmin(parsed.data, actor);
    revalidatePath("/admin/admins");
    return { ok: true, message: `Administrator ${parsed.data.email} created. Share the temporary password securely.` };
  });
}

export async function changeRoleAction(id: string, role: string): Promise<ActionState> {
  return safeAction("changeRole", async () => {
    const { actor } = await authorize("admins:manage");
    await updateAdminRole(z.uuid().parse(id), z.enum(adminRole.enumValues).parse(role), actor);
    revalidatePath("/admin/admins");
    return { ok: true, message: "Role updated. Their sessions were signed out." };
  });
}

export async function setActiveAction(id: string, active: boolean): Promise<ActionState> {
  return safeAction("setActive", async () => {
    const { actor } = await authorize("admins:manage");
    await setAdminActive(z.uuid().parse(id), z.boolean().parse(active), actor);
    revalidatePath("/admin/admins");
    return { ok: true, message: active ? "Administrator activated." : "Administrator deactivated and signed out." };
  });
}

export async function resetMfaAction(id: string): Promise<ActionState> {
  return safeAction("resetMfa", async () => {
    const { actor } = await authorize("admins:manage");
    await resetAdminMfa(z.uuid().parse(id), actor);
    revalidatePath("/admin/admins");
    return { ok: true, message: "Two-factor authentication reset." };
  });
}

export async function setPasswordAction(id: string, password: string): Promise<ActionState> {
  return safeAction("setPassword", async () => {
    const { actor } = await authorize("admins:manage");
    await adminSetPassword(z.uuid().parse(id), String(password ?? ""), actor);
    return { ok: true, message: "Password set. Their existing sessions were signed out." };
  });
}
