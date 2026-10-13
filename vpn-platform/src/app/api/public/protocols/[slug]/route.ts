import { connection } from "next/server";
import { getPublicProtocolServers } from "@/server/protocols/catalog";
import { jsonError, publicJson } from "@/server/http";

/** GET /api/public/protocols/:slug — protocol form definition + servers currently offering it. */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(slug)) return jsonError(404, "NOT_FOUND", "Unknown protocol");
  const result = await getPublicProtocolServers(slug);
  if (!result) return jsonError(404, "NOT_FOUND", "Unknown protocol");
  return publicJson(result);
}
