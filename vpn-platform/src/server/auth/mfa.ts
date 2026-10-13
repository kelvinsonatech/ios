import { Secret, TOTP } from "otpauth";
import { randomBytes } from "node:crypto";
import { sha256Hex, safeEqual } from "@/server/crypto/hashing";

/** TOTP (RFC 6238): 6 digits, 30-second steps, ±1 step tolerance. */
export const TOTP_PERIOD = 30;

export function generateMfaSecret(): string {
  return new Secret({ size: 20 }).base32;
}

export function totpFor(secretBase32: string, label: string, issuer: string) {
  return new TOTP({ issuer, label, algorithm: "SHA1", digits: 6, period: TOTP_PERIOD, secret: Secret.fromBase32(secretBase32) });
}

/**
 * Verify a code and return the matched time step, or null. Callers must reject steps that are
 * not greater than the last accepted step (replay protection).
 */
export function verifyTotp(secretBase32: string, code: string, now = Date.now()): number | null {
  const clean = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(clean)) return null;
  const totp = totpFor(secretBase32, "x", "x");
  const delta = totp.validate({ token: clean, timestamp: now, window: 1 });
  if (delta === null) return null;
  return Math.floor(now / 1000 / TOTP_PERIOD) + delta;
}

/** Ten single-use recovery codes like "k3f9-2mzq-8pwd". Only hashes are stored. */
export function generateRecoveryCodes(count = 10): { codes: string[]; hashes: string[] } {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const codes = Array.from({ length: count }, () => {
    const bytes = randomBytes(12);
    const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
    return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
  });
  return { codes, hashes: codes.map(hashRecoveryCode) };
}

export function hashRecoveryCode(code: string) {
  return sha256Hex(`recovery:${code.trim().toLowerCase()}`);
}

/** Returns the remaining hashes if the code matched, otherwise null. */
export function consumeRecoveryCode(hashes: string[], code: string): string[] | null {
  const h = hashRecoveryCode(code);
  const idx = hashes.findIndex((x) => safeEqual(x, h));
  if (idx < 0) return null;
  return hashes.filter((_, i) => i !== idx);
}
