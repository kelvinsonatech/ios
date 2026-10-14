import { describe, expect, it } from "vitest";
import { formatCountdown, formatOffset, resetSchedule, zonedTimeToUtc, zoneOffsetMs } from "@/app/admin/(panel)/settings/schedule";

const at = (iso: string) => new Date(iso).getTime();

describe("quota reset schedule (settings preview)", () => {
  it("finds the window and next reset in UTC", () => {
    const s = resetSchedule(["00:00", "12:00"], "UTC", at("2026-10-14T08:48:00Z"))!;
    expect(s.windowStart.toISOString()).toBe("2026-10-14T00:00:00.000Z");
    expect(s.nextReset.toISOString()).toBe("2026-10-14T12:00:00.000Z");
  });
  it("rolls over to the next day after the last reset", () => {
    const s = resetSchedule(["00:00", "12:00"], "UTC", at("2026-10-14T23:30:00Z"))!;
    expect(s.windowStart.toISOString()).toBe("2026-10-14T12:00:00.000Z");
    expect(s.nextReset.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
  it("treats an exact reset instant as the start of a new window", () => {
    const s = resetSchedule(["06:00"], "UTC", at("2026-10-14T06:00:00Z"))!;
    expect(s.windowStart.toISOString()).toBe("2026-10-14T06:00:00.000Z");
    expect(s.nextReset.toISOString()).toBe("2026-10-15T06:00:00.000Z");
  });
  it("interprets reset times in the configured time zone", () => {
    // 00:00 in Bangkok (UTC+7) is 17:00 UTC the day before.
    const s = resetSchedule(["00:00"], "Asia/Bangkok", at("2026-10-14T10:00:00Z"))!;
    expect(s.windowStart.toISOString()).toBe("2026-10-13T17:00:00.000Z");
    expect(s.nextReset.toISOString()).toBe("2026-10-14T17:00:00.000Z");
  });
  it("handles daylight saving changes", () => {
    // Berlin switches from UTC+2 to UTC+1 on 2026-10-25.
    expect(zonedTimeToUtc(2026, 10, 24, 0, 0, "Europe/Berlin")).toBe(at("2026-10-23T22:00:00Z"));
    expect(zonedTimeToUtc(2026, 10, 26, 0, 0, "Europe/Berlin")).toBe(at("2026-10-25T23:00:00Z"));
    expect(zoneOffsetMs(at("2026-07-01T00:00:00Z"), "Europe/Berlin")).toBe(2 * 3_600_000);
  });
  it("returns null without reset times or with an unknown zone", () => {
    expect(resetSchedule([], "UTC")).toBeNull();
    expect(resetSchedule(["00:00"], "Mars/Olympus")).toBeNull();
  });
  it("formats countdowns and offsets", () => {
    expect(formatCountdown(3 * 3_600_000 + 12 * 60_000 + 30_000)).toBe("3 h 12 min");
    expect(formatCountdown(45 * 60_000)).toBe("45 min");
    expect(formatCountdown(2 * 3_600_000)).toBe("2 h");
    expect(formatCountdown(10_000)).toBe("under a minute");
    expect(formatOffset(7 * 3_600_000)).toBe("UTC+07:00");
    expect(formatOffset(-(3 * 3_600_000 + 30 * 60_000))).toBe("UTC-03:30");
  });
});
