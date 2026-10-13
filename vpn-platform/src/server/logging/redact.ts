import type { JsonObject, JsonValue } from "@/server/db/schema";

/**
 * Remove secrets before anything is written to logs, audit trails or provisioning_logs.
 * Keys are matched case-insensitively; values of matching keys are replaced with "[REDACTED]".
 */
const SENSITIVE_KEY =
  /pass(word|wd|phrase)?|secret|token|api[-_]?key|private[-_]?key|preshared|psk|authorization|cookie|session|uuid|credential|config(_text)?$|ovpn|uri|link|mfa|otp|recovery|signature|claim/i;

const MAX_DEPTH = 6;
const MAX_STRING = 500;

export function redact(value: unknown, depth = 0): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…` : value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return "[TRUNCATED]";
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>).slice(0, 100)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[REDACTED]" : redact(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export function redactObject(value: Record<string, unknown> | undefined): JsonObject {
  const r = redact(value ?? {});
  return r && typeof r === "object" && !Array.isArray(r) ? r : {};
}
