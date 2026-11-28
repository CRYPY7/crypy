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

/**
 * R2 (stored first, INFRASTRUCTURE_DESIGN.md §2–3): a wallet or token looked up in the last days shows its saved
 * reading after this short wait (was 2.5 s), with its age and "checking for changes", while the fresh read finishes;
 * a fresh read that is quicker than this is shown directly. Safety data keeps its age limits (MAX_AGE_MS).
 */
export const WAIT_MS = 250;
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

export function freshOrSaved<T>(
  key: string,
  fresh: () => Promise<T>,
  saved: () => Promise<Saved<T> | undefined>,
  onFresh: (value: T) => void,
  waitMs = WAIT_MS,
  /** R2: a fresh result for which this says false (e.g. a token list still completing) is never kept for reloads. */
  keep: (value: T) => boolean = () => true,
): Promise<FreshOrSaved<T>> {
  return run(key, fresh, saved, onFresh, waitMs, keep, Number.POSITIVE_INFINITY) as Promise<FreshOrSaved<T>>;
}

/**
 * R3: like `freshOrSaved`, but when there is no saved reading either, the caller waits at most `giveUpMs` (from the
 * start) and then gets `pending`: the page shows the other chains and says this one is still being read; the fresh
 * read continues and is kept for the page's reload. One slow chain never holds up the others.
 */
export function freshSavedOrPending<T>(
  key: string,
  fresh: () => Promise<T>,
  saved: () => Promise<Saved<T> | undefined>,
  onFresh: (value: T) => void,
  giveUpMs: number,
  keep: (value: T) => boolean = () => true,
  waitMs = WAIT_MS,
): Promise<FreshOrSaved<T> | { kind: "pending" }> {
  return run(key, fresh, saved, onFresh, waitMs, keep, giveUpMs);
}

async function run<T>(
  key: string,
  fresh: () => Promise<T>,
  saved: () => Promise<Saved<T> | undefined>,
  onFresh: (value: T) => void,
  waitMs: number,
  keep: (value: T) => boolean,
  giveUpMs: number,
): Promise<FreshOrSaved<T> | { kind: "pending" }> {
  const now = Date.now();
  // R2: the saved reading is asked for first, before the fresh read starts. On a 1-CPU server the fresh read (many
  // node requests, big token lists) can keep the process busy for seconds; asked afterwards, the saved reading's
  // database answer queued behind it, ran out of time and the page waited for the whole fresh read instead.
  let savedRequest: Promise<Saved<T> | undefined> | null = null;
  const savedReading = () => (savedRequest ??= saved().catch(() => undefined));
  let entry = entries.get(key);
  if (entry?.settled && now - entry.settled.at > KEEP_MS) {
    entries.delete(key);
    entry = undefined;
  }
  if (entry?.settled?.ok) return { kind: "fresh", value: entry.settled.value as T };
  void savedReading();
  if (!entry) {
    prune(now);
    const created: Entry = { promise: Promise.resolve() };
    created.promise = fresh().then(
      (value) => {
        created.settled = { at: Date.now(), ok: true, value };
        // Only kept when a page is waiting for it; otherwise the page cache already holds it.
        if (!created.awaited || !keep(value)) entries.delete(key);
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
    const old = await savedReading();
    return old
      ? { kind: "saved", value: old.data, savedAt: old.savedAt, refreshing: false }
      : { kind: "failed", error: first.error };
  }
  // Slow: show the saved reading if there is one; otherwise wait for the fresh read. Whichever comes first wins, so a
  // fresh read finishing while the database answers slowly is shown at once.
  const raced = await Promise.race([
    savedReading().then((old) => ({ from: "saved" as const, old })),
    running.then(
      () => ({ from: "fresh" as const, old: undefined }),
      () => ({ from: "fresh" as const, old: undefined }),
    ),
  ]);
  if (raced.from === "fresh") {
    if (entry.settled?.ok) return { kind: "fresh", value: entry.settled.value as T };
    // The fresh read failed: the saved reading, marked as not refreshing, or the failure.
    const error = await running.then(
      () => undefined,
      (e: unknown) => e,
    );
    const fallback = await savedReading();
    return fallback
      ? { kind: "saved", value: fallback.data, savedAt: fallback.savedAt, refreshing: false }
      : { kind: "failed", error };
  }
  const old = raced.old;
  if (old) {
    entry.awaited = true;
    // It may have finished while the saved reading was being read.
    if (entry.settled?.ok) return { kind: "fresh", value: entry.settled.value as T };
    return { kind: "saved", value: old.data, savedAt: old.savedAt, refreshing: true };
  }
  // No saved reading: wait for the fresh read, at most until `giveUpMs` after the start.
  const left = giveUpMs - (Date.now() - now);
  if (Number.isFinite(left)) {
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      running.then(
        (value) => ({ done: true as const, ok: true as const, value }),
        (error: unknown) => ({ done: true as const, ok: false as const, error }),
      ),
      new Promise<{ done: false }>(
        (resolve) => (giveUp = setTimeout(() => resolve({ done: false }), Math.max(0, left))),
      ),
    ]).finally(() => clearTimeout(giveUp));
    if (!outcome.done) {
      entry.awaited = true; // the page reloads for it
      return { kind: "pending" };
    }
    return outcome.ok ? { kind: "fresh", value: outcome.value } : { kind: "failed", error: outcome.error };
  }
  try {
    return { kind: "fresh", value: await running };
  } catch (error) {
    return { kind: "failed", error };
  }
}
