import { accountAvatar } from "@/server/avatar";
import { rateLimit } from "@/server/auth/rate-limit";
import { clientIpFromHeaders } from "@/server/auth/request-context";
import { hashClientIp } from "@/server/crypto/hashing";
import { errorSummary, logger } from "@/server/logging/logger";
import { getRequestResult } from "@/server/provisioning/service";
import { apiError, noStoreJson, rateLimited } from "@/server/public/http";
import { getSiteSettings } from "@/server/settings/service";
import type { AccountStatusResponse } from "@/lib/public/types";

/** Generous: the result page polls every 1–2 s while the worker provisions. */
const POLLS_PER_MINUTE = 120;

/**
 * GET /api/public/accounts/{requestId} with header `x-claim-token` → AccountStatusResponse.
 * Unknown ids and wrong tokens get the same 404, so request ids reveal nothing. The one-time result
 * (passwords, keys, links) is returned until it expires; it is never cached.
 */
export async function GET(req: Request, ctx: { params: Promise<{ requestId: string }> }) {
  const { requestId } = await ctx.params;
  const key = hashClientIp(clientIpFromHeaders(req.headers)) ?? "unknown";
  const limit = await rateLimit(`poll:${key}`, POLLS_PER_MINUTE, 60, "open");
  if (!limit.allowed) return rateLimited("Too many requests. Please wait a moment.", limit.resetSeconds);

  const token = req.headers.get("x-claim-token") ?? "";
  try {
    const result = await getRequestResult(requestId, token);
    if (!result) return apiError(404, "NOT_FOUND", "This request does not exist or has expired.");
    const { status } = result;
    let body: AccountStatusResponse;
    if (status.status === "active" && status.account && result.accountId) {
      const { avatarStyle } = await getSiteSettings();
      body = { status: "active", account: { ...status.account, avatar: accountAvatar(result.accountId, avatarStyle) } };
    } else if (status.status === "active") {
      body = { status: "active", account: null };
    } else {
      body = status;
    }
    return noStoreJson(body);
  } catch (e) {
    logger.error("account status lookup failed", { requestId: requestId.slice(0, 64), ...errorSummary(e) });
    return apiError(500, "INTERNAL", "Something went wrong on our side. Please try again in a moment.");
  }
}
