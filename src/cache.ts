/**
 * In-memory {@link ResponseCache} implementation — the zero-dependency
 * default. Suitable for a single process; plug in your own implementation
 * (Redis, KV…) for anything shared.
 */
import type { ResponseCache } from "./types.js";

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
