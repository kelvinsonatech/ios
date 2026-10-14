import type { PublicApiError } from "@/lib/public/types";

/**
 * Minimal JSON client for /api/public/*. Every non-2xx answer becomes an ApiError carrying the
 * contract's error body; a request that never got an answer becomes a NetworkError (retryable).
 * Nothing here logs request or response bodies: they may contain account credentials.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Omit<PublicApiError["error"], "code" | "message"> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class NetworkError extends Error {
  constructor(message = "Network error") {
    super(message);
    this.name = "NetworkError";
  }
}

function asErrorBody(body: unknown): PublicApiError["error"] | null {
  if (!body || typeof body !== "object" || !("error" in body)) return null;
  const e = (body as { error: unknown }).error;
  if (!e || typeof e !== "object") return null;
  const o = e as Record<string, unknown>;
  if (typeof o.code !== "string" || typeof o.message !== "string") return null;
  const out: PublicApiError["error"] = { code: o.code, message: o.message };
  if (o.fieldErrors && typeof o.fieldErrors === "object") {
    const fe: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(o.fieldErrors as Record<string, unknown>)) {
      if (Array.isArray(v)) fe[k] = v.filter((m): m is string => typeof m === "string");
      else if (typeof v === "string") fe[k] = [v];
    }
    out.fieldErrors = fe;
  }
  if (typeof o.retryAfterSeconds === "number" && Number.isFinite(o.retryAfterSeconds)) out.retryAfterSeconds = o.retryAfterSeconds;
  if (typeof o.resetsAt === "string" && !Number.isNaN(Date.parse(o.resetsAt))) out.resetsAt = o.resetsAt;
  return out;
}

const FALLBACK_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  413: "PAYLOAD_TOO_LARGE",
  415: "UNSUPPORTED_MEDIA_TYPE",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
};

async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  const e = asErrorBody(body);
  const retryHeader = Number(res.headers.get("retry-after"));
  const details: ApiError["details"] = {
    fieldErrors: e?.fieldErrors,
    retryAfterSeconds: e?.retryAfterSeconds ?? (Number.isFinite(retryHeader) && retryHeader > 0 ? retryHeader : undefined),
    resetsAt: e?.resetsAt,
  };
  const code = e?.code ?? FALLBACK_CODES[res.status] ?? (res.status >= 500 ? "SERVER_ERROR" : "REQUEST_FAILED");
  return new ApiError(res.status, code, e?.message ?? `Request failed (${res.status})`, details);
}

export async function requestJson<T>(
  url: string,
  init: { method?: "GET" | "POST"; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<{ status: number; data: T }> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: {
        accept: "application/json",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
      credentials: "same-origin",
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new NetworkError();
  }
  if (!res.ok) throw await toApiError(res);
  try {
    return { status: res.status, data: (await res.json()) as T };
  } catch {
    throw new ApiError(res.status, "BAD_RESPONSE", "The server sent an unexpected response.");
  }
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
}
