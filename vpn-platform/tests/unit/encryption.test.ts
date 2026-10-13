import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, needsReencryption, parseKeyring, resetKeyringCache } from "@/server/crypto/encryption";
import { resetEnvCache } from "@/server/env";

describe("secret encryption", () => {
  it("round-trips with the bound context", () => {
    const ct = encryptSecret("s3cret-token", "server-credential:a:secret");
    expect(ct).toMatch(/^v1\.k1\./);
    expect(ct).not.toContain("s3cret");
    expect(decryptSecret(ct, "server-credential:a:secret")).toBe("s3cret-token");
  });

  it("fails when the context differs (ciphertext moved to another row)", () => {
    const ct = encryptSecret("x", "server-credential:a:secret");
    expect(() => decryptSecret(ct, "server-credential:b:secret")).toThrow();
  });

  it("fails when the ciphertext is tampered with", () => {
    const ct = encryptSecret("hello", "ctx");
    const parts = ct.split(".");
    const body = Buffer.from(parts[4]!, "base64url");
    body[0] = body[0]! ^ 0xff;
    parts[4] = body.toString("base64url");
    expect(() => decryptSecret(parts.join("."), "ctx")).toThrow();
  });

  it("decrypts values written with a rotated (older) key", () => {
    const original = process.env.APP_ENCRYPTION_ACTIVE_KEY;
    process.env.APP_ENCRYPTION_ACTIVE_KEY = "old";
    resetEnvCache();
    resetKeyringCache();
    const ct = encryptSecret("legacy", "ctx");
    process.env.APP_ENCRYPTION_ACTIVE_KEY = original;
    resetEnvCache();
    resetKeyringCache();
    expect(decryptSecret(ct, "ctx")).toBe("legacy");
    expect(needsReencryption(ct)).toBe(true);
    expect(needsReencryption(encryptSecret("new", "ctx"))).toBe(false);
  });

  it("validates keyring configuration", () => {
    expect(() => parseKeyring("k1:short", "k1")).toThrow(/32 bytes/);
    expect(() => parseKeyring(`k1:${Buffer.alloc(32).toString("base64")}`, "k2")).toThrow(/not in/);
  });
});
