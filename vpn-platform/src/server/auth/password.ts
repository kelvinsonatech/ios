import { hash, verify } from "@node-rs/argon2";

/** Argon2id parameters (OWASP 2024+: m=19 MiB, t=2, p=1 minimum; we use more memory). */
const OPTIONS = { memoryCost: 47_104, timeCost: 2, parallelism: 1, outputLen: 32 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

export async function verifyPassword(stored: string, password: string): Promise<boolean> {
  try {
    return await verify(stored, password);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;
/** Burn the same time as a real verification when the account does not exist (timing safety). */
export async function verifyDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword("dummy-password-for-timing-safety");
  await verifyPassword(await dummyHash, password);
  return false;
}

export const PASSWORD_MIN_LENGTH = 12;

/** Basic strength policy for administrator passwords. */
export function passwordPolicyErrors(password: string, email?: string): string[] {
  const errors: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) errors.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (password.length > 256) errors.push("Use at most 256 characters.");
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(password)).length;
  if (classes < 3) errors.push("Mix at least three of: lowercase, uppercase, digits, symbols.");
  if (email && password.toLowerCase().includes(email.split("@")[0]!.toLowerCase())) errors.push("Do not include your email name.");
  return errors;
}
