import { describe, expect, it } from "vitest";
import { redact } from "@/server/logging/redact";

describe("log redaction", () => {
  it("removes secrets at any depth", () => {
    const out = redact({
      username: "alice",
      password: "hunter2",
      nested: { api_key: "k", privateKey: "p", config_text: "[Interface]", ok: 1 },
      list: [{ token: "t", host: "h" }],
      uuid: "c0ffee",
    });
    expect(out).toEqual({
      username: "alice",
      password: "[REDACTED]",
      nested: { api_key: "[REDACTED]", privateKey: "[REDACTED]", config_text: "[REDACTED]", ok: 1 },
      list: [{ token: "[REDACTED]", host: "h" }],
      uuid: "[REDACTED]",
    });
  });
  it("truncates long strings", () => {
    expect(String(redact("x".repeat(2000))).length).toBeLessThan(600);
  });
});
