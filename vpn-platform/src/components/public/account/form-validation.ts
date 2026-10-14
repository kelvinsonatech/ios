import type { PublicFormField, PublicProtocolDetail } from "@/lib/public/types";

/**
 * Client-side checks mirroring the backend's field validation (src/server/provisioning/input.ts):
 * they only give instant feedback. The server stays authoritative and its fieldErrors win.
 */

const CONTROL = /[\u0000-\u001F\u007F]/;
/** Characters the backend accepts in usernames / remarks / passwords (adapter hard guards). */
const USERNAME_CHARS = /^[a-z0-9_.-]*$/;
const PASSWORD_CHARS = /^[A-Za-z0-9@#%^*_+=.,:~-]*$/;
const HOST_CHARS = /^[A-Za-z0-9._-]*$/;

export function isAdvancedField(f: PublicFormField): boolean {
  return f.key.startsWith("sni_");
}

export function initialValues(protocol: PublicProtocolDetail): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of protocol.fields) {
    if (f.type === "duration") {
      const d = protocol.durationOptions.includes(protocol.defaultDurationDays) ? protocol.defaultDurationDays : protocol.durationOptions[0];
      out[f.key] = d !== undefined ? String(d) : "";
    } else if (f.type === "select") {
      const def = f.defaultValue && f.options.some((o) => o.value === f.defaultValue) ? f.defaultValue : null;
      out[f.key] = def ?? (f.required ? (f.options[0]?.value ?? "") : "");
    } else {
      out[f.key] = f.defaultValue ?? "";
    }
  }
  return out;
}

/** Normalise while typing: usernames are lowercase, nothing may contain line breaks. */
export function normalizeInput(f: PublicFormField, value: string): string {
  let v = value.replace(/[\r\n\t]/g, "");
  if (f.key === "username") v = v.toLowerCase().replace(/\s/g, "");
  if (f.type === "password" || f.key === "sni_bug") v = v.replace(/\s/g, "");
  return v;
}

function compilePattern(pattern: string | undefined): RegExp | null {
  if (!pattern) return null;
  try {
    return new RegExp(`^(?:${pattern})$`);
  } catch {
    return null;
  }
}

/** First problem with a value, or null when it looks fine. */
export function validateField(f: PublicFormField, raw: string, protocol: Pick<PublicProtocolDetail, "durationOptions">): string | null {
  const value = f.type === "password" ? raw : raw.trim();
  if (f.type === "duration") {
    return protocol.durationOptions.includes(Number(value)) ? null : "Choose how long the account should last.";
  }
  if (f.type === "select") {
    if (!value) return f.required ? "Choose an option." : null;
    return f.options.some((o) => o.value === value) ? null : "Choose one of the options.";
  }
  if (!value) return f.required ? `${f.label} is required.` : null;
  if (f.type === "number") {
    if (!/^-?\d+$/.test(value)) return "Enter a whole number.";
    const n = Number(value);
    if (f.validation.min !== undefined && n < f.validation.min) return `Must be at least ${f.validation.min}.`;
    if (f.validation.max !== undefined && n > f.validation.max) return `Must be at most ${f.validation.max}.`;
    return null;
  }
  if (CONTROL.test(value)) return "Contains invalid characters.";
  const min = f.validation.minLength;
  const max = Math.min(f.validation.maxLength ?? 128, 128);
  if (min !== undefined && value.length < min) return `Use at least ${min} characters.`;
  if (value.length > max) return `Use at most ${max} characters.`;
  if (f.key === "username" && !USERNAME_CHARS.test(value)) return "Use lowercase letters, digits, _ . or - (no spaces).";
  if (f.type === "password" && !PASSWORD_CHARS.test(value)) return "Use letters, digits and @ # % ^ * _ + = . , : ~ - (no spaces or quotes).";
  if (f.key === "sni_bug" && !HOST_CHARS.test(value)) return "Use a host name such as cdn.example.com.";
  const re = compilePattern(f.validation.pattern);
  if (re && !re.test(value)) return "This format isn't accepted.";
  return null;
}

export function validateAll(
  fields: PublicFormField[],
  values: Record<string, string>,
  protocol: Pick<PublicProtocolDetail, "durationOptions">,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const e = validateField(f, values[f.key] ?? "", protocol);
    if (e) errors[f.key] = e;
  }
  return errors;
}

/** Only send fields that have a value; optional empty ones are left out. */
export function toRequestInput(fields: PublicFormField[], values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = f.type === "password" ? (values[f.key] ?? "") : (values[f.key] ?? "").trim();
    if (v !== "") out[f.key] = v;
  }
  return out;
}

function randomInt(maxExclusive: number): number {
  // Rejection sampling: no modulo bias.
  const limit = Math.floor(0x1_0000_0000 / maxExclusive) * maxExclusive;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    const n = buf[0]!;
    if (n < limit) return n % maxExclusive;
  }
}

const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "@#%_-+=";

function build(length: number, sets: string[]): string {
  const all = sets.join("");
  const chars = sets.map((s) => s[randomInt(s.length)]!);
  while (chars.length < length) chars.push(all[randomInt(all.length)]!);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("").slice(0, length);
}

/** Strong random password that satisfies the field's length and pattern rules (unambiguous characters). */
export function generatePassword(f: PublicFormField): string {
  const min = Math.max(f.validation.minLength ?? 8, 4);
  const max = Math.max(Math.min(f.validation.maxLength ?? 32, 64), min);
  const length = Math.min(Math.max(16, min), max);
  const re = compilePattern(f.validation.pattern);
  const candidates = [[LOWER, UPPER, DIGITS, SYMBOLS], [LOWER, UPPER, DIGITS], [LOWER, DIGITS]];
  for (const sets of candidates) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const pw = build(length, sets);
      if (!re || re.test(pw)) return pw;
    }
  }
  return build(length, [LOWER, DIGITS]);
}

/** Idempotency key: 32 random hex chars (matches ^[A-Za-z0-9_-]{16,64}$). */
export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID().replace(/-/g, "");
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
