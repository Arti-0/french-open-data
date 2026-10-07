/**
 * The two bundled {@link ResponseCache} implementations, both zero-dependency:
 *
 * - {@link MemoryCache}: an in-process map. Suitable for a single process;
 *   plug in your own implementation (Redis, KV…) for anything shared.
 * - {@link StorageCache}: a Web Storage–backed cache (`localStorage`,
 *   `sessionStorage`, or any {@link StorageLike}). Entries survive page loads
 *   and process restarts, so a search someone comes back to is served
 *   instantly, without a request.
 */
import type { ResponseCache, StorageLike } from "./types.js";

interface Entry {
  value: string;
  expiresAt: number;
}

export class MemoryCache implements ResponseCache {
  private readonly entries = new Map<string, Entry>();

  get(key: string): Promise<string | null> {
    const entry = this.entries.get(key);
    if (!entry) return Promise.resolve(null);
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return Promise.resolve(null);
    }
    return Promise.resolve(entry.value);
  }

  set(key: string, value: string, ttlSeconds: number): Promise<void> {
    this.entries.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return Promise.resolve();
  }
}

export interface StorageCacheOptions {
  /**
   * Prepended to every storage key, to keep the cache apart from the rest of
   * a shared storage (default: none; the clients' own keys already start with
   * `french-open-data:`).
   */
  prefix?: string;
}

/**
 * {@link ResponseCache} over a {@link StorageLike}. Each entry is stored as
 * `{"value","expiresAt"}`; an expired or unreadable entry is removed on read.
 * Both methods are async, so a storage that throws (a full `localStorage`)
 * rejects instead of throwing: the clients treat that as a cache miss and keep
 * working, as with any cache error.
 */
export class StorageCache implements ResponseCache {
  private readonly prefix: string;

  constructor(
    private readonly storage: StorageLike,
    options: StorageCacheOptions = {},
  ) {
    this.prefix = options.prefix ?? "";
  }

  async get(key: string): Promise<string | null> {
    const raw = this.storage.getItem(this.prefix + key);
    if (raw === null) return null;
    let entry: Partial<Entry> | null = null;
    try {
      entry = JSON.parse(raw) as Partial<Entry>;
    } catch {
      // Not ours, or damaged: dropped below.
    }
    if (
      typeof entry?.value !== "string" ||
      typeof entry.expiresAt !== "number" ||
      entry.expiresAt <= Date.now()
    ) {
      this.storage.removeItem(this.prefix + key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    const entry: Entry = { value, expiresAt: Date.now() + ttlSeconds * 1000 };
    this.storage.setItem(this.prefix + key, JSON.stringify(entry));
  }
}
