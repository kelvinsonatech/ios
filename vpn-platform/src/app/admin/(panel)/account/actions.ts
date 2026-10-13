"use server";

import QRCode from "qrcode";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { safeAction } from "@/server/action-helpers";
import { authorize } from "@/server/auth/guards";
import {
  beginMfaSetup,
  changeOwnPassword,
  confirmMfaSetup,
  disableOwnMfa,
  regenerateRecoveryCodes,
  revokeOwnSession,
} from "@/server/admins/service";
import { UserFacingError } from "@/server/errors";

export async function changePasswordAction(fd: FormData): Promise<ActionState> {
  return safeAction("changePassword", async () => {
    const { admin, session, actor } = await authorize("dashboard:view");
    const current = String(fd.get("current") ?? "");
    const next = String(fd.get("next") ?? "");
    if (next !== String(fd.get("confirm") ?? "")) throw new UserFacingError("The new passwords do not match.");
    await changeOwnPassword(admin, session.id, current, next, actor);
    revalidatePath("/admin/account");
    return { ok: true, message: "Password changed. Other sessions were signed out." };
  });
}

export async function beginMfaAction(): Promise<ActionState> {
  return safeAction("beginMfa", async () => {
    const { admin } = await authorize("dashboard:view");
    const { secret, uri } = await beginMfaSetup(admin);
    const qr = await QRCode.toDataURL(uri, { margin: 1, width: 220, errorCorrectionLevel: "M" });
    return { ok: true, data: { secret, qr } };
  });
}

export async function confirmMfaAction(code: string): Promise<ActionState> {
  return safeAction("confirmMfa", async () => {
    const { admin, actor } = await authorize("dashboard:view");
    const codes = await confirmMfaSetup(admin, z.string().max(16).parse(code), actor);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Two-factor authentication enabled.", data: { recoveryCodes: codes } };
  });
}

export async function disableMfaAction(password: string): Promise<ActionState> {
  return safeAction("disableMfa", async () => {
    const { admin, actor } = await authorize("dashboard:view");
    await disableOwnMfa(admin, String(password ?? ""), actor);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Two-factor authentication disabled." };
  });
}

export async function regenerateCodesAction(password: string): Promise<ActionState> {
  return safeAction("regenerateCodes", async () => {
    const { admin, actor } = await authorize("dashboard:view");
    const codes = await regenerateRecoveryCodes(admin, String(password ?? ""), actor);
    return { ok: true, message: "New recovery codes generated. The old ones no longer work.", data: { recoveryCodes: codes } };
  });
}

export async function revokeSessionAction(sessionId: string): Promise<ActionState> {
  return safeAction("revokeSession", async () => {
    const { admin, session, actor } = await authorize("dashboard:view");
    const id = z.uuid().parse(sessionId);
    if (id === session.id) throw new UserFacingError("Use Sign out to end the current session.");
    await revokeOwnSession(admin.id, id, actor);
    revalidatePath("/admin/account");
    return { ok: true, message: "Session signed out." };
  });
}
