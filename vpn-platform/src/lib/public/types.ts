import type { SiteSettings } from "@/lib/site-settings";

/** Port map as reported by a node, e.g. { "tls": [443], "none": [80], "udp": "1-65535" }. */
export type PortMap = Record<string, number[] | string>;
export type ServerStatus = "pending" | "online" | "offline" | "maintenance" | "disabled" | "full";

/**
 * Data contracts between the public site (src/app/(public), src/components/public), the public
 * API (src/app/api/public) and the read-only catalogue (src/server/public/catalog.ts). Types only:
 * safe to import from client components. Everything here is safe to send to
 * the browser: no node hostnames/IPs, management API ports, credentials or client IPs.
 */

/** Why a server cannot be used right now; "available" when an account can be created. */
export type Availability = "available" | "full" | "maintenance" | "offline" | "service_stopped";

export interface PublicCountry {
  /** ISO 3166-1 alpha-2, upper case ("DE"). */
  code: string;
  /** URL segment ("germany"). */
  slug: string;
  /** English name ("Germany"). */
  name: string;
}

/** Remaining capacity for one protocol on one server = min(active-account cap, creation quota). */
export interface PublicCapacity {
  /** Accounts that can still be created now; null = unlimited. */
  remaining: number | null;
  /** The limit `remaining` counts down from (for progress bars); null = unlimited. */
  limit: number | null;
  /** Present when a creation quota applies: when it next resets (ISO). */
  quotaResetsAt: string | null;
}

export interface PublicServerCard {
  id: string;
  /** URL segment ("de1"). */
  slug: string;
  /** Display name set by the admin ("Germany 01"). */
  name: string;
  /** VPN hostname users connect to; null unless settings.display.showHostnames is on. */
  hostname: string | null;
  country: PublicCountry;
  city: string | null;
  region: string | null;
  status: ServerStatus;
  availability: Availability;
  /** Last measured round-trip time from the website to the server, ms. */
  latencyMs: number | null;
  /** When the health monitor last checked this server (ISO). */
  lastCheckedAt: string | null;
  capacity: PublicCapacity;
  /** Public service ports for this protocol as reported by the node, e.g. { tls: [443], none: [80] }. */
  ports: PortMap;
  /** Transports for this protocol (ws, grpc, ...). */
  transports: string[];
  /** Other protocols offered by the same server. */
  otherProtocols: { slug: string; name: string }[];
  /** Canonical page of this server for the protocol in context: /<protocol>/<country>/<server>. */
  href: string;
}

export interface PublicProtocolSummary {
  slug: string;
  name: string;
  description: string;
  /** lucide icon name (see src/components/protocol-icon.tsx). */
  icon: string;
  category: string;
  /** Published servers (online, full or maintenance). */
  serverCount: number;
  /** Servers where an account can be created right now. */
  availableCount: number;
  countries: PublicCountry[];
  durationOptions: number[];
  defaultDurationDays: number;
  href: string;
}

export interface PublicFormField {
  key: string;
  label: string;
  type: "text" | "password" | "select" | "number" | "duration";
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  options: { value: string; label: string }[];
  validation: { pattern?: string; minLength?: number; maxLength?: number; min?: number; max?: number };
  defaultValue: string | null;
}

export interface PublicProtocolDetail extends PublicProtocolSummary {
  /** Account form fields in display order (the backend validates the same definition). */
  fields: PublicFormField[];
}

export interface PublicCountrySummary extends PublicCountry {
  region: string | null;
  serverCount: number;
  availableCount: number;
  /** Sum of remaining capacity over the country's servers; null if any is unlimited. */
  remaining: number | null;
  /** Best availability among the country's servers ("available" if any server is). */
  availability: Availability;
  /** Lowest latency among the country's servers, ms. */
  bestLatencyMs: number | null;
  href: string;
}

export interface ProtocolPageData {
  protocol: PublicProtocolDetail;
  countries: PublicCountrySummary[];
}

export interface CountryPageData {
  protocol: PublicProtocolDetail;
  country: PublicCountry;
  servers: PublicServerCard[];
}

export interface ServerPageData {
  protocol: PublicProtocolDetail;
  country: PublicCountry;
  server: PublicServerCard;
}

export interface StatusPageData {
  generatedAt: string;
  /** Server counts by status; `full` counts services (server + protocol) that are full right now. */
  totals: { protocols: number; servers: number; online: number; offline: number; maintenance: number; full: number };
  /** One section per enabled protocol, servers ordered by country then name. */
  sections: { protocol: Pick<PublicProtocolSummary, "slug" | "name" | "icon" | "href">; servers: PublicServerCard[] }[];
}

