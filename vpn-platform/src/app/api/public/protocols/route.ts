import { connection } from "next/server";
import { listProtocolSummaries } from "@/server/public/catalog";
import { cachedJson } from "@/server/public/http";

/** GET /api/public/protocols — protocols with published servers (PublicProtocolSummary[]). */
export async function GET() {
  await connection();
  return cachedJson({ protocols: await listProtocolSummaries() }, 30);
}
