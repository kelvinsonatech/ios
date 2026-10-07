// Permanently deletes the caller's account. All personal rows cascade from auth.users.
import { corsHeaders, error, json, requireUser, serviceClient } from "../_shared/http.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return error(405, "method_not_allowed");

  const user = await requireUser(req);
  if (!user) return error(401, "not_authenticated");

  const { error: deleteError } = await serviceClient().auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("account deletion failed", deleteError);
    return error(500, "deletion_failed");
  }
  return json({});
});
