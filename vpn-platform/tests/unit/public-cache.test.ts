import { beforeEach, describe, expect, it, vi } from "vitest";
import { cached, clearPublicCache } from "@/server/public/cache";

describe("public catalogue cache", () => {
  beforeEach(() => clearPublicCache());

  it("reuses a result within the TTL and shares one in-flight load", async () => {
    const load = vi.fn(async () => 42);
    const [a, b] = await Promise.all([cached("k", 10_000, load), cached("k", 10_000, load)]);
    expect([a, b]).toEqual([42, 42]);
    expect(await cached("k", 10_000, load)).toBe(42);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL and never caches errors", async () => {
    vi.useFakeTimers();
    try {
      const load = vi.fn(async () => Date.now());
      await cached("t", 1_000, load);
      vi.advanceTimersByTime(1_001);
      await cached("t", 1_000, load);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
    const failing = vi.fn(async () => {
      throw new Error("db down");
    });
    await expect(cached("e", 10_000, failing)).rejects.toThrow("db down");
    await expect(cached("e", 10_000, failing)).rejects.toThrow("db down");
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("pinned entries survive a flood of distinct URL-derived keys", async () => {
    const snapshot = vi.fn(async () => "snapshot");
    await cached("snapshot", 60_000, snapshot, { pinned: true });
    for (let i = 0; i < 2_000; i++) await cached(`country:ssh:bogus-${i}`, 60_000, async () => null);
    await cached("snapshot", 60_000, snapshot, { pinned: true });
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
});
