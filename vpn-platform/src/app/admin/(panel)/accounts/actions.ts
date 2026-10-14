"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { safeAction } from "@/server/action-helpers";
import { getAccountState } from "@/server/accounts/queries";
import { authorize } from "@/server/auth/guards";
import { UserFacingError } from "@/server/errors";
import { NodeError } from "@/server/nodes/errors";
import { revokeAccount } from "@/server/provisioning/service";

const idSchema = z.uuid();

/**
 * Revoke a VPN account: the node deletes it (predefined operation, no free-form input) and its
 * capacity slot is released. Only pending and active accounts can be revoked.
 */
export async function revokeAccountAction(id: string): Promise<ActionState> {
  return safeAction("revokeAccount", async () => {
    const { actor } = await authorize("accounts:manage");
    const parsed = idSchema.safeParse(id);
    if (!parsed.success) throw new UserFacingError("Invalid account id.");
    const account = await getAccountState(parsed.data);
    if (!account) throw new UserFacingError("Account not found.");
    if (account.status !== "pending" && account.status !== "active") {
      throw new UserFacingError(`This account is already ${account.status}.`);
    }
    try {
      await revokeAccount(account.id, actor);
    } catch (e) {
      if (e instanceof UserFacingError || e instanceof NodeError) throw e;
      // revokeAccount() reports state problems (e.g. not yet confirmed by the node) as plain errors.
      if (account.status === "pending" || !account.remoteAccountId) {
        throw new UserFacingError("The server has not confirmed this account yet. Try again in a minute, once it is active.");
      }
      throw e;
    }
    revalidatePath("/admin/accounts");
    revalidatePath("/admin");
    return { ok: true, message: account.username ? `Account ${account.username} revoked.` : "Account revoked." };
  });
}
