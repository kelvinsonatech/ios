import { describe, expect, it } from "vitest";
import { accountText, groupItems, resultItems } from "@/components/public/account/account-sections";
import { ApiError, NetworkError } from "@/components/public/account/api";
import { safeFilename } from "@/components/public/account/browser-actions";
import { friendlyError, normalizeFieldErrors } from "@/components/public/account/errors";
import {
  generatePassword,
  initialValues,
  newIdempotencyKey,
  normalizeInput,
  toRequestInput,
  validateAll,
  validateField,
} from "@/components/public/account/form-validation";
import { decodeTarget, encodeTarget, initialTarget, reportOptionsFromStatus, targetLabel } from "@/components/public/report/report-target";
import type { PublicAccountResult, PublicFormField, PublicProtocolDetail, StatusPageData } from "@/lib/public/types";

/** Client-side helpers of the account creation, result and report UI (pure functions only). */

function field(key: string, type: PublicFormField["type"], extra: Partial<PublicFormField> = {}): PublicFormField {
  return { key, label: key, type, required: true, placeholder: null, helpText: null, options: [], validation: {}, defaultValue: null, ...extra };
}

/** Field definitions as the catalogue serves them for the owner's protocols. */
const USERNAME = field("username", "text", { label: "Username", validation: { minLength: 3, maxLength: 32 } });
const PASSWORD = field("password", "password", { label: "Password", validation: { minLength: 6, maxLength: 32 } });
const DURATION = field("duration", "duration", { label: "Duration" });
const TRANSPORT = field("transport", "select", { options: [{ value: "ws", label: "WebSocket" }, { value: "grpc", label: "gRPC" }], defaultValue: "ws" });
const SNI_BUG = field("sni_bug", "text", { required: false, validation: { maxLength: 128 } });
const SNI_TYPE = field("sni_type", "select", { required: false, options: [{ value: "sni", label: "SNI" }, { value: "address", label: "Address" }], defaultValue: "sni" });

function protocol(slug: string, category: string, fields: PublicFormField[]): PublicProtocolDetail {
  return {
    slug,
    name: slug.toUpperCase(),
    description: "",
    icon: "shield",
    category,
    serverCount: 1,
    availableCount: 1,
    countries: [],
    durationOptions: [3, 7, 14, 30],
    defaultDurationDays: 7,
    href: `/${slug}`,
    fields,
  };
}

const SSH = protocol("ssh", "ssh", [USERNAME, PASSWORD, DURATION]);
const VLESS = protocol("vless", "v2ray", [USERNAME, TRANSPORT, SNI_BUG, SNI_TYPE, DURATION]);

