import { NextResponse } from "next/server";

/** JSON response for public, cacheable, read-only endpoints. */
export function publicJson(data: unknown, init: { status?: number; maxAge?: number } = {}) {
  return NextResponse.json(data, {
    status: init.status ?? 200,
    headers: {
      "Cache-Control": `public, max-age=0, s-maxage=${init.maxAge ?? 15}, stale-while-revalidate=30`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export function jsonError(status: number, code: string, message: string) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
