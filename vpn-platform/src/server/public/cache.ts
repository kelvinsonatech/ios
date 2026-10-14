/**
 * Tiny in-process TTL cache for the public catalogue. Public pages are read far more often than the
 * data changes, so each result is reused for a few seconds per process; concurrent callers share one
 * in-flight load. Results are plain data (safe to share between requests). Errors are not cached.
 */
interface Entry {
  at: number;
  value: Promise<unknown>;
}

const MAX_ENTRIES = 500;
const g = globalThis as unknown as { __vlPublicCache?: Map<string, Entry> };

function store(): Map<string, Entry> {
  g.__vlPublicCache ??= new Map();
  return g.__vlPublicCache;
}

export function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const map = store();
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as Promise<T>;
  const value = load();
  map.delete(key);
  map.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (map.get(key)?.value === value) map.delete(key);
  });
  if (map.size > MAX_ENTRIES) {
    // Drop the oldest entries (Map keeps insertion order).
    for (const k of map.keys()) {
      map.delete(k);
      if (map.size <= MAX_ENTRIES / 2) break;
    }
  }
  return value;
}

/** Forget every cached result (tests, and after admin changes that must show immediately). */
export function clearPublicCache() {
  store().clear();
}