/** Mirrors passwordGuard in src/server/provisioning/adapters/guards.ts. */
const SERVER_PASSWORD = /^[A-Za-z0-9@#%^*_+=.,:~-]{6,32}$/;

describe("account form validation (mirrors the server guards)", () => {
  it("applies Linux account rules to SSH-family usernames", () => {
    expect(validateField(USERNAME, "nomad_rider", SSH)).toBeNull();
    expect(validateField(USERNAME, "1abc", SSH)).toMatch(/start with a letter/i);
    expect(validateField(USERNAME, "ab", SSH)).toMatch(/at least 3/);
    expect(validateField(USERNAME, "kopi-o", SSH)).toMatch(/lowercase letters, digits or _/);
    expect(validateField(USERNAME, "", SSH)).toMatch(/required/);
    expect(validateField(USERNAME, "a".repeat(33), SSH)).toMatch(/at most 32/);
  });

  it("uses the node API's username rule for V2Ray-family protocols too", () => {
    expect(validateField(USERNAME, "kopi_o", VLESS)).toBeNull();
    expect(validateField(USERNAME, "liberty.run", VLESS)).toMatch(/lowercase letters, digits or _/);
    expect(validateField(USERNAME, "1dash", VLESS)).toMatch(/Start with a letter/);
  });

  it("checks passwords, durations and selects", () => {
    expect(validateField(PASSWORD, "Sunrise-2026", SSH)).toBeNull();
    expect(validateField(PASSWORD, "short", SSH)).toMatch(/at least 6/);
    expect(validateField(PASSWORD, "it's-mine", SSH)).toMatch(/no spaces or quotes/);
    expect(validateField(DURATION, "7", SSH)).toBeNull();
    expect(validateField(DURATION, "5", SSH)).not.toBeNull();
    expect(validateField(TRANSPORT, "grpc", VLESS)).toBeNull();
    expect(validateField(TRANSPORT, "tcp", VLESS)).not.toBeNull();
    expect(validateField(SNI_TYPE, "", VLESS)).toBeNull();
  });

  it("accepts plain bug hosts only", () => {
    expect(validateField(SNI_BUG, "cdn.example.com", VLESS)).toBeNull();
    expect(validateField(SNI_BUG, "", VLESS)).toBeNull();
    for (const bad of ["http://cdn.example.com", "cdn.example.com/path", "localhost", "a b.com"]) {
      expect(validateField(SNI_BUG, bad, VLESS), bad).not.toBeNull();
    }
  });

  it("honours admin-defined number limits and patterns", () => {
    const port = field("port", "number", { validation: { min: 1, max: 65535 } });
    expect(validateField(port, "443", SSH)).toBeNull();
    expect(validateField(port, "0", SSH)).toMatch(/at least 1/);
    expect(validateField(port, "4.5", SSH)).toMatch(/whole number/);
    const code = field("code", "text", { validation: { pattern: "[A-Z]{3}" } });
    expect(validateField(code, "ABC", SSH)).toBeNull();
    expect(validateField(code, "ABCD", SSH)).not.toBeNull();
  });

  it("normalises while typing: lowercase usernames and bug hosts, no whitespace", () => {
    expect(normalizeInput(USERNAME, "Nomad Rider\n")).toBe("nomadrider");
    expect(normalizeInput(SNI_BUG, "CDN.Example.com ")).toBe("cdn.example.com");
    expect(normalizeInput(PASSWORD, "Pass word\t1")).toBe("Password1");
  });

  it("preselects defaults and only sends filled fields", () => {
    const values = initialValues(VLESS);
    expect(values).toEqual({ username: "", transport: "ws", sni_bug: "", sni_type: "sni", duration: "7" });
    expect(validateAll(VLESS.fields, { ...values, username: "kopi_o" }, VLESS)).toEqual({});
    expect(toRequestInput(VLESS.fields, { ...values, username: " kopi_o " })).toEqual({ username: "kopi_o", transport: "ws", sni_type: "sni", duration: "7" });
  });
});

describe("password generator and idempotency keys", () => {
  it("generates passwords the server accepts", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generatePassword(PASSWORD);
      expect(pw).toMatch(SERVER_PASSWORD);
      expect(validateField(PASSWORD, pw, SSH)).toBeNull();
    }
  });

  it("respects an admin pattern and length limits", () => {
    const digitsOnly = field("pin", "password", { validation: { minLength: 8, maxLength: 10, pattern: "[a-z0-9]+" } });
    for (let i = 0; i < 50; i++) {
      const pw = generatePassword(digitsOnly);
      expect(pw).toMatch(/^[a-z0-9]{8,10}$/);
    }
  });

  it("builds keys matching the API contract", () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
    for (const k of keys) expect(k).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
  });
});

describe("friendly API errors", () => {
  const ctx = { protocolName: "VLESS", serverName: "Germany 01" };

  it("explains quota, rate limit and capacity errors", () => {
    const quota = friendlyError(new ApiError(409, "QUOTA_REACHED", "x", { resetsAt: "2026-10-15T17:00:00.000Z" }), ctx);
    expect(quota).toMatchObject({ code: "QUOTA_REACHED", resetsAt: "2026-10-15T17:00:00.000Z", suggestOtherServer: true });
    const limited = friendlyError(new ApiError(429, "RATE_LIMITED", "x", { retryAfterSeconds: 30 }), ctx);
    expect(Date.parse(limited.retryAt!)).toBeGreaterThan(Date.now());
    expect(limited.title).toMatch(/slow down/i);
    const daily = friendlyError(
      new ApiError(429, "RATE_LIMITED", "You have reached today's limit of 3 SSH accounts.", { retryAfterSeconds: 36_000, limitScope: "daily" }),
      ctx,
    );
    expect(daily).toMatchObject({ title: "Daily limit reached", message: "You have reached today's limit of 3 SSH accounts." });
    expect(friendlyError(new ApiError(409, "CAPACITY_REACHED", "x"), ctx).message).toContain("Germany 01");
    expect(friendlyError(new ApiError(403, "CAPTCHA_FAILED", "x"), ctx).title).toMatch(/security check/i);
  });

  it("handles network failures, server errors and unknown codes", () => {
    expect(friendlyError(new NetworkError(), ctx).code).toBe("NETWORK");
    expect(friendlyError(new ApiError(503, "SOMETHING", "internal detail"), ctx).message).not.toContain("internal detail");
    expect(friendlyError(new ApiError(409, "NEW_CODE", "Readable reason."), ctx).message).toBe("Readable reason.");
    expect(friendlyError(new Error("boom"), ctx).code).toBe("UNKNOWN");
  });

  it("maps server field errors to form fields", () => {
    const r = normalizeFieldErrors({ "input.username": ["This username is reserved."], password: ["Too short."], serverId: ["Invalid."] }, ["username", "password"]);
    expect(r.byField).toEqual({ username: "This username is reserved.", password: "Too short." });
    expect(r.other).toEqual(["Invalid."]);
  });
});

