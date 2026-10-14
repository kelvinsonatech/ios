import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge of the app:
 *  1. Content-Security-Policy with a per-request nonce for every page.
 *  2. Optimistic admin gate: requests to /admin/* without a session cookie go to the login page.
 *     Real authentication/authorization happens in the layouts, pages and actions (guards.ts).
 * The only third party ever allowed is Cloudflare Turnstile, and only when CAPTCHA_PROVIDER=turnstile.
 */
const SESSION_COOKIES = ["__Host-vl_admin", "vl_admin"];
const PUBLIC_ADMIN_PATHS = ["/admin/login"];

const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function csp(nonce: string) {
  const dev = process.env.NODE_ENV === "development";
  // Read directly (not via env()): the proxy must not need the database/Redis configuration.
  const turnstile = process.env.CAPTCHA_PROVIDER === "turnstile";
  const captcha = turnstile ? ` ${TURNSTILE_ORIGIN}` : "";
  return [
    "default-src 'self'",
    // The host is a CSP2 fallback; CSP3 browsers rely on the nonce + 'strict-dynamic'.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${captcha}${dev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by UI primitives (positioning); scripts stay nonce-locked.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self'${captcha}`,
    ...(turnstile ? [`frame-src ${TURNSTILE_ORIGIN}`] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(!dev && process.env.APP_URL?.startsWith("https://") ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/admin") && !PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    const hasCookie = SESSION_COOKIES.some((n) => request.cookies.has(n));
    if (!hasCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const policy = csp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|icon.svg).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
