import { AVATAR_STYLES, type AvatarStyle } from "@/lib/avatar-styles";
import { authorize } from "@/server/auth/guards";
import { svgAvatarResponse } from "@/server/admins/avatar-response";
import { avatarDataUri } from "@/server/avatar";
import { AVATAR_SAMPLE_SEEDS } from "../../../samples";

/**
 * DiceBear preview for Admin → Settings → Avatars, generated locally on the server. Served as a
 * same-origin image (instead of ~250 KB of inline data URIs in the settings page) and only for a
 * fixed set of sample seeds, so no caller-chosen text ever ends up in the SVG.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ style: string; sample: string }> }) {
  try {
    await authorize("settings:manage");
  } catch {
    return new Response("Forbidden", { status: 403 });
  }
  const { style, sample } = await params;
  const seed = AVATAR_SAMPLE_SEEDS[Number(sample)];
  if (!Object.hasOwn(AVATAR_STYLES, style) || !/^\d$/.test(sample) || !seed) return new Response("Not found", { status: 404 });
  return svgAvatarResponse(avatarDataUri(seed, style as AvatarStyle));
}
