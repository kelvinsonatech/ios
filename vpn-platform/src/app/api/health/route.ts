import { connection, NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { redis } from "@/server/redis";

/** Liveness/readiness probe for the load balancer / Docker healthcheck. */
export async function GET() {
  await connection();
  const checks = { database: false, redis: false };
  try {
    await db().execute(sql`select 1`);
    checks.database = true;
  } catch {}
  try {
    checks.redis = (await redis().ping()) === "PONG";
  } catch {}
  const ok = checks.database && checks.redis;
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
