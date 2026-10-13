import { connection } from "next/server";
import { listPublicProtocols } from "@/server/protocols/catalog";
import { publicJson } from "@/server/http";

/** GET /api/public/protocols — enabled protocols with the number of servers offering each. */
export async function GET() {
  await connection();
  return publicJson({ protocols: await listPublicProtocols() });
}
