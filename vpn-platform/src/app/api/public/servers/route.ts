import { connection } from "next/server";
import { getStatusPage } from "@/server/public/catalog";
import { cachedJson } from "@/server/public/http";

/** GET /api/public/servers — every published server per protocol (StatusPageData, safe metadata only). */
export async function GET() {
  await connection();
  return cachedJson(await getStatusPage(), 30);
}
