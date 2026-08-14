import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { MemoryCache } from "../src/cache";

afterEach(() => setSystemTime());

describe("MemoryCache", () => {
  test("returns stored values before their TTL", async () => {
    const cache = new MemoryCache();
    await cache.set("k", "v", 60);
    expect(await cache.get("k")).toBe("v");
  });

  test("returns null for unknown keys", async () => {
    expect(await new MemoryCache().get("missing")).toBeNull();
  });

  test("expires entries after their TTL", async () => {
    const t0 = Date.UTC(2026, 0, 1);
    setSystemTime(new Date(t0));
    const cache = new MemoryCache();
    await cache.set("k", "v", 60);

    setSystemTime(new Date(t0 + 59_000));
    expect(await cache.get("k")).toBe("v");

    setSystemTime(new Date(t0 + 61_000));
    expect(await cache.get("k")).toBeNull();
  });
});
