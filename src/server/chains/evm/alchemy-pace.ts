import "server-only";

/**
 * Alchemy's free plan allows about 300 compute units (CU) per second for the whole account: every chain and every
 * request together. Going over it makes Alchemy answer "too many requests" (HTTP 429). This module keeps CRYPY under
 * that line instead of finding out from a refusal.
 *
 * One shared budget per server process, refilled continuously at ALCHEMY_CU_PER_SECOND (a margin below the plan's 300).
 * Two ways to use it:
 *
 *  - takeAlchemyNow: ordinary node reads (eth_call, balances, blocks…). Public nodes and other free providers can answer
 *    them too, so when Alchemy's budget is used up the request goes to the next provider at once.
 *  - waitForAlchemy: Alchemy-only methods (token list, transfer history, old-block reads). Nothing else can answer them,
 *    so they wait for budget, up to a limit; they also go first, because a waiting request puts the budget into debt and
 *    ordinary reads only take budget that is really there.
 *
 * Each request inside a JSON-RPC batch is counted on its own, as Alchemy does.
 */

/** Below the free plan's 300 CU/s, leaving room for timing differences between our clock and Alchemy's. */
export const ALCHEMY_CU_PER_SECOND = 250;

/** After Alchemy itself says "too many requests", send nothing to it for this long (its limit is per second). */
export const ALCHEMY_PAUSE_MS = 2_000;

interface Pace {
  level: number;
  at: number;
  pausedUntil: number;
  // Counters for the once-a-minute log line.
  minute: number;
  used: number;
  sentElsewhere: number;
  waited: number;
  refused: number;
  limited: number;
}

const paceKey = Symbol.for("crypy.alchemyPace");
const fresh = (now: number): Pace => ({
  level: ALCHEMY_CU_PER_SECOND,
  at: now,
  pausedUntil: 0,
  minute: Math.floor(now / 60_000),
  used: 0,
  sentElsewhere: 0,
  waited: 0,
  refused: 0,
  limited: 0,
});
const store = globalThis as typeof globalThis & { [paceKey]?: Pace };

function pace(now: number): Pace {
  const p = (store[paceKey] ??= fresh(now));
  const minute = Math.floor(now / 60_000);
  if (minute !== p.minute) {
    if (p.sentElsewhere || p.waited || p.refused || p.limited) {
      console.warn(
        `[crypy] Alchemy pace last minute: ${p.used} CU used, ${p.sentElsewhere} reads sent to other providers, ` +
          `${p.waited} waited, ${p.refused} not sent (waited too long), ${p.limited} "too many requests" from Alchemy`,
      );
    }
    Object.assign(p, { minute, used: 0, sentElsewhere: 0, waited: 0, refused: 0, limited: 0 });
  }
  // Refill: at most one second's worth, so a quiet minute doesn't allow a burst far above the limit.
  p.level = Math.min(ALCHEMY_CU_PER_SECOND, p.level + ((now - p.at) / 1000) * ALCHEMY_CU_PER_SECOND);
  p.at = now;
  return p;
}

export class AlchemyBusyError extends Error {
  constructor() {
    super("Alchemy's per-second limit is in use; another provider answers this request");
    this.name = "AlchemyBusyError";
  }
}

/** Ordinary reads: take the units if they are available right now, else false (use another provider). */
export function takeAlchemyNow(units: number, now = Date.now()): boolean {
  const p = pace(now);
  if (now < p.pausedUntil || p.level < units) {
    p.sentElsewhere += 1;
    return false;
  }
  p.level -= units;
  p.used += units;
  return true;
}

/**
 * Alchemy-only methods: how long to wait before sending (0 = now), with the units already reserved; or null when the
 * wait would be longer than maxWaitMs (then nothing is reserved and the caller reports the method as unavailable).
 */
export function reserveAlchemy(units: number, maxWaitMs: number, now = Date.now()): number | null {
  const p = pace(now);
  const pauseLeft = Math.max(0, p.pausedUntil - now);
  const debtWait = p.level >= units ? 0 : ((units - p.level) / ALCHEMY_CU_PER_SECOND) * 1000;
  const wait = Math.ceil(Math.max(pauseLeft, debtWait));
  if (wait > maxWaitMs) {
    p.refused += 1;
    return null;
  }
  p.level -= units;
  p.used += units;
  if (wait > 0) p.waited += 1;
  return wait;
}

/** Waits until the units are available (see reserveAlchemy); throws AlchemyBusyError when that would take too long. */
export async function waitForAlchemy(units: number, maxWaitMs: number): Promise<void> {
  const wait = reserveAlchemy(units, maxWaitMs);
  if (wait === null) throw new AlchemyBusyError();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/** Alchemy answered "too many requests" anyway (another app on the same account, clock drift): back off briefly. */
export function noteAlchemyLimited(now = Date.now()): void {
  const p = pace(now);
  p.limited += 1;
  p.pausedUntil = Math.max(p.pausedUntil, now + ALCHEMY_PAUSE_MS);
  p.level = Math.min(p.level, 0);
}

/** Test helper. */
export function resetAlchemyPace(now = Date.now()): void {
  store[paceKey] = fresh(now);
}
