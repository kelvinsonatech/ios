import { isIP } from "node:net";
import { headers } from "next/headers";
import { env } from "@/server/env";
import type { AuditActor } from "@/server/audit";

/** Client IP from X-Forwarded-For, counting TRUSTED_PROXY_HOPS entries from the right. */
export function clientIpFromHeaders(h: Headers): string | null {
  const xff = h.get("x-forwarded-for");
  const list = (xff ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const hops = Math.max(1, env().TRUSTED_PROXY_HOPS);
  const candidate = list[list.length - hops] ?? list[0] ?? h.get("x-real-ip") ?? null;
  if (!candidate) return null;
  const ip = candidate.replace(/^::ffff:/, "");
  return isIP(ip) ? ip : null;
}

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  return { ip: clientIpFromHeaders(h), userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
}

export async function actorFor(admin: { id: string; email: string } | null): Promise<AuditActor> {
  const ctx = await requestContext();
  return { adminId: admin?.id ?? null, email: admin?.email ?? null, ...ctx };
}
