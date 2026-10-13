import { z } from "zod";
import { protocolFieldType } from "@/server/db/schema";
import { PROTOCOL_ICON_NAMES } from "@/lib/protocol-icons";
import { hasAdapter } from "@/server/provisioning/adapters/registry";
import { normalizeIdentifier } from "./identifiers";

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

function isSafeRegex(p: string) {
  if (p.length > 200) return false;
  try {
    new RegExp(p);
  } catch {
    return false;
  }
  // Reject obvious catastrophic-backtracking shapes such as (a+)+ or (.*)*.
  return !/\([^)]*[+*][^)]*\)[+*{]/.test(p);
}

export const fieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/, "Lowercase letters, digits and _ (start with a letter)"),
    label: z.string().trim().min(1).max(64),
    type: z.enum(protocolFieldType.enumValues),
    required: z.boolean(),
    placeholder: nullableText(128),
    helpText: nullableText(256),
    options: z
      .array(z.object({ value: z.string().regex(/^[A-Za-z0-9_.-]{1,32}$/, "Invalid option value"), label: z.string().trim().min(1).max(64) }))
      .max(20)
      .default([]),
    validation: z
      .object({
        pattern: z
          .string()
          .max(200)
          .optional()
          .refine((p) => !p || isSafeRegex(p), "Invalid or unsafe regular expression"),
        minLength: z.number().int().min(0).max(128).optional(),
        maxLength: z.number().int().min(1).max(128).optional(),
        min: z.number().int().optional(),
        max: z.number().int().optional(),
      })
      .default({}),
    defaultValue: nullableText(128),
  })
  .superRefine((f, ctx) => {
    if (f.type === "select" && f.options.length === 0) ctx.addIssue({ code: "custom", path: ["options"], message: "Add at least one option" });
    if (f.validation.minLength !== undefined && f.validation.maxLength !== undefined && f.validation.minLength > f.validation.maxLength) {
      ctx.addIssue({ code: "custom", path: ["validation"], message: "Min length is greater than max length" });
    }
  });

export const outputFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/, "Lowercase letters, digits and _"),
  label: z.string().trim().min(1).max(64),
  kind: z.enum(["text", "secret", "uri", "multiline", "file"]),
  sensitive: z.boolean(),
  copyable: z.boolean(),
  hidden: z.boolean().optional(),
  path: z
    .string()
    .regex(/^[A-Za-z0-9_]+(\.[A-Za-z0-9_]+){0,5}$/, "Dot path like ports.tcp")
    .optional(),
  qr: z.boolean().optional(),
  filename: z
    .string()
    .regex(/^[A-Za-z0-9_.{}-]{1,64}$/, "Invalid filename")
    .optional(),
});

export const protocolSchema = z
  .object({
    name: z.string().trim().min(2).max(48),
    slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,47}$/, "Lowercase letters, digits and -"),
    description: z.string().trim().max(300).default(""),
    icon: z.enum(PROTOCOL_ICON_NAMES),
    category: z.enum(["ssh", "v2ray", "vpn", "proxy"]),
    adapterKey: z.string().refine(hasAdapter, "Unknown adapter"),
    nodeIdentifiers: z
      .array(z.string().trim().min(1).max(64))
      .max(20)
      .transform((ids) => [...new Set(ids.map(normalizeIdentifier).filter(Boolean))]),
    enabled: z.boolean(),
    displayOrder: z.number().int().min(0).max(10_000),
    durationOptions: z
      .array(z.number().int().min(1).max(365))
      .min(1, "Add at least one duration")
      .max(10)
      .transform((d) => [...new Set(d)].sort((a, b) => a - b)),
    defaultDurationDays: z.number().int().min(1).max(365),
    maxAccountsPerIpPerDay: z.number().int().min(1).max(1000),
    fields: z.array(fieldSchema).max(12),
    outputFields: z.array(outputFieldSchema).max(40),
  })
  .superRefine((p, ctx) => {
    if (!p.durationOptions.includes(p.defaultDurationDays)) {
      ctx.addIssue({ code: "custom", path: ["defaultDurationDays"], message: "Default duration must be one of the options" });
    }
    const keys = p.fields.map((f) => f.key);
    if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["fields"], message: "Field keys must be unique" });
    if (p.fields.filter((f) => f.type === "duration").length > 1) {
      ctx.addIssue({ code: "custom", path: ["fields"], message: "Only one duration field is allowed" });
    }
    const outKeys = p.outputFields.map((f) => f.key);
    if (new Set(outKeys).size !== outKeys.length) ctx.addIssue({ code: "custom", path: ["outputFields"], message: "Output keys must be unique" });
  });

export type ProtocolInput = z.infer<typeof protocolSchema>;
