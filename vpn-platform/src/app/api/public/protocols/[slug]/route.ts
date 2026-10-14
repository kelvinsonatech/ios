import { connection } from "next/server";
import { getProtocolPage } from "@/server/public/catalog";
import { apiError, cachedJson } from "@/server/public/http";

/** GET /api/public/protocols/:slug — ProtocolPageData (form definition + countries). */
export async function GET(_req: Request, ctx: { params: Promise<{ slug: string }> }) {
  await connection();
  const { slug } = await ctx.params;
  const page = await getProtocolPage(slug);
  if (!page) return apiError(404, "NOT_FOUND", "Unknown protocol");
  return cachedJson(page, 30);
}
