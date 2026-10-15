import { z } from "zod";
import { clientIpFromHeaders } from "@/server/auth/request-context";
import { captchaPreLimit, verifyCaptcha } from "@/server/captcha";
import { errorSummary, logger } from "@/server/logging/logger";
import { ProvisioningError, requestAccount } from "@/server/provisioning/service";
import { apiError, noStoreJson, rateLimited, readPublicJson } from "@/server/public/http";
import type { CreateAccountResponse } from "@/lib/public/types";

/** Account form bodies are tiny; anything bigger is not a real form submission. */
const MAX_BODY_BYTES = 16 * 1024;

const requestSchema = z
  .object({
    serverId: z.uuid(),
    protocol: z.string().regex(/^[a-z0-9][a-z0-9-]{0,47}$/),
    input: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), z.string().max(512)).refine((v) => Object.keys(v).length <= 16),
    idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/),
    captchaToken: z.string().max(4096).nullish(),
  })
  .strict();

/**
 * POST /api/public/accounts — create a VPN account (CreateAccountRequest → 202 CreateAccountResponse).
 * Same-origin JSON only; captcha (when enabled) and per-IP rate limits; the account is created by the
 * worker and the result is fetched once with the returned claim token.
 */
export async function POST(req: Request) {
  const read = await readPublicJson(req, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const body = requestSchema.safeParse(read.body);
  if (!body.success) return apiError(400, "INVALID_REQUEST", "Invalid request. Please reload the page and try again.");

  const clientIp = clientIpFromHeaders(req.headers);
  const pre = await captchaPreLimit(clientIp);
  if (!pre.allowed) return rateLimited("Too many attempts. Please wait a minute and try again.", pre.resetSeconds, "burst");
  if (!(await verifyCaptcha(body.data.captchaToken, clientIp, "create-account"))) {
    return apiError(403, "CAPTCHA_FAILED", "Please complete the human check and try again.");
  }

  try {
    const r = await requestAccount({
      serverId: body.data.serverId,
      protocolSlug: body.data.protocol,
      input: body.data.input,
      idempotencyKey: body.data.idempotencyKey,
      clientIp,
    });
    const res: CreateAccountResponse = { requestId: r.requestId, claimToken: r.claimToken, state: r.state };
    return noStoreJson(res, 202);
  } catch (e) {
    if (e instanceof ProvisioningError) {
      if (e.code === "RATE_LIMITED") return rateLimited(e.message, e.retryAfterSeconds ?? 60, e.limitScope);
      return apiError(e.httpStatus, e.code, e.message, {
        ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}),
        ...(e.resetsAt ? { resetsAt: e.resetsAt.toISOString() } : {}),
      });
    }
    logger.error("public account request failed", errorSummary(e));
    return apiError(500, "INTERNAL", "Something went wrong on our side. Please try again in a moment.");
  }
}
