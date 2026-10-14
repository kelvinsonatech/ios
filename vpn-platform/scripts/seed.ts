import { closeDb } from "@/server/db";
import { seedProtocols } from "@/server/protocols/seed";

async function main() {
  const { created, upgraded } = await seedProtocols();
  console.log(created.length ? `Created protocols: ${created.join(", ")}` : "No new protocols.");
  console.log(upgraded.length ? `Added new fields to: ${upgraded.join(", ")}` : "Existing protocols are up to date.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
