import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { AuthorizationError } from "@/server/auth/guards";
import { UserFacingError } from "@/server/errors";
import { NodeError } from "@/server/nodes/errors";
import { errorSummary, logger } from "@/server/logging/logger";

/** Run a Server Action body and convert expected failures into ActionState (never leaks internals). */
export async function safeAction(name: string, fn: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await fn();
  } catch (e) {
    unstable_rethrow(e); // let redirect()/notFound() through
    if (e instanceof AuthorizationError || e instanceof UserFacingError) return { error: e.message };
    if (e instanceof NodeError) return { error: e.safeMessage };
    if (e instanceof z.ZodError) return { error: "Please correct the highlighted fields.", fieldErrors: fieldErrors(e) };
    logger.error(`action ${name} failed`, errorSummary(e));
    return { error: "Something went wrong. Please try again." };
  }
}

export function fieldErrors(e: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of e.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** FormData → plain object of strings (checkboxes: "on"). Files are ignored. */
export function formToObject(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v === "string") out[k] = v;
  }
  return out;
}
