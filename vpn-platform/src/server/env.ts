import { z } from "zod";

/**
 * Server-side configuration. Validated lazily on first use so `next build`
 * does not need production secrets. Never import this from client code.
 */
const bool = z
  .enum(["true", "false", "1", "0", ""])
  .optional()
  .transform((v) => v === "true" || v === "1");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  /**
   * Encryption keyring for secrets at rest (server API tokens, MFA secrets,
   * one-time provisioning results). Format: "<keyId>:<base64 32 bytes>[,<keyId>:<base64>]".
   * New ciphertexts use APP_ENCRYPTION_ACTIVE_KEY; older keys stay for decryption (rotation).
   */
  APP_ENCRYPTION_KEYS: z.string().min(1, "APP_ENCRYPTION_KEYS is required"),
  APP_ENCRYPTION_ACTIVE_KEY: z.string().min(1, "APP_ENCRYPTION_ACTIVE_KEY is required"),
  /** Secret used to HMAC client IP addresses before they are stored. */
  IP_HASH_SECRET: z.string().min(32, "IP_HASH_SECRET must be at least 32 characters"),

  SESSION_IDLE_MINUTES: z.coerce.number().int().positive().default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().positive().default(12),
  LOGIN_MAX_FAILURES: z.coerce.number().int().positive().default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  /**
   * Number of reverse proxies in front of the app that append to X-Forwarded-For. The client IP is
   * taken from that position counting from the right (1 = the proxy directly in front, e.g. Caddy/nginx).
   * The app must not be exposed directly to the internet, or client IPs can be spoofed.
   */
  TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),

  /** Node (VPN server) communication. */
  NODE_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
  NODE_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  NODE_PROVISION_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  NODE_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().default(1_048_576),
  /** Allow plain-HTTP node APIs (development / mock node only). */
  ALLOW_INSECURE_NODE_HTTP: bool,
  /** Allow node addresses in private / loopback ranges (development / private networks). */
  ALLOW_PRIVATE_NODE_ADDRESSES: bool,
  /** Latest node agent version; older agents are flagged "SERVER SCRIPT OUTDATED". */
  NODE_AGENT_LATEST_VERSION: z.string().default("1.0.0"),

  /** Provisioning. */
  PROVISION_RESULT_TTL_SECONDS: z.coerce.number().int().positive().default(3_600),
  PROVISION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid server configuration:\n${details}`);
  }
  cached = parsed.data;
  return cached;
}

/** For tests only. */
export function resetEnvCache() {
  cached = undefined;
}

export const isProduction = () => env().NODE_ENV === "production";
