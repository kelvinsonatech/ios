// App Store Server Notifications V2 webhook (renewals, expirations, refunds, revocations).
// Configure the production and sandbox URLs in App Store Connect. Deploy with --no-verify-jwt:
// Apple does not send a Supabase JWT; authenticity comes from the signed payload itself.
import { applyTransaction, verifyNotification, verifyTransaction } from "../_shared/appstore.ts";
import { error, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return error(405, "method_not_allowed");

  let signedPayload: string | undefined;
  try {
    signedPayload = (await req.json()).signedPayload;
  } catch {
    return error(400, "invalid_json");
  }
  if (!signedPayload) return error(400, "missing_payload");

  try {
    const notification = await verifyNotification(signedPayload);
    const signedTransaction = notification.data?.signedTransactionInfo;
    if (signedTransaction) {
      const transaction = await verifyTransaction(signedTransaction);
      await applyTransaction(transaction, null);
    }
    console.log("app store notification", notification.notificationType, notification.subtype ?? "");
    return json({});
  } catch (err) {
    console.error("notification verification failed", err);
    // 4xx tells Apple not to retry an unverifiable payload.
    return error(400, "invalid_notification");
  }
});
