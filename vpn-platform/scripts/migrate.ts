import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { closeDb, db } from "@/server/db";

const folder = process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "drizzle");

async function main() {
  console.log(`Applying migrations from ${folder} ...`);
  await migrate(db(), { migrationsFolder: folder });
  console.log("Migrations applied.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
