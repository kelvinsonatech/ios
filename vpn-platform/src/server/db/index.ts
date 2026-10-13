import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
/** A database handle or an open transaction. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { __vlDb?: Database; __vlSql?: postgres.Sql };

function create(): Database {
  const sql = postgres(env().DATABASE_URL, {
    max: env().DATABASE_POOL_MAX,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => {},
  });
  globalForDb.__vlSql = sql;
  return drizzle(sql, { schema });
}

/** Lazily created singleton (survives Next.js dev hot reloads). */
export function db(): Database {
  if (!globalForDb.__vlDb) globalForDb.__vlDb = create();
  return globalForDb.__vlDb;
}

export async function closeDb() {
  await globalForDb.__vlSql?.end({ timeout: 5 });
  globalForDb.__vlDb = undefined;
  globalForDb.__vlSql = undefined;
}

export { schema };