describe("account result presentation", () => {
  const account: PublicAccountResult = {
    protocol: { slug: "vless", name: "VLESS" },
    server: { id: "s1", name: "Germany 01" },
    username: "kopi-o",
    expiresAt: "2026-10-22T10:00:00.000Z",
    avatar: "data:image/svg+xml;utf8,<svg/>",
    fields: [
      { key: "username", label: "Remark", kind: "text", value: "kopi-o", sensitive: false, copyable: true, qr: false },
      { key: "uuid", label: "UUID", kind: "secret", value: "0b6c-secret", sensitive: true, copyable: true, qr: false },
      { key: "host", label: "Domain", kind: "text", value: "de1.example.test", sensitive: false, copyable: true, qr: false },
      { key: "empty", label: "Empty", kind: "text", value: "", sensitive: false, copyable: true, qr: false },
      { key: "payload", label: "Payload", kind: "multiline", value: "GET / HTTP/1.1", sensitive: false, copyable: true, qr: false },
    ],
    artifacts: [
      { key: "link_ws", label: "VLESS WS", kind: "uri", content: "vless://0b6c-secret@de1.example.test:443", qr: true, sensitive: true },
      { key: "clash", label: "Clash profile", kind: "file", content: "proxies:\n  - name: x\n", filename: "clash.yaml", qr: false, sensitive: true },
    ],
  };

  it("groups fields and artifacts and drops empty values", () => {
    const groups = groupItems(resultItems(account));
    expect(groups.map((g) => [g.key, g.items.map((i) => i.label)])).toEqual([
      ["credentials", ["Remark", "UUID"]],
      ["connection", ["Domain"]],
      ["links", ["VLESS WS"]],
      ["config", ["Payload"]],
      ["files", ["Clash profile"]],
    ]);
  });

  it("exports plain text, with file contents only on request", () => {
    const short = accountText(account, { siteName: "Vaultline", expiresLabel: "Oct 22", withFiles: false });
    expect(short).toContain("UUID: 0b6c-secret");
    expect(short).toContain("vless://0b6c-secret@de1.example.test:443");
    expect(short).not.toContain("proxies:");
    const full = accountText(account, { siteName: "Vaultline", expiresLabel: "Oct 22", withFiles: true });
    expect(full).toContain("----- clash.yaml -----\nproxies:\n  - name: x");
  });

  it("builds safe download names", () => {
    expect(safeFilename("Vaultline-vless-kopi-o")).toBe("Vaultline-vless-kopi-o");
    expect(safeFilename("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFilename("???", "account")).toBe("account");
  });
});

describe("report form targets", () => {
  const sid = "5a87a706-5a57-4b26-95e1-8717d03ca8bc";
  const status = {
    generatedAt: "2026-10-15T10:00:00.000Z",
    totals: { protocols: 1, servers: 1, online: 1, offline: 0, maintenance: 0, full: 0 },
    sections: [
      {
        protocol: { slug: "ssh-ssl", name: "SSH SSL", icon: "lock", href: "/ssh-ssl" },
        servers: [{ id: sid, name: "Germany 01", city: "Frankfurt", country: { code: "DE", slug: "germany", name: "Germany" } }],
      },
    ],
  } as unknown as StatusPageData;
  const options = reportOptionsFromStatus(status);

  it("lists servers per protocol with their location", () => {
    expect(options).toEqual([{ protocol: { slug: "ssh-ssl", name: "SSH SSL" }, servers: [{ id: sid, name: "Germany 01", location: "Frankfurt, Germany" }] }]);
    expect(reportOptionsFromStatus(null)).toEqual([]);
  });

  it("preselects only listed choices from the query string", () => {
    expect(initialTarget(options, sid, "ssh-ssl")).toBe(encodeTarget("ssh-ssl", sid));
    expect(initialTarget(options, sid, null)).toBe(encodeTarget("ssh-ssl", sid));
    expect(initialTarget(options, "00000000-0000-4000-8000-000000000000", "ssh-ssl")).toBe("ssh-ssl|");
    expect(initialTarget(options, null, "vless")).toBe("");
    expect(targetLabel(options, encodeTarget("ssh-ssl", sid))).toBe("SSH SSL · Germany 01");
    expect(targetLabel(options, "ssh-ssl|")).toBe("Any SSH SSL server");
  });

  it("decodes only well-formed values", () => {
    expect(decodeTarget(`ssh-ssl|${sid}`)).toEqual({ protocol: "ssh-ssl", serverId: sid });
    expect(decodeTarget("")).toEqual({ protocol: null, serverId: null });
    expect(decodeTarget("SSH SSL|not-a-uuid")).toEqual({ protocol: null, serverId: null });
  });
});
