import { cookies } from "next/headers";
import { env, isProduction } from "@/server/env";

/** `__Host-` prefix: Secure, Path=/, no Domain — the cookie cannot be set by subdomains. */
export function sessionCookieName() {
  return isProduction() ? "__Host-vl_admin" : "vl_admin";
}

export const SESSION_COOKIE_NAMES = ["__Host-vl_admin", "vl_admin"];

export async function setSessionCookie(token: string) {
  (await cookies()).set(sessionCookieName(), token, {
    httpOnly: true,
    secure: isProduction(),
    sameSite: "strict",
    path: "/",
    maxAge: env().SESSION_ABSOLUTE_HOURS * 3600,
  });
}

export async function readSessionCookie(): Promise<string | undefined> {
  return (await cookies()).get(sessionCookieName())?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(sessionCookieName());
}
