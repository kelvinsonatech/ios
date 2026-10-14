import { connection } from "next/server";
import { getStatusPage } from "@/server/public/catalog";
import { cachedJson } from "@/server/public/http";

/** GET /api/public/status — StatusPageData for the auto-refreshing server status page. */
export async function GET() {
  await connection();
  return cachedJson(await getStatusPage(), 5);
}
