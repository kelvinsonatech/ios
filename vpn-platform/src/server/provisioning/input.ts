import { z } from "zod";
import type { NormalizedAccountInput, ProtocolAdapter, ProtocolDefinition } from "./types";

const CONTROL = /[\u0000-\u001F\u007F]/;

/**
 * Build the validation schema for a protocol's dynamic form. Admin-defined field rules are applied
 * first, then the adapter's hard guards for well-known keys. Unknown keys are rejected.
 */
export function buildInputSchema(def: ProtocolDefinition, adapter: ProtocolAdapter) {
  const shape: Record<string, z.ZodType> = {};
  for (const f of def.fields) {
    let schema: z.ZodType;
    if (f.type === "duration") {
      schema = z.coerce
        .number({ error: "Choose a duration" })
        .int()
        .refine((v) => def.durationOptions.includes(v), "Choose one of the available durations");
    } else if (f.type === "select") {
      const values = f.options.map((o) => o.value);
      schema = z.string({ error: "Choose an option" }).refine((v) => values.includes(v), "Choose one of the options");
    } else if (f.type === "number") {
      let n = z.coerce.number({ error: "Enter a number" }).int();
      if (f.validation.min !== undefined) n = n.min(f.validation.min);
      if (f.validation.max !== undefined) n = n.max(f.validation.max);
      schema = n.transform(String);
    } else {
      let s = z.string({ error: `${f.label} is required` }).trim().max(Math.min(f.validation.maxLength ?? 128, 128), "Too long");
      if (f.required) s = s.min(Math.max(f.validation.minLength ?? 1, 1), f.validation.minLength ? `At least ${f.validation.minLength} characters` : `${f.label} is required`);
      else if (f.validation.minLength) s = s.min(f.validation.minLength, `At least ${f.validation.minLength} characters`);
      if (f.validation.pattern) s = s.regex(new RegExp(`^(?:${f.validation.pattern})$`), "Invalid format");
      schema = s.refine((v) => !CONTROL.test(v), "Contains invalid characters");
    }
    const guard = adapter.inputGuards[f.key];
    if (guard && f.type !== "duration") schema = (schema as z.ZodType<string>).pipe(guard);

    const fallback = f.defaultValue ?? undefined;
    shape[f.key] = f.required
      ? z.preprocess((v) => (v === undefined || v === null || v === "" ? fallback : v), schema)
      : z.preprocess((v) => (v === undefined || v === null || v === "" ? undefined : v), schema.optional());
  }
  return z.object(shape).strict();
}

export function toNormalizedInput(parsed: Record<string, unknown>, def: ProtocolDefinition): NormalizedAccountInput {
  const durationField = def.fields.find((f) => f.type === "duration");
  const options: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined || k === "username" || k === "password" || k === durationField?.key) continue;
    options[k] = String(v);
  }
  return {
    username: typeof parsed.username === "string" ? parsed.username : undefined,
    password: typeof parsed.password === "string" ? parsed.password : undefined,
    durationDays: durationField ? Number(parsed[durationField.key]) : def.defaultDurationDays,
    options,
  };
}