export interface SiteStats {
  accountsTotal: number;
  /** Accounts created since 00:00 in the quota time zone. */
  accountsToday: number;
  serversOnline: number;
  countries: number;
  byProtocol: { slug: string; name: string; total: number; today: number }[];
}

/** Settings subset needed by public pages (no internal knobs such as health intervals). */
export type PublicSiteSettings = Pick<
  SiteSettings,
  "siteName" | "tagline" | "seoDescription" | "announcement" | "contact" | "rules" | "avatarStyle" | "display"
> & {
  quota: Pick<SiteSettings["quota"], "resetTimes" | "timezone">;
  /** Public Turnstile site key when captcha is enabled, else null. */
  captchaSiteKey: string | null;
};

export interface SitemapEntry {
  path: string;
  lastModified: string | null;
}

// ---------------------------------------------------------------------------
// Public API (src/app/api/public/*) request/response bodies
// ---------------------------------------------------------------------------

/** POST /api/public/accounts (JSON, same-origin only). */
export interface CreateAccountRequest {
  serverId: string;
  /** Protocol slug. */
  protocol: string;
  /** Form values keyed by PublicFormField.key. */
  input: Record<string, string>;
  /** Random per form submission, 16–64 chars [A-Za-z0-9_-]; resend the same key when retrying. */
  idempotencyKey: string;
  /** Turnstile token when PublicSiteSettings.captchaSiteKey is set. */
  captchaToken?: string | null;
}

/** 202 response of POST /api/public/accounts. Poll GET /api/public/accounts/{requestId} with header `x-claim-token`. */
export interface CreateAccountResponse {
  requestId: string;
  claimToken: string;
  state: "queued" | "in_flight" | "uncertain" | "succeeded" | "failed";
}

/** Error body of every /api/public endpoint (4xx/5xx). */
export interface PublicApiError {
  error: {
    code: string;
    message: string;
    /** Per form field messages for VALIDATION_FAILED. */
    fieldErrors?: Record<string, string[]>;
    /** For RATE_LIMITED. */
    retryAfterSeconds?: number;
    /** For RATE_LIMITED from account creation: "daily" = the per-day allowance for this protocol is
     *  used up (the message names the limit); "burst" = too many attempts in a short time. */
    limitScope?: "daily" | "burst";
    /** For QUOTA_REACHED: when the server's creation quota resets (ISO). */
    resetsAt?: string;
  };
}

export interface PublicAccountField {
  key: string;
  label: string;
  kind: "text" | "secret" | "uri" | "multiline" | "file";
  value: string;
  sensitive: boolean;
  copyable: boolean;
  /** Show a QR code for this value. */
  qr: boolean;
}

export interface PublicAccountArtifact {
  key: string;
  label: string;
  kind: "uri" | "file";
  content: string;
  filename?: string;
  mimeType?: string;
  qr: boolean;
  sensitive: boolean;
}

/** The created account as delivered once to the requester (mirrors PresentedAccount + avatar). */
export interface PublicAccountResult {
  protocol: { slug: string; name: string };
  server: { id: string; name: string };
  username?: string;
  expiresAt: string;
  fields: PublicAccountField[];
  artifacts: PublicAccountArtifact[];
  /** DiceBear avatar (SVG data URI) generated for this account. */
  avatar: string;
}

/** GET /api/public/accounts/{requestId}. `account` is null when the one-time result has expired. */
export type AccountStatusResponse =
  | { status: "pending" }
  | { status: "failed"; error: { code: string; message: string } }
  | { status: "active"; account: PublicAccountResult | null };

export type ReportCategory = "connection" | "slow" | "account" | "other";

/** POST /api/public/reports (JSON, same-origin only) → 201 { id }. */
export interface CreateReportRequest {
  serverId: string | null;
  protocol: string | null;
  category: ReportCategory;
  /** 10–2000 characters. */
  message: string;
  contactEmail: string | null;
  captchaToken?: string | null;
}

/**
 * Non-secret summary of an account the visitor created, kept only in their own browser
 * (localStorage, key "vl:my-accounts") for the "My accounts" page. Never contains passwords,
 * UUIDs, keys, links or configs.
 */
export interface SavedAccountSummary {
  /** requestId of the creation, used as a stable key. */
  id: string;
  protocol: { slug: string; name: string };
  server: { name: string; href: string; countryCode: string };
  username: string | null;
  avatar: string;
  createdAt: string;
  expiresAt: string;
}
