import "server-only";
import type { Saved } from "./store";

/**
 * Stabilization S2 (board 60, state 2; bugs B-006, B-013, B-018, B-025): a page never waits long when a saved
 * reading exists. A fresh read starts; if it isn't back within `waitMs` and a saved reading is young enough, the saved
 * one is shown at once ("checking for changes") while the fresh read finishes in the background and is saved. The
 * page then reloads itself and gets the new reading from here at once.
 *
 * Per key (tool, subject, chain) at most one fresh read runs at a time, shared by every request. When a page was shown
 * a saved reading, the fresh result is kept for `KEEP_MS` so the page's reload gets it at once.
 */
export type FreshOrSaved<T> =
  | { kind: "fresh"; value: T }
  /** A saved reading: `refreshing` = the fresh read is still running; false = it failed. */
  | { kind: "saved"; value: T; savedAt: string; refreshing: boolean }
  | { kind: "failed"; error: unknown };

interface Entry {
  promise: Promise<unknown>;
  /** A page showed the saved reading and will reload for this one: keep the result for `KEEP_MS`. */
  awaited?: boolean;
  settled?: { at: number; ok: boolean; value?: unknown; error?: unknown };
}

export const WAIT_MS = 2_500;
const KEEP_MS = 60_000;
const MAX_ENTRIES = 5_000;
const entries = new Map<string, Entry>();

function prune(now: number) {
  if (entries.size < MAX_ENTRIES) return;
  for (const [key, entry] of entries) if (entry.settled && now - entry.settled.at > KEEP_MS) entries.delete(key);
  // Still full (everything in flight): drop the oldest settled or, failing that, the oldest entries.
  for (const key of entries.keys()) {
    if (entries.size < MAX_ENTRIES) break;
    entries.delete(key);
  }
}

/** For tests. */
export function resetFreshOrSaved(): void {
  entries.clear();
}

export async function freshOrSaved<T>(
  key: string,
  fresh: () => Promise<T>,
  saved: () => Promise<Saved<T> | undefined>,
  onFresh: (value: T) => void,
  waitMs = WAIT_MS,
): Promise<FreshOrSaved<T>> {
  const now = Date.now();
  let entry = entries.get(key);
  if (entry?.settled && now - entry.settled.at > KEEP_MS) {
    entries.delete(key);
    entry = undefined;
  }
  if (entry?.settled?.ok) return { kind: "fresh", value: entry.settled.value as T };
  if (!entry) {
    prune(now);
    const created: Entry = { promise: Promise.resolve() };
    created.promise = fresh().then(
      (value) => {
        created.settled = { at: Date.now(), ok: true, value };
        // Only kept when a page is waiting for it; otherwise the page cache already holds it.
        if (!created.awaited) entries.delete(key);
        try {
          onFresh(value);
        } catch {
          // Saving is best-effort.
        }
        return value;
      },
      (error: unknown) => {
        // A failure isn't kept: the next request tries again.
        entries.delete(key);
        throw error;
      },
    );
    created.promise.catch(() => {});
    entries.set(key, created);
    entry = created;
  }
  const running = entry.promise as Promise<T>;
  const TIMEOUT = Symbol("timeout");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const first = await Promise.race([
    running.then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    ),
    new Promise<typeof TIMEOUT>((resolve) => {
      timer = setTimeout(() => resolve(TIMEOUT), waitMs);
    }),
  ]);
  clearTimeout(timer);
  if (first !== TIMEOUT) {
    if (first.ok) return { kind: "fresh", value: first.value };
    const old = await saved().catch(() => undefined);
    return old
      ? { kind: "saved", value: old.data, savedAt: old.savedAt, refreshing: false }
      : { kind: "failed", error: first.error };
  }
  // Slow: show the saved reading if there is one; otherwise wait for the fresh read.
  const old = await saved().catch(() => undefined);
  if (old) {
    entry.awaited = true;
    // It may have finished while the saved reading was being read.
    if (entry.settled?.ok) return { kind: "fresh", value: entry.settled.value as T };
    return { kind: "saved", value: old.data, savedAt: old.savedAt, refreshing: true };
  }
  try {
    return { kind: "fresh", value: await running };
  } catch (error) {
    return { kind: "failed", error };
  }
}
