import { describe, expect, it } from "vitest";
import { formatLocalTime, quotaWindow, startOfLocalDay, zonedWallTimeToInstant } from "@/server/provisioning/quota";

const iso = (w: { start: Date; end: Date }) => ({ start: w.start.toISOString(), end: w.end.toISOString() });
const at = (s: string) => new Date(s);

describe("quotaWindow", () => {
  it("one reset time in UTC", () => {
    expect(iso(quotaWindow(at("2026-05-10T15:20:00Z"), ["00:00"], "UTC"))).toEqual({
      start: "2026-05-10T00:00:00.000Z",
      end: "2026-05-11T00:00:00.000Z",
    });
  });

  it("several reset times in UTC", () => {
    const times = ["00:00", "12:00"];
    expect(iso(quotaWindow(at("2026-05-10T11:59:59Z"), times, "UTC"))).toEqual({
      start: "2026-05-10T00:00:00.000Z",
      end: "2026-05-10T12:00:00.000Z",
    });
    expect(iso(quotaWindow(at("2026-05-10T18:00:00Z"), times, "UTC"))).toEqual({
      start: "2026-05-10T12:00:00.000Z",
      end: "2026-05-11T00:00:00.000Z",
    });
  });

  it("now exactly at a reset starts the new window", () => {
    expect(iso(quotaWindow(at("2026-05-10T12:00:00Z"), ["00:00", "12:00"], "UTC"))).toEqual({
      start: "2026-05-10T12:00:00.000Z",
      end: "2026-05-11T00:00:00.000Z",
    });
    expect(iso(quotaWindow(at("2026-05-10T00:00:00Z"), ["00:00"], "UTC"))).toEqual({
      start: "2026-05-10T00:00:00.000Z",
      end: "2026-05-11T00:00:00.000Z",
    });
  });

  it("unsorted and duplicated input gives the same result", () => {
    const now = at("2026-05-10T07:00:00Z");
    expect(iso(quotaWindow(now, ["18:00", "06:00", "12:00", "06:00"], "UTC"))).toEqual(iso(quotaWindow(now, ["06:00", "12:00", "18:00"], "UTC")));
    expect(iso(quotaWindow(now, ["18:00", "06:00", "12:00"], "UTC"))).toEqual({
      start: "2026-05-10T06:00:00.000Z",
      end: "2026-05-10T12:00:00.000Z",
    });
  });

  it("Asia/Bangkok (UTC+7, no DST)", () => {
    const times = ["00:00", "12:00"];
    // 2026-05-10 03:00 local = 2026-05-09T20:00Z → window 00:00..12:00 local (09T17:00Z..10T05:00Z)
    expect(iso(quotaWindow(at("2026-05-09T20:00:00Z"), times, "Asia/Bangkok"))).toEqual({
      start: "2026-05-09T17:00:00.000Z",
      end: "2026-05-10T05:00:00.000Z",
    });
    // 16:59 local on 2026-05-09 → 12:00..24:00 local
    expect(iso(quotaWindow(at("2026-05-09T09:59:00Z"), times, "Asia/Bangkok"))).toEqual({
      start: "2026-05-09T05:00:00.000Z",
      end: "2026-05-09T17:00:00.000Z",
    });
    // Exactly at local midnight
    expect(quotaWindow(at("2026-05-09T17:00:00Z"), times, "Asia/Bangkok").start.toISOString()).toBe("2026-05-09T17:00:00.000Z");
  });

  it("crosses the year boundary", () => {
    // 2027-01-01 06:30 local: the last 12:00 was on 31 December.
    expect(iso(quotaWindow(at("2026-12-31T23:30:00Z"), ["12:00"], "Asia/Bangkok"))).toEqual({
      start: "2026-12-31T05:00:00.000Z",
      end: "2027-01-01T05:00:00.000Z",
    });
    expect(iso(quotaWindow(at("2026-12-31T23:30:00Z"), ["00:00"], "Asia/Bangkok"))).toEqual({
      start: "2026-12-31T17:00:00.000Z",
      end: "2027-01-01T17:00:00.000Z",
    });
    expect(iso(quotaWindow(at("2027-01-01T00:30:00Z"), ["06:00"], "UTC"))).toEqual({
      start: "2026-12-31T06:00:00.000Z",
      end: "2027-01-01T06:00:00.000Z",
    });
  });

  describe("Europe/Berlin across DST (2026-03-29 and 2026-10-25)", () => {
    const tz = "Europe/Berlin";

    it("March: the day before the transition is CET (+1)", () => {
      expect(iso(quotaWindow(at("2026-03-28T10:00:00Z"), ["00:00"], tz))).toEqual({
        start: "2026-03-27T23:00:00.000Z",
        end: "2026-03-28T23:00:00.000Z",
      });
    });

    it("March: the transition day is 23 hours long", () => {
      const w = quotaWindow(at("2026-03-29T12:00:00Z"), ["00:00"], tz);
      expect(iso(w)).toEqual({ start: "2026-03-28T23:00:00.000Z", end: "2026-03-29T22:00:00.000Z" });
      expect(w.end.getTime() - w.start.getTime()).toBe(23 * 3_600_000);
    });

    it("March: a reset inside the skipped hour happens right after the gap", () => {
      // 02:30 does not exist on 2026-03-29 (02:00 CET → 03:00 CEST); it resolves to 03:30 CEST = 01:30Z.
      expect(new Date(zonedWallTimeToInstant(Date.UTC(2026, 2, 29, 2, 30), tz)).toISOString()).toBe("2026-03-29T01:30:00.000Z");
      expect(iso(quotaWindow(at("2026-03-29T01:00:00Z"), ["02:30"], tz))).toEqual({
        start: "2026-03-28T01:30:00.000Z",
        end: "2026-03-29T01:30:00.000Z",
      });
    });

    it("March: reset times on both sides of the gap stay ordered", () => {
      const times = ["00:00", "03:00", "12:00"];
      expect(iso(quotaWindow(at("2026-03-29T00:30:00Z"), times, tz))).toEqual({
        start: "2026-03-28T23:00:00.000Z",
        end: "2026-03-29T01:00:00.000Z", // 03:00 CEST
      });
      expect(iso(quotaWindow(at("2026-03-29T05:00:00Z"), times, tz))).toEqual({
        start: "2026-03-29T01:00:00.000Z",
        end: "2026-03-29T10:00:00.000Z", // 12:00 CEST
      });
    });

    it("October: the transition day is 25 hours long", () => {
      const w = quotaWindow(at("2026-10-25T12:00:00Z"), ["00:00"], tz);
      expect(iso(w)).toEqual({ start: "2026-10-24T22:00:00.000Z", end: "2026-10-25T23:00:00.000Z" });
      expect(w.end.getTime() - w.start.getTime()).toBe(25 * 3_600_000);
    });

    it("October: a repeated local time resets at its first occurrence", () => {
      // 02:30 happens twice on 2026-10-25: 00:30Z (CEST) and 01:30Z (CET).
      expect(new Date(zonedWallTimeToInstant(Date.UTC(2026, 9, 25, 2, 30), tz)).toISOString()).toBe("2026-10-25T00:30:00.000Z");
      expect(iso(quotaWindow(at("2026-10-25T01:00:00Z"), ["02:30"], tz))).toEqual({
        start: "2026-10-25T00:30:00.000Z",
        end: "2026-10-26T01:30:00.000Z",
      });
    });

    it("October: two daily resets around the change", () => {
      const times = ["12:00", "00:00"];
      expect(iso(quotaWindow(at("2026-10-24T23:00:00Z"), times, tz))).toEqual({
        start: "2026-10-24T22:00:00.000Z", // 00:00 CEST
        end: "2026-10-25T11:00:00.000Z", // 12:00 CET
      });
      expect(iso(quotaWindow(at("2026-10-25T11:00:00Z"), times, tz))).toEqual({
        start: "2026-10-25T11:00:00.000Z",
        end: "2026-10-25T23:00:00.000Z",
      });
    });
  });

  it("windows are contiguous: the end of one is the start of the next", () => {
    const times = ["00:00", "08:00", "16:00"];
    let now = at("2026-03-27T00:00:00Z");
    for (let i = 0; i < 20; i++) {
      const w = quotaWindow(now, times, "Europe/Berlin");
      expect(w.start.getTime()).toBeLessThanOrEqual(now.getTime());
      expect(w.end.getTime()).toBeGreaterThan(now.getTime());
      const next = quotaWindow(w.end, times, "Europe/Berlin");
      expect(next.start.getTime()).toBe(w.end.getTime());
      now = w.end;
    }
  });

  it("falls back to midnight when no valid reset time is given", () => {
    expect(iso(quotaWindow(at("2026-05-10T15:00:00Z"), ["bogus"], "UTC"))).toEqual({
      start: "2026-05-10T00:00:00.000Z",
      end: "2026-05-11T00:00:00.000Z",
    });
  });

  it("helpers: start of local day and local time formatting", () => {
    expect(startOfLocalDay(at("2026-05-09T20:00:00Z"), "Asia/Bangkok").toISOString()).toBe("2026-05-09T17:00:00.000Z");
    expect(formatLocalTime(at("2026-05-10T05:00:00Z"), "Asia/Bangkok")).toBe("12:00");
    expect(formatLocalTime(at("2026-05-09T17:00:00Z"), "Asia/Bangkok")).toBe("00:00");
  });
});
