import { Buffer } from "node:buffer";
import {
  Environment,
  type JWSTransactionDecodedPayload,
  SignedDataVerifier,
} from "npm:@apple/app-store-server-library@1";
import { env, serviceClient } from "./http.ts";

/**
 * Verifies StoreKit 2 JWS payloads against Apple's root CA and records entitlements.
 * This is the only path that can grant `profiles.is_premium`.
 */

const APPLE_ROOT_CA_URLS = [
  "https://www.apple.com/certificateauthority/AppleRootCA-G3.cer",
  "https://www.apple.com/certificateauthority/AppleRootCA-G2.cer",
];

let verifiers: SignedDataVerifier[] | null = null;

async function getVerifiers(): Promise<SignedDataVerifier[]> {
  if (verifiers) return verifiers;
  const roots = await Promise.all(
    APPLE_ROOT_CA_URLS.map(async (url) => Buffer.from(await (await fetch(url)).arrayBuffer())),
  );
  const bundleId = env("APPLE_BUNDLE_ID");
  const appAppleId = Deno.env.get("APPLE_APP_ID") ? Number(Deno.env.get("APPLE_APP_ID")) : undefined;
  const environments = Deno.env.get("APPLE_ALLOW_SANDBOX") === "false"
    ? [Environment.PRODUCTION]
    : [Environment.PRODUCTION, Environment.SANDBOX];
  verifiers = environments.map((environment) =>
    new SignedDataVerifier(roots, true, environment, bundleId, environment === Environment.PRODUCTION ? appAppleId : undefined)
  );
  return verifiers;
}

async function tryEach<T>(fn: (v: SignedDataVerifier) => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const verifier of await getVerifiers()) {
    try {
      return await fn(verifier);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError ?? new Error("verification_failed");
}

export const verifyTransaction = (jws: string) => tryEach((v) => v.verifyAndDecodeTransaction(jws));
export const verifyNotification = (jws: string) => tryEach((v) => v.verifyAndDecodeNotification(jws));

/** Upserts the subscription and recomputes premium status. Returns the user id it applied to. */
export async function applyTransaction(
  transaction: JWSTransactionDecodedPayload,
  claimedUserId: string | null,
): Promise<string | null> {
  const db = serviceClient();
  const originalId = transaction.originalTransactionId;
  if (!originalId) return null;

  // Resolve the owner: existing record for this original transaction wins, then the
  // appAccountToken set at purchase time, then the authenticated caller.
  const { data: existing } = await db
    .from("subscriptions")
    .select("user_id")
    .eq("original_transaction_id", originalId)
    .maybeSingle();
  const owner = existing?.user_id ?? transaction.appAccountToken?.toLowerCase() ?? claimedUserId;
  if (!owner) return null;
  // A user can't claim a subscription purchased by another account.
  if (claimedUserId && owner !== claimedUserId) return null;

  const expires = transaction.expiresDate ? new Date(transaction.expiresDate) : null;
  const active = !transaction.revocationDate && expires !== null && expires.getTime() > Date.now();

  await db.from("subscriptions").upsert({
    user_id: owner,
    product_id: transaction.productId ?? "unknown",
    original_transaction_id: originalId,
    expires_at: expires?.toISOString() ?? null,
    status: transaction.revocationDate ? "revoked" : active ? "active" : "expired",
    environment: String(transaction.environment ?? "Production"),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  await db.from("profiles").update({ is_premium: active }).eq("id", owner);
  return owner;
}
