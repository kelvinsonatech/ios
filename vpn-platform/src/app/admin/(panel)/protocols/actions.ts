"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { safeAction } from "@/server/action-helpers";
import { authorize } from "@/server/auth/guards";
import { UserFacingError } from "@/server/errors";
import { createProtocol, setProtocolEnabled, updateProtocol } from "@/server/protocols/service";

function parsePayload(json: string): unknown {
  if (typeof json !== "string" || json.length > 200_000) throw new UserFacingError("Invalid payload.");
  try {
    return JSON.parse(json);
  } catch {
    throw new UserFacingError("Invalid payload.");
  }
}

export async function saveProtocolAction(id: string, json: string): Promise<ActionState> {
  return safeAction("saveProtocol", async () => {
    const { actor } = await authorize("protocols:edit");
    const protocolId = z.uuid().parse(id);
    await updateProtocol(protocolId, parsePayload(json), actor);
    revalidatePath("/admin/protocols", "layout");
    return { ok: true, message: "Protocol saved." };
  });
}

export async function createProtocolAction(json: string): Promise<ActionState> {
  let id: string | undefined;
  const result = await safeAction("createProtocol", async () => {
    const { actor } = await authorize("protocols:edit");
    id = await createProtocol(parsePayload(json), actor);
    revalidatePath("/admin/protocols");
    return { ok: true };
  });
  if (id) redirect(`/admin/protocols/${id}`);
  return result;
}

export async function toggleProtocolAction(id: string, enabled: boolean): Promise<ActionState> {
  return safeAction("toggleProtocol", async () => {
    const { actor } = await authorize("protocols:edit");
    await setProtocolEnabled(z.uuid().parse(id), z.boolean().parse(enabled), actor);
    revalidatePath("/admin/protocols");
    return { ok: true, message: enabled ? "Protocol enabled." : "Protocol disabled. Its pages and servers are hidden." };
  });
}
