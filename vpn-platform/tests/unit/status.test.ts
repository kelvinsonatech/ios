import { describe, expect, it } from "vitest";
import { computeServerStatus } from "@/server/servers/status";

const base = { lifecycle: "active", healthStatus: "online", compatibility: "compatible", currentAccounts: 1, maxAccounts: 10 } as const;

describe("effective server status", () => {
  it.each([
    [{ lifecycle: "draft" }, "pending"],
    [{ lifecycle: "disabled" }, "disabled"],
    [{ lifecycle: "maintenance", healthStatus: "offline" }, "maintenance"],
    [{ healthStatus: "offline" }, "offline"],
    [{ healthStatus: "unknown" }, "offline"],
    [{ compatibility: "unsupported" }, "offline"],
    [{ currentAccounts: 10 }, "full"],
    [{ healthStatus: "degraded" }, "online"],
    [{ compatibility: "outdated" }, "online"],
    [{}, "online"],
  ] as const)("%o → %s", (override, expected) => {
    expect(computeServerStatus({ ...base, ...override })).toBe(expected);
  });
});
