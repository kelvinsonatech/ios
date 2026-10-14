import { z } from "zod";
import { AVATAR_STYLE_KEYS, DEFAULT_AVATAR_STYLE } from "@/lib/avatar-styles";

/**
 * Admin-editable site settings (Admin → Settings). Stored as one JSON document in `site_settings`
 * and validated with this schema on every read and write. Safe to import from client components.
 */

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v ? v : null));

/** Relative site path ("/server-status") or an https:// URL. */
const linkUrl = nullableText(300).refine((v) => !v || /^\/(?!\/)[\w\-./?=&#%]*$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v), {
  message: "Use a path such as /server-status or an https:// link",
});

export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(2, "At least 2 characters").max(40),
  tagline: z.string().trim().max(120),
  /** Meta description used on pages without their own. */
  seoDescription: z.string().trim().max(200),
  announcement: z.object({
    enabled: z.boolean(),
    text: z.string().trim().max(280),
    tone: z.enum(["info", "success", "warning"]),
    linkLabel: nullableText(40),
    linkUrl,
  }),
  quota: z.object({
    /** Local times ("HH:MM") at which every creation quota resets, e.g. ["00:00", "12:00"]. */
    resetTimes: z
      .array(z.string().regex(HH_MM, "Use HH:MM (24-hour)"))
      .min(1, "Add at least one reset time")
      .max(24)
      .transform((v) => [...new Set(v)].sort()),
    /** IANA time zone the reset times are expressed in, e.g. "Asia/Bangkok". */
    timezone: z.string().trim().refine(isTimeZone, "Unknown time zone"),
    /** Quota applied to protocols newly enabled on a server; null = no quota. */
    defaultLimit: z.number().int().min(1).max(100_000).nullable(),
  }),
  health: z.object({
    /** How often the worker checks every published server. */
    intervalSeconds: z.number().int().min(30).max(3600),
    /** Consecutive failed checks before a server is shown as offline. */
    failureThreshold: z.number().int().min(1).max(10),
  }),
  avatarStyle: z.enum(AVATAR_STYLE_KEYS),
  contact: z.object({
    email: z
      .string()
      .trim()
      .max(254)
      .nullable()
      .transform((v) => (v ? v : null))
      .refine((v) => !v || z.email().safeParse(v).success, "Enter a valid email address"),
    telegramUrl: nullableText(200).refine((v) => !v || /^https:\/\/t\.me\/[A-Za-z0-9_+/-]{2,100}$/.test(v), "Use a https://t.me/… link"),
  }),
  /** Short usage rules shown next to every account form ("No torrenting", ...). */
  rules: z.array(z.string().trim().min(1).max(80)).max(10),
  display: z.object({
    /**
     * Show each server's VPN hostname on public listings (users receive it with their account anyway).
     * The management API port is never shown and stays firewalled to the website.
     */
    showHostnames: z.boolean(),
    /** Footer counters with accounts created in total and today. */
    showStats: z.boolean(),
  }),
});

export type SiteSettings = z.infer<typeof siteSettingsSchema>;
export type SiteSettingsInput = z.input<typeof siteSettingsSchema>;

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  siteName: process.env.NEXT_PUBLIC_SITE_NAME || "Vaultline",
  tagline: "Private tunnels, provisioned in seconds.",
  seoDescription: "Free SSH, V2Ray, Trojan, Shadowsocks, WireGuard and OpenVPN accounts on fast servers worldwide.",
  announcement: { enabled: false, text: "", tone: "info", linkLabel: null, linkUrl: null },
  quota: { resetTimes: ["00:00", "12:00"], timezone: "UTC", defaultLimit: null },
  health: { intervalSeconds: 60, failureThreshold: 3 },
  avatarStyle: DEFAULT_AVATAR_STYLE,
  contact: { email: null, telegramUrl: null },
  rules: ["No torrenting or P2P", "No DDoS, hacking or carding", "One device per account"],
  display: { showHostnames: true, showStats: true },
};
