import { closeDb } from "@/server/db";
import { seedProtocols } from "@/server/protocols/seed";

async function main() {
  const { created } = await seedProtocols();
  console.log(created.length ? `Created protocols: ${created.join(", ")}` : "Protocols already present; nothing to do.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
