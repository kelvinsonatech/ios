import { clientIpFromHeaders } from "@/server/auth/request-context";
import { verifyCaptcha } from "@/server/captcha";
import { errorSummary, logger } from "@/server/logging/logger";
import { apiError, noStoreJson, rateLimited, readPublicJson } from "@/server/public/http";
import { createReport, ReportError } from "@/server/reports/service";

const MAX_BODY_BYTES = 8 * 1024;

/**
 * POST /api/public/reports — "Report a problem" (CreateReportRequest → 201 { id }).
 * Same-origin JSON only, captcha when enabled, 3 reports per hour and 10 per day per client IP.
 */
export async function POST(req: Request) {
  const read = await readPublicJson(req, MAX_BODY_BYTES);
  if (!read.ok) return read.response;
  const clientIp = clientIpFromHeaders(req.headers);
  const token = (read.body as { captchaToken?: unknown }).captchaToken;
  if (!(await verifyCaptcha(typeof token === "string" ? token : null, clientIp))) {
    return apiError(403, "CAPTCHA_FAILED", "Please complete the human check and try again.");
  }
  try {
    const { id } = await createReport(read.body, clientIp);
    return noStoreJson({ id }, 201);
  } catch (e) {
    if (e instanceof ReportError) {
      if (e.code === "RATE_LIMITED") return rateLimited(e.message, e.retryAfterSeconds ?? 3600);
      return apiError(e.httpStatus, e.code, e.message, e.fieldErrors ? { fieldErrors: e.fieldErrors } : {});
    }
    logger.error("problem report failed", errorSummary(e));
    return apiError(500, "INTERNAL", "Something went wrong on our side. Please try again in a moment.");
  }
}
