import { describe, expect, it } from "vitest";
import { consumeRecoveryCode, generateMfaSecret, generateRecoveryCodes, totpFor, verifyTotp } from "@/server/auth/mfa";
import { hashPassword, passwordPolicyErrors, verifyPassword } from "@/server/auth/password";

describe("TOTP", () => {
  it("accepts the current code and rejects others", () => {
    const secret = generateMfaSecret();
    const now = Date.now();
    const code = totpFor(secret, "a", "b").generate({ timestamp: now });
    expect(verifyTotp(secret, code, now)).toBe(Math.floor(now / 30_000));
    expect(verifyTotp(secret, code, now + 5 * 60_000)).toBeNull();
    expect(verifyTotp(secret, "12345", now)).toBeNull();
  });
  it("recovery codes are single use", () => {
    const { codes, hashes } = generateRecoveryCodes(3);
    const remaining = consumeRecoveryCode(hashes, codes[1]!.toUpperCase());
    expect(remaining).toHaveLength(2);
    expect(consumeRecoveryCode(remaining!, codes[1]!)).toBeNull();
  });
});

describe("passwords", () => {
  it("hashes with argon2id and verifies", async () => {
    const h = await hashPassword("Correct-Horse-Battery-9");
    expect(h).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(h, "Correct-Horse-Battery-9")).toBe(true);
    expect(await verifyPassword(h, "wrong")).toBe(false);
  });
  it("enforces the admin password policy", () => {
    expect(passwordPolicyErrors("short")).not.toHaveLength(0);
    expect(passwordPolicyErrors("alllowercaseletters")).not.toHaveLength(0);
    expect(passwordPolicyErrors("Correct-Horse-Battery-9")).toHaveLength(0);
  });
});
