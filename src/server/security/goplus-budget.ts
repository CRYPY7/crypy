import "server-only";

/**
 * One shared pace for GoPlus calls from this server (free plan: 150 compute units a minute, 30,000 a day; in tests
 * GoPlus stopped answering after about 10 quick calls). Cached answers don't count: only real requests take a slot.
 *
 *  - "page": a visitor opened a token or approvals report. Always first in line, up to PER_MINUTE.
 *  - "background": extra checks that are nice to have (the Portfolio's per-wallet badges). They may use only the
 *    first BACKGROUND_PER_MINUTE slots of a minute, so a big portfolio can never use up what the free safety checks need.
 *
 * When GoPlus says "too many requests", every call pauses for PAUSE_MS. A refused call returns "unavailable", which
 * pages already show as "not checked". In memory per server process; a shared store replaces it if CRYPY runs on
 * several servers.
 */
export type GoPlusPriority = "page" | "background";

export const PER_MINUTE = 30;
export const BACKGROUND_PER_MINUTE = 8;
const WINDOW_MS = 60_000;
const PAUSE_MS = 60_000;

interface Pace {
  windowStart: number;
  used: number;
  pausedUntil: number;
  /** Refused this minute, logged once when the minute ends (counts only, nothing about what was asked). */
  refused: { page: number; background: number };
  /** GoPlus calls that were sent but failed (timeout, error answer), logged with the above. */
  failed: number;
}

const state = globalThis as typeof globalThis & { __crypyGoPlusPace?: Pace };
const fresh = (): Pace => ({
  windowStart: 0,
  used: 0,
  pausedUntil: 0,
  refused: { page: 0, background: 0 },
  failed: 0,
});
const pace = () => (state.__crypyGoPlusPace ??= fresh());

/** Takes a slot for one real GoPlus request, or says no (the caller then reports "unavailable"). */
export function takeGoPlusSlot(priority: GoPlusPriority, now = Date.now()): boolean {
  const p = pace();
  if (now - p.windowStart >= WINDOW_MS) {
    if (p.refused.page || p.refused.background || p.failed)
      console.warn(
        `[crypy] GoPlus last minute: ${p.used} sent, ${p.failed} failed, ` +
          `${p.refused.page} page and ${p.refused.background} background calls held back`,
      );
    p.windowStart = now;
    p.used = 0;
    p.refused = { page: 0, background: 0 };
    p.failed = 0;
  }
  if (now < p.pausedUntil || p.used >= (priority === "page" ? PER_MINUTE : BACKGROUND_PER_MINUTE)) {
    p.refused[priority] += 1;
    return false;
  }
  p.used += 1;
  return true;
}

/** GoPlus answered "too many requests" (HTTP 429 or a limit message): stop asking for a while. */
export function pauseGoPlus(now = Date.now()) {
  if (pace().pausedUntil < now) console.warn("[crypy] GoPlus said too many requests: pausing GoPlus calls for 60 s");
  pace().pausedUntil = now + PAUSE_MS;
}

/** A GoPlus call that was sent failed (counted for the once-a-minute log line). */
export function noteGoPlusFailure() {
  pace().failed += 1;
}

/** GoPlus answers some limit errors with HTTP 200 and a message instead of HTTP 429. */
export const isLimitMessage = (message: unknown) =>
  typeof message === "string" && /limit|too many|frequen/i.test(message);

/** For tests. */
export function resetGoPlusPace() {
  state.__crypyGoPlusPace = fresh();
}
