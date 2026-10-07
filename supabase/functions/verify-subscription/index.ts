// Called by the app after a purchase / on launch with a StoreKit 2 signed transaction.
import { applyTransaction, verifyTransaction } from "../_shared/appstore.ts";
import { corsHeaders, error, json, requireUser } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error(405, "method_not_allowed");

  const user = await requireUser(req);
  if (!user) return error(401, "not_authenticated");

  let signed: string | undefined;
  try {
    signed = (await req.json()).signed_transaction;
  } catch {
    return error(400, "invalid_json");
  }
  if (!signed) return error(400, "missing_signed_transaction");

  try {
    const transaction = await verifyTransaction(signed);
    const owner = await applyTransaction(transaction, user.id);
    if (!owner) return error(409, "subscription_belongs_to_another_account");
    return json({});
  } catch (err) {
    console.error("transaction verification failed", err);
    return error(400, "invalid_transaction");
  }
});
