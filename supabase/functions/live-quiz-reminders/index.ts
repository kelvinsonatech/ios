// Scheduled (e.g. every minute via Supabase Cron): pushes an APNs alert to participants of
// live quizzes starting within the next 5 minutes. Requires the service-role key as bearer.
import { importPKCS8, SignJWT } from "npm:jose@5";
import { env, error, json, serviceClient } from "../_shared/http.ts";

let cachedToken: { value: string; issuedAt: number } | null = null;

/** APNs provider token (ES256), reused for up to 50 minutes as Apple recommends. */
async function apnsToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && now - cachedToken.issuedAt < 50 * 60) return cachedToken.value;
  const key = await importPKCS8(env("APNS_PRIVATE_KEY").replace(/\\n/g, "\n"), "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env("APNS_KEY_ID") })
    .setIssuer(env("APNS_TEAM_ID"))
    .setIssuedAt(now)
    .sign(key);
  cachedToken = { value, issuedAt: now };
  return value;
}

async function sendPush(token: string, title: string, body: string, data: Record<string, string>): Promise<number> {
  const host = Deno.env.get("APNS_SANDBOX") === "true" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${await apnsToken()}`,
      "apns-topic": env("APPLE_BUNDLE_ID"),
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    body: JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, ...data }),
  });
  return response.status;
}

Deno.serve(async (req) => {
  const authorization = req.headers.get("Authorization") ?? "";
  if (authorization !== `Bearer ${env("SUPABASE_SERVICE_ROLE_KEY")}`) return error(401, "unauthorized");

  const db = serviceClient();
  const now = new Date();
  const soon = new Date(now.getTime() + 5 * 60 * 1000);
  const { data: quizzes } = await db
    .from("live_quizzes")
    .select("id, title, starts_at")
    .eq("status", "scheduled")
    .is("reminder_sent_at", null)
    .gt("starts_at", now.toISOString())
    .lte("starts_at", soon.toISOString());

  let sent = 0;
  for (const quiz of quizzes ?? []) {
    // Claim the quiz first so overlapping runs don't double-send.
    const { data: claimed } = await db
      .from("live_quizzes")
      .update({ reminder_sent_at: now.toISOString() })
      .eq("id", quiz.id)
      .is("reminder_sent_at", null)
      .select("id");
    if (!claimed?.length) continue;

    const { data: participants } = await db.from("live_quiz_participants").select("user_id").eq("quiz_id", quiz.id);
    const userIds = (participants ?? []).map((p) => p.user_id);
    if (!userIds.length) continue;
    const { data: devices } = await db.from("device_tokens").select("token").in("user_id", userIds);

    for (const device of devices ?? []) {
      const status = await sendPush(device.token, `${quiz.title} is about to start`, "Open Lumen to join the live quiz.", {
        live_quiz_id: quiz.id,
      });
      if (status === 200) sent++;
      // 410 = token no longer valid for this app.
      if (status === 410) await db.from("device_tokens").delete().eq("token", device.token);
    }
  }
  return json({ sent });
});
