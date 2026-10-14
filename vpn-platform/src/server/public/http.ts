import { NextResponse } from "next/server";
import { env } from "@/server/env";
import type { PublicApiError } from "@/lib/public/types";

/**
 * Helpers for the public JSON API (src/app/api/public). Every POST endpoint goes through
 * readPublicJson(): JSON content type, a hard body size limit and a same-origin check, before any
 * parsing, captcha or database work happens.
 */

const BASE_HEADERS = { "X-Content-Type-Options": "nosniff" } as const;

export function noStoreJson(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return NextResponse.json(data, { status, headers: { ...BASE_HEADERS, "Cache-Control": "no-store", ...headers } });
}

/** Cacheable public read (browsers and shared caches may reuse it for `maxAge` seconds). */
export function cachedJson(data: unknown, maxAge: number) {
  return NextResponse.json(data, {
    headers: { ...BASE_HEADERS, "Cache-Control": `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` },
  });
}

export function apiError(status: number, code: string, message: string, extra: Omit<PublicApiError["error"], "code" | "message"> = {}, headers: Record<string, string> = {}) {
  const body: PublicApiError = { error: { code, message, ...extra } };
  return noStoreJson(body, status, headers);
}

export function rateLimited(message: string, retryAfterSeconds: number) {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return apiError(429, "RATE_LIMITED", message, { retryAfterSeconds: seconds }, { "Retry-After": String(seconds) });
}

/** True when the browser says the request comes from this site (APP_URL or the request's own origin). */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin || origin === "null") return false;
  const allowed = new Set<string>();
  try {
    allowed.add(new URL(env().APP_URL).origin);
  } catch {}
  try {
    allowed.add(new URL(req.url).origin);
  } catch {}
  return allowed.has(origin);
}

export type JsonBodyResult = { ok: true; body: unknown } | { ok: false; response: Response };

/** Content-Type, size limit and same-origin checks, then JSON.parse. */
export async function readPublicJson(req: Request, maxBytes: number): Promise<JsonBodyResult> {
  if (!isSameOrigin(req)) {
    return { ok: false, response: apiError(403, "FORBIDDEN_ORIGIN", "This request must come from the website itself.") };
  }
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") {
    return { ok: false, response: apiError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request as JSON.") };
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, response: tooLarge() };

  // Read the stream with a running limit (Content-Length can be absent or wrong).
  const reader = req.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, response: tooLarge() };
      }
      chunks.push(value);
    }
  }
  const text = new TextDecoder().decode(Buffer.concat(chunks));
  try {
    const body: unknown = JSON.parse(text);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("not an object");
    return { ok: true, body };
  } catch {
    return { ok: false, response: apiError(400, "INVALID_JSON", "The request body is not valid JSON.") };
  }
}

function tooLarge() {
  return apiError(413, "PAYLOAD_TOO_LARGE", "The request is too large.");
}
