import { ApiError, NetworkError } from "./api";

/** A user-facing explanation of a failed request (shown in an alert above the form). */
export interface FriendlyError {
  code: string;
  title: string;
  message: string;
  /** Wait until then before retrying (RATE_LIMITED), ISO. */
  retryAt?: string;
  /** When new slots open (QUOTA_REACHED). */
  resetsAt?: string;
  /** Suggest picking another server. */
  suggestOtherServer?: boolean;
}

/**
 * Maps the public API's error codes to friendly copy. Unknown codes fall back to the server's own
 * message (plain text, rendered escaped) so new backend errors still read sensibly.
 */
export function friendlyError(err: unknown, ctx: { protocolName: string; serverName: string }): FriendlyError {
  if (err instanceof NetworkError) {
    return {
      code: "NETWORK",
      title: "You seem to be offline",
      message: "We couldn't reach the website. Check your connection and try again — nothing was lost.",
    };
  }
  if (!(err instanceof ApiError)) {
    return { code: "UNKNOWN", title: "Something went wrong", message: "Please try again in a moment." };
  }
  const { code, details } = err;
  switch (code) {
    case "VALIDATION_FAILED":
      return { code, title: "Please check the form", message: "Some fields need your attention — see the notes below each one." };
    case "RATE_LIMITED": {
      const retryAt = details.retryAfterSeconds ? new Date(Date.now() + details.retryAfterSeconds * 1000).toISOString() : undefined;
      // The daily allowance per protocol; the server's message names the limit.
      if (details.limitScope === "daily") {
        return {
          code,
          title: "Daily limit reached",
          message: err.message || `You've created today's maximum of ${ctx.protocolName} accounts. Other protocols are still available to you.`,
          retryAt,
        };
      }
      return {
        code,
        title: "Slow down a little",
        message: "You've made several requests in a short time. Please wait before trying again.",
        retryAt,
      };
    }
    case "SERVER_UNAVAILABLE":
      return {
        code,
        title: "Server unavailable",
        message: `${ctx.serverName} can't take new accounts right now. Please choose another server.`,
        suggestOtherServer: true,
      };
    case "PROTOCOL_UNAVAILABLE":
      return {
        code,
        title: `${ctx.protocolName} unavailable`,
        message: `${ctx.protocolName} is temporarily unavailable on ${ctx.serverName}. Please choose another server.`,
        suggestOtherServer: true,
      };
    case "CAPACITY_REACHED":
      return {
        code,
        title: "Server is full",
        message: `${ctx.serverName} has reached its account limit. Please choose another server.`,
        suggestOtherServer: true,
      };
    case "QUOTA_REACHED":
      return {
        code,
        title: "No slots left for now",
        message: "All slots for this period are taken.",
        resetsAt: details.resetsAt,
        suggestOtherServer: true,
      };
    case "IDEMPOTENCY_CONFLICT":
      return { code, title: "Please submit again", message: "This form was already sent with different details. Submit it once more to continue." };
    case "CAPTCHA_FAILED":
      return { code, title: "Security check failed", message: "We couldn't verify the security check. Please complete it again and resubmit." };
    case "FORBIDDEN":
    case "FORBIDDEN_ORIGIN":
      return { code, title: "Request blocked", message: "Your request was blocked. Reload the page and try again." };
    case "NOT_FOUND":
      return { code, title: "Not found", message: "This server or service no longer exists. Please go back and choose another one.", suggestOtherServer: true };
    case "PAYLOAD_TOO_LARGE":
    case "BAD_REQUEST":
    case "INVALID_REQUEST":
    case "INVALID_JSON":
    case "UNSUPPORTED_MEDIA_TYPE":
      return { code, title: "Invalid request", message: "Something about this request wasn't right. Reload the page and try again." };
    default:
      if (err.status >= 500) {
        return { code, title: "Something went wrong on our side", message: "We couldn't complete your request. Please try again in a moment." };
      }
      return { code, title: "Request failed", message: err.message };
  }
}

/** Server field errors keyed by form field ("input.username" and "username" both map to "username"). */
export function normalizeFieldErrors(fieldErrors: Record<string, string[]> | undefined, known: string[]): {
  byField: Record<string, string>;
  other: string[];
} {
  const byField: Record<string, string> = {};
  const other: string[] = [];
  for (const [rawKey, messages] of Object.entries(fieldErrors ?? {})) {
    const key = rawKey.replace(/^input\./, "");
    const msg = messages.find((m) => m.trim()) ?? "Invalid value";
    if (known.includes(key)) byField[key] = msg;
    else other.push(msg);
  }
  return { byField, other };
}
