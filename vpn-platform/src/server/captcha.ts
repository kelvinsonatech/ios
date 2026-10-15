import { rateLimit, type RateLimitResult } from "@/server/auth/rate-limit";
import { hashClientIp } from "@/server/crypto/hashing";
import { env, isProduction } from "@/server/env";
import { errorSummary, logger } from "@/server/logging/logger";

/**
 * Captcha for the public forms (account creation, problem reports).
 *
 * CAPTCHA_PROVIDER=turnstile verifies Cloudflare Turnstile tokens server side and FAILS CLOSED:
 * a missing token, a timeout, a network error or an unexpected answer all count as "not human".
 * CAPTCHA_PROVIDER=none (the default) accepts every request; the forms are then protected by the
 * rate limits only, which production deployments are warned about once.
 *
 * The secret key never leaves the server and is never logged. Cloudflare receives the client IP
 * (`remoteip`) as part of the verification; nothing else about the user is sent.
 *
 * Each widget sends an action name ("create-account", "report"); a token solved for one form is not
 * accepted by the other. Failed checks are throttled per client network before Cloudflare is asked
 * (captchaPreLimit), so junk tokens cannot keep outbound verification requests busy.
 */

export const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const VERIFY_TIMEOUT_MS = 5_000;
/** Turnstile tokens are at most 2048 characters. */
const MAX_TOKEN_LENGTH = 2048;

const g = globalThis as unknown as { __vlCaptchaWarned?: boolean };

export function captchaEnabled(): boolean {
  return env().CAPTCHA_PROVIDER === "turnstile";
}

/** Public site key for the browser widget; null when captcha is disabled. */
export function captchaSiteKey(): string | null {
  return captchaEnabled() ? (env().TURNSTILE_SITE_KEY ?? null) : null;
}

/** Attempts per minute and client network that may reach Turnstile verification. */
const VERIFY_PER_MINUTE = 20;

/** Throttle captcha checks per client network; always allowed when captcha is disabled. */
export async function captchaPreLimit(clientIp: string | null): Promise<RateLimitResult> {
  if (!captchaEnabled()) return { allowed: true, remaining: VERIFY_PER_MINUTE, resetSeconds: 60 };
  return rateLimit(`captcha:${hashClientIp(clientIp) ?? "unknown"}`, VERIFY_PER_MINUTE, 60, "closed");
}

/**
 * True when the token proves a human solved the challenge for `expectedAction` (or captcha is
 * disabled). A network error (for example a reused idle connection that was closed) is retried once.
 */
export async function verifyCaptcha(token: string | null | undefined, clientIp: string | null, expectedAction?: string): Promise<boolean> {
  const config = env();
  if (config.CAPTCHA_PROVIDER === "none") {
    if (isProduction() && !g.__vlCaptchaWarned) {
      g.__vlCaptchaWarned = true;
      logger.warn("CAPTCHA_PROVIDER=none: public forms are protected by rate limits only. Configure Turnstile for production.");
    }
    return true;
  }

  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) return false;
  const secret = config.TURNSTILE_SECRET_KEY;
  if (!secret) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (clientIp) body.set("remoteip", clientIp);
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  try {
    let res: Response;
    try {
      res = await siteverify(body, deadline);
    } catch (e) {
      // Only errors before any answer are retried (a timeout is not: the deadline is shared).
      if (!(e instanceof TypeError) || Date.now() >= deadline) throw e;
      res = await siteverify(body, deadline);
    }
    if (!res.ok) {
      logger.warn("captcha verification unavailable", { status: res.status });
      return false;
    }
    const data = (await res.json()) as { success?: unknown; action?: unknown; "error-codes"?: unknown };
    if (data?.success === true) {
      return !expectedAction || typeof data.action !== "string" || data.action === expectedAction;
    }
    const codes = Array.isArray(data?.["error-codes"]) ? data["error-codes"].filter((c) => typeof c === "string").slice(0, 5) : [];
    // Configuration problems (wrong secret) deserve an operator's attention; user failures do not.
    if (codes.some((c) => c === "missing-input-secret" || c === "invalid-input-secret")) {
      logger.error("captcha secret rejected by Turnstile; check TURNSTILE_SECRET_KEY", { codes });
    }
    return false;
  } catch (e) {
    logger.warn("captcha verification failed", errorSummary(e));
    return false;
  }
}

function siteverify(body: URLSearchParams, deadline: number): Promise<Response> {
  return fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
  });
}
