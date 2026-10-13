import { describe, expect, it } from "vitest";
import { evaluateCompatibility } from "@/server/nodes/compatibility";

describe("node version compatibility", () => {
  it("accepts the current API and script", () => {
    expect(evaluateCompatibility("1.0", "1.0.0", "1.0.0").compatibility).toBe("compatible");
  });
  it("flags an outdated script", () => {
    const r = evaluateCompatibility("1.0", "0.9.2", "1.0.0");
    expect(r.compatibility).toBe("outdated");
    expect(r.reasons[0]).toMatch(/older than the latest/);
  });
  it("rejects another major API version", () => {
    expect(evaluateCompatibility("2.0", "2.0.0", "1.0.0").compatibility).toBe("unsupported");
    expect(evaluateCompatibility("garbage", "1", "1.0.0").compatibility).toBe("unsupported");
  });
  it("is unknown before the first contact", () => {
    expect(evaluateCompatibility(null, null, "1.0.0").compatibility).toBe("unknown");
  });
});
