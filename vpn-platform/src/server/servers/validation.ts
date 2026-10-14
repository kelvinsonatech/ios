import { z } from "zod";
import { isCountryCode } from "@/lib/countries";
import { SERVER_SLUG_PATTERN } from "@/lib/slug";
import { nodeAuthMethod, nodeTlsMode } from "@/server/db/schema";
import { nodeDrivers } from "@/server/nodes/drivers";

const HOSTNAME = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))*$/;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : null));

export const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .refine((v) => HOSTNAME.test(v) || z.union([z.ipv4(), z.ipv6()]).safeParse(v).success, "Enter a valid hostname, e.g. sg01.example.com");

export const serverDetailsSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(64),
  /** Public URL segment ("de1"). Blank = generated from the country code on create, unchanged on edit. */
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((v) => (v ? v : null))
    .refine((v) => !v || SERVER_SLUG_PATTERN.test(v), "Use lowercase letters, digits and hyphens, e.g. de1"),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .refine(isCountryCode, "Choose a country"),
  city: optionalText(64),
  region: optionalText(64),
  hostname: hostnameSchema,
  ipAddress: z.union([z.ipv4(), z.ipv6()], { error: "Enter a valid IPv4 or IPv6 address" }),
  apiPort: z.coerce.number({ error: "Enter a port" }).int().min(1).max(65535),
  apiBasePath: z
    .string()
    .trim()
    .regex(/^\/[A-Za-z0-9._~\/-]{0,63}$/, "Must start with / and contain only URL-safe characters")
    .default("/api/v1"),
  maxAccounts: z.coerce.number({ error: "Enter a number" }).int().min(1).max(100_000),
  provider: optionalText(64),
  notes: optionalText(2000),
  driver: z
    .string()
    .default("contract-v1")
    .refine((d) => d in nodeDrivers, "Unknown driver"),
});

const PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----/;
const PEM_KEY = /-----BEGIN ([A-Z ]+ )?PRIVATE KEY-----[\s\S]+-----END ([A-Z ]+ )?PRIVATE KEY-----/;

/** Connection / credentials. `apiSecret` may be blank on edit to keep the current secret. */
export function connectionSchema(opts: { secretRequired: boolean }) {
  return z
    .object({
      authMethod: z.enum(nodeAuthMethod.enumValues),
      keyId: optionalText(64).refine((v) => !v || /^[A-Za-z0-9._-]{1,64}$/.test(v), "Letters, digits, . _ - only"),
      apiSecret: z.string().trim().max(512).optional(),
      tlsMode: z.enum(nodeTlsMode.enumValues),
      tlsServerName: optionalText(253).refine((v) => !v || HOSTNAME.test(v), "Enter a valid hostname"),
      caCertificatePem: optionalText(20_000),
      pinnedFingerprintSha256: optionalText(128),
      clientCertificatePem: optionalText(20_000),
      clientKeyPem: optionalText(20_000),
    })
    .superRefine((v, ctx) => {
      const secret = v.apiSecret ?? "";
      if (opts.secretRequired && !secret) ctx.addIssue({ code: "custom", path: ["apiSecret"], message: "API key / token is required" });
      if (secret && secret.length < 16) {
        ctx.addIssue({ code: "custom", path: ["apiSecret"], message: "Use a random secret of at least 16 characters" });
      }
      if (secret && /\s/.test(secret)) ctx.addIssue({ code: "custom", path: ["apiSecret"], message: "Secret must not contain spaces" });
      if (v.tlsMode === "custom_ca" && !(v.caCertificatePem && PEM_CERT.test(v.caCertificatePem))) {
        ctx.addIssue({ code: "custom", path: ["caCertificatePem"], message: "Paste the server or CA certificate (PEM)" });
      }
      if (v.tlsMode === "pinned_fingerprint") {
        const fp = (v.pinnedFingerprintSha256 ?? "").replace(/[^A-Fa-f0-9]/g, "");
        if (fp.length !== 64) ctx.addIssue({ code: "custom", path: ["pinnedFingerprintSha256"], message: "Enter the SHA-256 fingerprint (64 hex characters)" });
      }
      const hasCert = !!v.clientCertificatePem;
      const hasKey = !!v.clientKeyPem;
      if (hasCert !== hasKey) ctx.addIssue({ code: "custom", path: ["clientKeyPem"], message: "Provide both the client certificate and key for mTLS" });
      if (hasCert && !PEM_CERT.test(v.clientCertificatePem!)) ctx.addIssue({ code: "custom", path: ["clientCertificatePem"], message: "Invalid PEM certificate" });
      if (hasKey && !PEM_KEY.test(v.clientKeyPem!)) ctx.addIssue({ code: "custom", path: ["clientKeyPem"], message: "Invalid PEM private key" });
    });
}

export type ServerDetailsInput = z.infer<typeof serverDetailsSchema>;
export type ConnectionInput = z.infer<ReturnType<typeof connectionSchema>>;

export const protocolSettingsSchema = z.array(
  z.object({
    protocolId: z.uuid(),
    enabled: z.boolean(),
    maxAccounts: z.number().int().min(1).max(100_000).nullable(),
    /** Creation quota per reset period; null = none; omitted = unchanged. */
    quotaLimit: z.number().int().min(1).max(100_000).nullable().optional(),
  }),
);
