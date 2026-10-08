import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { MemoryCache, StorageCache } from "../src/cache";
import type { StorageLike } from "../src/types";

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

/** A Web Storage double: the same three methods, backed by a map. */
function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

describe("StorageCache", () => {
  test("persists entries across cache instances over the same storage", async () => {
    const storage = fakeStorage();
    await new StorageCache(storage).set("k", "v", 60);
    expect(await new StorageCache(storage).get("k")).toBe("v");
    expect(await new StorageCache(storage).get("missing")).toBeNull();
  });

  test("expires entries after their TTL and removes them from the storage", async () => {
    const t0 = Date.UTC(2026, 0, 1);
    setSystemTime(new Date(t0));
    const storage = fakeStorage();
    const cache = new StorageCache(storage);
    await cache.set("k", "v", 60);

    setSystemTime(new Date(t0 + 59_000));
    expect(await cache.get("k")).toBe("v");

    setSystemTime(new Date(t0 + 61_000));
    expect(await cache.get("k")).toBeNull();
    expect(storage.data.has("k")).toBe(false);
  });

  test("drops entries it cannot read (foreign or damaged)", async () => {
    const storage = fakeStorage();
    storage.setItem("k", "not json");
    storage.setItem("j", JSON.stringify({ value: 1, expiresAt: "soon" }));
    const cache = new StorageCache(storage);
    expect(await cache.get("k")).toBeNull();
    expect(await cache.get("j")).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  test("prefixes its keys when asked, so several caches can share one storage", async () => {
    const storage = fakeStorage();
    await new StorageCache(storage, { prefix: "a:" }).set("k", "va", 60);
    await new StorageCache(storage, { prefix: "b:" }).set("k", "vb", 60);
    expect([...storage.data.keys()].sort()).toEqual(["a:k", "b:k"]);
    expect(await new StorageCache(storage, { prefix: "a:" }).get("k")).toBe("va");
    expect(await new StorageCache(storage, { prefix: "b:" }).get("k")).toBe("vb");
  });

  test("lets a full storage throw: the clients fail open on cache errors", async () => {
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
      removeItem: () => {},
    };
    await expect(new StorageCache(full).set("k", "v", 60)).rejects.toThrow("quota");
  });
});
