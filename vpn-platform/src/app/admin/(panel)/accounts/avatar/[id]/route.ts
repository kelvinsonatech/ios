import { authorize } from "@/server/auth/guards";
import { svgAvatarResponse } from "@/server/admins/avatar-response";
import { accountAvatar } from "@/server/avatar";
import { getSiteSettings } from "@/server/settings/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * DiceBear avatar of a VPN account for Admin → Accounts. Derived from the account id only (the
 * same avatar the user saw on their result page), so no database lookup is needed. `?s=<style>`
 * is only a cache key: the current site setting decides the style.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await authorize("accounts:view");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const { id } = await params;
  if (!UUID.test(id)) return new Response("Not found", { status: 404 });
  const { avatarStyle } = await getSiteSettings();
  // A URL naming an outdated style is answered with the current one but not cached for long.
  const current = new URL(req.url).searchParams.get("s") === avatarStyle;
  return svgAvatarResponse(accountAvatar(id, avatarStyle), current ? 86_400 : 60);
}
