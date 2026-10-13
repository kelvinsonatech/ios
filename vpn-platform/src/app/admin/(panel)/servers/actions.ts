"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors, formToObject, safeAction } from "@/server/action-helpers";
import { authorize } from "@/server/auth/guards";
import { UserFacingError } from "@/server/errors";
import {
  createServerDraft,
  deleteServer,
  publishServer,
  setServerLifecycle,
  updateServerConnection,
  updateServerDetails,
  updateServerProtocols,
} from "@/server/servers/service";
import { restartProvisioningService, syncServer, testConnection } from "@/server/servers/sync";
import { connectionSchema, protocolSettingsSchema, serverDetailsSchema } from "@/server/servers/validation";

const idSchema = z.uuid();

function parseId(id: unknown): string {
  const r = idSchema.safeParse(id);
  if (!r.success) throw new UserFacingError("Invalid server id.");
  return r.data;
}

function parseServerForm(fd: FormData, secretRequired: boolean) {
  const raw = formToObject(fd);
  const details = serverDetailsSchema.safeParse(raw);
  const conn = connectionSchema({ secretRequired }).safeParse(raw);
  return { details, conn };
}

function refresh(id?: string) {
  revalidatePath("/admin/servers");
  revalidatePath("/admin");
  if (id) revalidatePath(`/admin/servers/${id}`, "layout");
}

/** Add Server → CONNECT SERVER: save as draft, then verify and detect protocols. */
export async function createServerAction(fd: FormData): Promise<ActionState> {
  let createdId: string | undefined;
  const result = await safeAction("createServer", async () => {
    const { actor } = await authorize("servers:create");
    const { details, conn } = parseServerForm(fd, true);
    if (!details.success || !conn.success) {
      return {
        error: "Please correct the highlighted fields.",
        fieldErrors: { ...(details.success ? {} : fieldErrors(details.error)), ...(conn.success ? {} : fieldErrors(conn.error)) },
      };
    }
    const server = await createServerDraft(details.data, conn.data, actor);
    createdId = server.id;
    await syncServer(server.id, actor);
    refresh(server.id);
    return { ok: true };
  });
  if (createdId) redirect(`/admin/servers/${createdId}/setup`);
  return result;
}

export async function updateServerDetailsAction(id: string, fd: FormData): Promise<ActionState> {
  return safeAction("updateServerDetails", async () => {
    const { actor } = await authorize("servers:edit");
    const serverId = parseId(id);
    const details = serverDetailsSchema.safeParse(formToObject(fd));
    if (!details.success) return { error: "Please correct the highlighted fields.", fieldErrors: fieldErrors(details.error) };
    await updateServerDetails(serverId, details.data, actor);
    refresh(serverId);
    return { ok: true, message: "Server details saved." };
  });
}

export async function updateServerConnectionAction(id: string, fd: FormData): Promise<ActionState> {
  return safeAction("updateServerConnection", async () => {
    const { actor } = await authorize("servers:edit");
    const serverId = parseId(id);
    const conn = connectionSchema({ secretRequired: false }).safeParse(formToObject(fd));
    if (!conn.success) return { error: "Please correct the highlighted fields.", fieldErrors: fieldErrors(conn.error) };
    await updateServerConnection(serverId, conn.data, actor);
    refresh(serverId);
    return { ok: true, message: conn.data.apiSecret ? "Connection settings saved and secret rotated." : "Connection settings saved." };
  });
}

export async function testConnectionAction(id: string): Promise<ActionState> {
  return safeAction("testConnection", async () => {
    const { actor } = await authorize("servers:operate");
    const serverId = parseId(id);
    const check = await testConnection(serverId, actor);
    refresh(serverId);
    return {
      ok: check.ok,
      data: { check: JSON.parse(JSON.stringify(check)) },
      ...(check.ok ? {} : { error: check.error?.message ?? "Connection failed." }),
    };
  });
}

export async function syncServerAction(id: string): Promise<ActionState> {
  return safeAction("syncServer", async () => {
    const { actor } = await authorize("servers:operate");
    const serverId = parseId(id);
    const result = await syncServer(serverId, actor);
    refresh(serverId);
    if (!result.ok) return { error: result.error?.message ?? "Synchronisation failed.", data: { sync: JSON.parse(JSON.stringify(result)) } };
    const summary = [
      `${result.protocols.filter((p) => p.detected).length} protocol(s) detected`,
      result.added.length ? `new: ${result.added.join(", ")}` : null,
      result.removed.length ? `missing: ${result.removed.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return { ok: true, message: `Synchronised — ${summary}`, data: { sync: JSON.parse(JSON.stringify(result)) } };
  });
}

export async function publishServerAction(id: string): Promise<ActionState> {
  return safeAction("publishServer", async () => {
    const { actor } = await authorize("servers:edit");
    const serverId = parseId(id);
    await publishServer(serverId, actor);
    refresh(serverId);
    return { ok: true, message: "Server published. It now appears on every enabled protocol page." };
  });
}

const lifecycleTarget = z.enum(["active", "maintenance", "disabled"]);

export async function setLifecycleAction(id: string, target: string): Promise<ActionState> {
  return safeAction("setLifecycle", async () => {
    const { actor } = await authorize("servers:operate");
    const serverId = parseId(id);
    const t = lifecycleTarget.parse(target);
    await setServerLifecycle(serverId, t, actor);
    refresh(serverId);
    const msg = { active: "Server is active again.", maintenance: "Maintenance mode enabled. New accounts are paused.", disabled: "Server disabled." }[t];
    return { ok: true, message: msg };
  });
}

export async function deleteServerAction(id: string, confirmName: string): Promise<ActionState> {
  const result = await safeAction("deleteServer", async () => {
    const { actor } = await authorize("servers:delete");
    const serverId = parseId(id);
    await deleteServer(serverId, String(confirmName ?? "").slice(0, 100), actor);
    refresh();
    return { ok: true };
  });
  if (result.ok) redirect("/admin/servers");
  return result;
}

export async function restartAgentAction(id: string): Promise<ActionState> {
  return safeAction("restartAgent", async () => {
    const { actor } = await authorize("servers:operate");
    const serverId = parseId(id);
    await restartProvisioningService(serverId, actor);
    refresh(serverId);
    return { ok: true, message: "Restart requested. Run a connection test in a few seconds." };
  });
}

/** Form fields: `enabled:<protocolId>` = "on", `max:<protocolId>` = number or "". */
export async function saveServerProtocolsAction(id: string, fd: FormData): Promise<ActionState> {
  return safeAction("saveServerProtocols", async () => {
    const { actor } = await authorize("servers:edit");
    const serverId = parseId(id);
    const raw = formToObject(fd);
    const ids = Object.keys(raw)
      .filter((k) => k.startsWith("present:"))
      .map((k) => k.slice("present:".length));
    const parsed = protocolSettingsSchema.safeParse(
      ids.map((pid) => ({
        protocolId: pid,
        enabled: raw[`enabled:${pid}`] === "on",
        maxAccounts: raw[`max:${pid}`] ? Number(raw[`max:${pid}`]) : null,
      })),
    );
    if (!parsed.success) return { error: "Per-protocol limits must be whole numbers greater than zero." };
    await updateServerProtocols(serverId, parsed.data, actor);
    refresh(serverId);
    return { ok: true, message: "Protocol settings saved." };
  });
}
