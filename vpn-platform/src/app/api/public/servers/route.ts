import { connection } from "next/server";
import { listPublicServerStatus } from "@/server/protocols/catalog";
import { publicJson } from "@/server/http";

/** GET /api/public/servers — server status page data (safe metadata only). */
export async function GET() {
  await connection();
  return publicJson({ servers: await listPublicServerStatus() }, { maxAge: 30 });
}
