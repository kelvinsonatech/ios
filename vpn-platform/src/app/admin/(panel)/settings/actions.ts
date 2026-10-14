"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { fieldErrors, safeAction } from "@/server/action-helpers";
import { authorize } from "@/server/auth/guards";
import { UserFacingError } from "@/server/errors";
import { updateSiteSettings } from "@/server/settings/service";

/** Friendlier messages for numeric fields than zod's generic "Too small: expected number to be >=30". */
const NUMBER_MESSAGES: Record<string, string> = {
  "quota.defaultLimit": "Use a whole number from 1 to 100 000, or leave blank for no quota",
  "health.intervalSeconds": "Use a whole number of seconds from 30 to 3600",
  "health.failureThreshold": "Use a whole number from 1 to 10",
};

/** Cross-field rules the stored schema does not enforce but an editor should. */
function editorIssues(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const a = (raw as { announcement?: { enabled?: unknown; text?: unknown; linkLabel?: unknown; linkUrl?: unknown } } | null)?.announcement;
  if (!a) return out;
  const text = typeof a.text === "string" ? a.text.trim() : "";
  const label = typeof a.linkLabel === "string" ? a.linkLabel.trim() : "";
  const url = typeof a.linkUrl === "string" ? a.linkUrl.trim() : "";
  if (a.enabled === true && !text) out["announcement.text"] = ["Enter the announcement text, or switch the bar off"];
  if (label && !url) out["announcement.linkUrl"] = ["Add the link the label points to"];
  if (url && !label) out["announcement.linkLabel"] = ["Add a label for the link"];
  return out;
}

export async function saveSettingsAction(json: string): Promise<ActionState> {
  return safeAction("saveSettings", async () => {
    const { actor } = await authorize("settings:manage");
    if (typeof json !== "string" || json.length > 50_000) throw new UserFacingError("Invalid payload.");
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new UserFacingError("Invalid payload.");
    }
    const extra = editorIssues(raw);
    try {
      if (Object.keys(extra).length) return { error: "Please correct the highlighted fields.", fieldErrors: extra };
      const saved = await updateSiteSettings(raw, actor);
      // Every public page reads the settings (name, announcement, quotas, avatars): refresh them all.
      revalidatePath("/", "layout");
      return { ok: true, message: "Settings saved.", data: { settings: saved } };
    } catch (e) {
      if (!(e instanceof z.ZodError)) throw e;
      const errors = { ...fieldErrors(e), ...extra };
      for (const key of Object.keys(errors)) if (NUMBER_MESSAGES[key]) errors[key] = [NUMBER_MESSAGES[key]!];
      return { error: "Please correct the highlighted fields.", fieldErrors: errors };
    }
  });
}
