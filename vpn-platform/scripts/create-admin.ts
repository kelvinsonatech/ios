/**
 * Create (or reset) an administrator from the command line.
 *
 *   npm run admin:create -- --email you@example.com --name "Your Name" --role super_admin
 *
 * The password is read from ADMIN_PASSWORD or prompted for (input hidden).
 */
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { adminRole, admins, type AdminRole } from "@/server/db/schema";
import { hashPassword, passwordPolicyErrors } from "@/server/auth/password";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function promptHidden(question: string): Promise<string> {
  let muted = false;
  const out = new Writable({
    write(chunk, _enc, cb) {
      if (!muted) process.stdout.write(chunk);
      cb();
    },
  });
  const rl = createInterface({ input: process.stdin, output: out, terminal: true });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name") ?? "Administrator";
  const role = (arg("role") ?? "super_admin") as AdminRole;
  if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) throw new Error("--email is required");
  if (!adminRole.enumValues.includes(role)) throw new Error(`--role must be one of ${adminRole.enumValues.join(", ")}`);

  const password = process.env.ADMIN_PASSWORD ?? (await promptHidden("Password: "));
  const problems = passwordPolicyErrors(password, email);
  if (problems.length) throw new Error(`Password rejected:\n - ${problems.join("\n - ")}`);

  const passwordHash = await hashPassword(password);
  const [existing] = await db().select({ id: admins.id }).from(admins).where(sql`lower(${admins.email}) = ${email}`).limit(1);
  if (existing) {
    await db()
      .update(admins)
      .set({ passwordHash, role, isActive: true, failedLoginCount: 0, lockedUntil: null, passwordChangedAt: new Date() })
      .where(eq(admins.id, existing.id));
    console.log(`Administrator ${email} updated (${role}); password reset.`);
  } else {
    const [row] = await db().insert(admins).values({ email, name, role, passwordHash }).returning({ id: admins.id });
    console.log(`Administrator ${email} (${role}) created: ${row?.id}`);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
