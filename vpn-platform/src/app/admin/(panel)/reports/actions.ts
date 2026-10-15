"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors, safeAction } from "@/server/action-helpers";
import { authorize } from "@/server/auth/guards";
import { deleteReport, setReportStatus } from "@/server/reports/service";

const statusInput = z.object({
  id: z.uuid("Invalid report id."),
  status: z.enum(["open", "resolved"]),
  note: z
    .string()
    .trim()
    .max(500, "Keep the note under 500 characters")
    .transform((v) => (v ? v : null)),
});

/** Resolve or reopen a problem report, optionally with an internal note (never shown to the reporter). */
export async function setReportStatusAction(id: string, status: string, note: string): Promise<ActionState> {
  return safeAction("setReportStatus", async () => {
    const { actor } = await authorize("reports:manage");
    const input = statusInput.safeParse({ id, status, note: typeof note === "string" ? note : "" });
    if (!input.success) return { error: "Please correct the highlighted fields.", fieldErrors: fieldErrors(input.error) };
    await setReportStatus(input.data.id, input.data.status, input.data.note, actor);
    // The open-report counter lives in the panel layout (nav badge) and on the dashboard.
    revalidatePath("/admin", "layout");
    return { ok: true, message: input.data.status === "resolved" ? "Report marked as resolved." : "Report reopened." };
  });
}

/** Permanently delete a report, e.g. when the reporter asks for it to be erased. */
export async function deleteReportAction(id: string): Promise<ActionState> {
  return safeAction("deleteReport", async () => {
    const { actor } = await authorize("reports:manage");
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) return { error: "Invalid report id." };
    await deleteReport(parsed.data, actor);
    revalidatePath("/admin", "layout");
    return { ok: true, message: "Report deleted." };
  });
}
