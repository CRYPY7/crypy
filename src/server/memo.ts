import "server-only";

/**
 * A small in-memory cache for outside sources (GoPlus, Sourcify), with a lifetime chosen per answer.
 *
 * Used instead of Next.js "use cache" for helpers that run inside page reads (R2, found on the server 2026-11-28):
 * Next.js stores a cached result only after every cached function started inside it has finished. A page that
 * showed a stored reading started a fresh read calling these helpers and answered at once, but its own cached
 * answer stayed unfinished until GoPlus replied, so the next visitor waited 4–6 s.
 *
 * One read per key at a time (callers share it); failures aren't kept; at most `maxEntries` keys (oldest dropped).
 */
export interface Life {
  /** How long this answer may be reused, in ms. */
  ms: number;
  /** Same shape as Next.js `cacheLife`: `revalidate` (seconds) becomes the lifetime. */
  set(life: { revalidate: number; expire?: number }): void;
}

export function newLife(defaultMs: number): Life {
  return {
    ms: defaultMs,
    set(life) {
      this.ms = life.revalidate * 1000;
    },
  };
}

export function memoCache<T>(maxEntries: number) {
  const entries = new Map<string, { until: number; promise: Promise<T> }>();
  const remember = (key: string, read: (life: Life) => Promise<T>, defaultMs = 60_000): Promise<T> => {
    const now = Date.now();
    const hit = entries.get(key);
    if (hit && now < hit.until) return hit.promise;
    const life = newLife(defaultMs);
    const promise = read(life);
    // While the read runs, callers share it.
    const entry = { until: Number.POSITIVE_INFINITY, promise };
    entries.delete(key);
    entries.set(key, entry);
    if (entries.size > maxEntries) entries.delete(entries.keys().next().value!);
    promise.then(
      () => {
        entry.until = Date.now() + life.ms;
      },
      () => {
        if (entries.get(key) === entry) entries.delete(key);
      },
    );
    return promise;
  };
  return { remember, clear: () => entries.clear(), size: () => entries.size };
}
