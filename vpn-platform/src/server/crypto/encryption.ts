import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/server/env";

/**
 * Authenticated encryption for secrets at rest (AES-256-GCM).
 *
 * Ciphertext format: `v1.<keyId>.<iv>.<tag>.<ciphertext>` (base64url parts).
 * Every ciphertext is bound to a context string (AAD) such as `server-credential:<serverId>`,
 * so a ciphertext copied into another row or column fails to decrypt.
 */

type Keyring = { active: string; keys: Map<string, Buffer> };

let keyring: Keyring | undefined;

export function parseKeyring(spec: string, active: string): Keyring {
  const keys = new Map<string, Buffer>();
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf(":");
    if (idx <= 0) throw new Error("APP_ENCRYPTION_KEYS entries must look like <keyId>:<base64>");
    const id = part.slice(0, idx);
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error(`Invalid encryption key id "${id}"`);
    const key = Buffer.from(part.slice(idx + 1), "base64");
    if (key.length !== 32) throw new Error(`Encryption key "${id}" must be 32 bytes (base64-encoded)`);
    keys.set(id, key);
  }
  if (!keys.has(active)) throw new Error(`APP_ENCRYPTION_ACTIVE_KEY "${active}" is not in APP_ENCRYPTION_KEYS`);
  return { active, keys };
}

function getKeyring(): Keyring {
  if (!keyring) keyring = parseKeyring(env().APP_ENCRYPTION_KEYS, env().APP_ENCRYPTION_ACTIVE_KEY);
  return keyring;
}

/** For tests. */
export function resetKeyringCache() {
  keyring = undefined;
}

const b64u = (b: Buffer) => b.toString("base64url");
const fromB64u = (s: string) => Buffer.from(s, "base64url");

export function encryptSecret(plaintext: string, context: string): string {
  const { active, keys } = getKeyring();
  const key = keys.get(active)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", active, b64u(iv), b64u(tag), b64u(ct)].join(".");
}

export class DecryptionError extends Error {
  constructor(message = "Unable to decrypt secret") {
    super(message);
    this.name = "DecryptionError";
  }
}

export function decryptSecret(payload: string, context: string): string {
  const parts = payload.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new DecryptionError("Unsupported ciphertext format");
  const [, keyId, iv, tag, ct] = parts as [string, string, string, string, string];
  const key = getKeyring().keys.get(keyId);
  if (!key) throw new DecryptionError(`Encryption key "${keyId}" is not configured`);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, fromB64u(iv));
    decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(fromB64u(tag));
    return Buffer.concat([decipher.update(fromB64u(ct)), decipher.final()]).toString("utf8");
  } catch {
    throw new DecryptionError();
  }
}

/** True when the ciphertext was produced with a key other than the active one (needs re-encryption). */
export function needsReencryption(payload: string): boolean {
  return payload.split(".")[1] !== getKeyring().active;
}

/** Context strings (AAD) used across the app. Keep them stable: changing one breaks decryption. */
export const EncryptionContext = {
  serverSecret: (serverId: string) => `server-credential:${serverId}:secret`,
  serverClientKey: (serverId: string) => `server-credential:${serverId}:client-key`,
  mfaSecret: (adminId: string) => `admin:${adminId}:mfa`,
  provisioningInput: (requestId: string) => `provisioning-request:${requestId}:input`,
  provisioningResult: (requestId: string) => `provisioning-request:${requestId}:result`,
} as const;
