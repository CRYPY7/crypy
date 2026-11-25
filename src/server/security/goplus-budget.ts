import "server-only";
import { countToday } from "@/server/health/counters";

/**
 * One shared pace for GoPlus calls from this server (free plan: 150 compute units a minute, 30,000 a day; in tests
 * GoPlus stopped answering after about 10 quick calls). Cached answers don't count: only real requests take a slot.
 *
 * A smooth pace (S3): slots come back at PER_MINUTE a minute (one every 2 s), at most BURST saved up. A call that
 * finds no slot waits in a short line instead of being refused at once:
 *  - "page": a visitor opened a token or approvals report. Always first in line; waits up to PAGE_WAIT_MS.
 *  - "background": nice-to-have checks (the Portfolio's badges, daily token checks). They never take one of the last
 *    RESERVE slots, use at most BACKGROUND_PER_MINUTE a minute, wait behind every page call, up to BACKGROUND_WAIT_MS.
 *
 * When GoPlus says "too many requests", every call pauses for PAUSE_MS; calls whose wait would end before the pause
 * does are refused at once. A refused call returns "unavailable" (or a saved answer), which pages show as such.
 * In memory per server process; a shared store replaces it if CRYPY runs on several servers.
 */
export type GoPlusPriority = "page" | "background";

export const PER_MINUTE = 30;
export const BURST = 10;
export const RESERVE = 4;
export const BACKGROUND_PER_MINUTE = 8;
export const PAGE_WAIT_MS = 4_000;
export const BACKGROUND_WAIT_MS = 20_000;
const RATE_PER_MS = PER_MINUTE / 60_000;
const PAUSE_MS = 60_000;

interface Waiter {
  priority: GoPlusPriority;
  deadline: number;
  resolve: (ok: boolean) => void;
}

interface Pace {
  tokens: number;
  refilledAt: number;
  pausedUntil: number;
  background: number[];
  queue: Waiter[];
  timer: ReturnType<typeof setTimeout> | null;
  /** Counts for the once-a-minute log line (nothing about what was asked). */
  stats: { since: number; sent: number; waited: number; refused: { page: number; background: number }; failed: number };
}

const state = globalThis as typeof globalThis & { __crypyGoPlusPace?: Pace };
const fresh = (): Pace => ({
  tokens: BURST,
  refilledAt: -1,
  pausedUntil: 0,
  background: [],
  queue: [],
  timer: null,
  stats: { since: -1, sent: 0, waited: 0, refused: { page: 0, background: 0 }, failed: 0 },
});
const pace = () => (state.__crypyGoPlusPace ??= fresh());

function refill(p: Pace, now: number) {
  if (p.refilledAt < 0) p.refilledAt = now;
  p.tokens = Math.min(BURST, p.tokens + Math.max(0, now - p.refilledAt) * RATE_PER_MS);
  p.refilledAt = now;
  while (p.background.length && now - p.background[0]! >= 60_000) p.background.shift();
}

function logMinute(p: Pace, now: number) {
  if (p.stats.since < 0) p.stats.since = now;
  if (now - p.stats.since < 60_000) return;
  const s = p.stats;
  if (s.refused.page || s.refused.background || s.failed || s.waited)
    console.warn(
      `[crypy] GoPlus last minute: ${s.sent} sent (${s.waited} after waiting), ${s.failed} failed, ` +
        `${s.refused.page} page and ${s.refused.background} background calls held back`,
    );
  p.stats = { since: now, sent: 0, waited: 0, refused: { page: 0, background: 0 }, failed: 0 };
}

function canTake(p: Pace, priority: GoPlusPriority, now: number): boolean {
  if (now < p.pausedUntil) return false;
  refill(p, now);
  if (priority === "page") return p.tokens >= 1;
  return p.tokens >= 1 + RESERVE && p.background.length < BACKGROUND_PER_MINUTE;
}

function take(p: Pace, priority: GoPlusPriority, now: number) {
  p.tokens -= 1;
  if (priority === "background") p.background.push(now);
  p.stats.sent += 1;
  countToday("goplus.sent", now);
}

function refuse(p: Pace, priority: GoPlusPriority, now: number) {
  p.stats.refused[priority] += 1;
  countToday("goplus.heldBack", now);
}

/** Takes a slot now if one is free and nobody with a better claim is waiting; never waits. */
export function takeGoPlusSlot(priority: GoPlusPriority, now = Date.now()): boolean {
  const p = pace();
  logMinute(p, now);
  const ahead = p.queue.some((w) => w.priority === "page" || priority === "background");
  if (!ahead && canTake(p, priority, now)) {
    take(p, priority, now);
    return true;
  }
  refuse(p, priority, now);
  return false;
}

/**
 * Takes a slot, waiting in line when none is free: pages up to PAGE_WAIT_MS, background up to BACKGROUND_WAIT_MS.
 * Resolves false when the wait would be too long (the caller then reports "unavailable").
 */
export function waitForGoPlusSlot(priority: GoPlusPriority, maxWaitMs?: number): Promise<boolean> {
  const p = pace();
  const now = Date.now();
  logMinute(p, now);
  const ahead = p.queue.some((w) => w.priority === "page" || priority === "background");
  if (!ahead && canTake(p, priority, now)) {
    take(p, priority, now);
    return Promise.resolve(true);
  }
  const deadline = now + (maxWaitMs ?? (priority === "page" ? PAGE_WAIT_MS : BACKGROUND_WAIT_MS));
  if (p.pausedUntil > deadline) {
    refuse(p, priority, now);
    return Promise.resolve(false);
  }
  return new Promise((resolve) => {
    p.queue.push({ priority, deadline, resolve });
    schedule(p, now);
  });
}

/** Serves the line: pages first, then background, each in arrival order; drops waiters whose time is up. */
function drain() {
  const p = pace();
  p.timer = null;
  const now = Date.now();
  logMinute(p, now);
  const order = [...p.queue.filter((w) => w.priority === "page"), ...p.queue.filter((w) => w.priority !== "page")];
  const served = new Set<Waiter>();
  for (const w of order) {
    // A background call never overtakes a page call still waiting.
    if (w.priority === "background" && order.some((o) => o.priority === "page" && !served.has(o) && o.deadline > now))
      break;
    if (!canTake(p, w.priority, now)) {
      if (w.priority === "page") break;
      continue;
    }
    take(p, w.priority, now);
    p.stats.waited += 1;
    served.add(w);
    w.resolve(true);
  }
  for (const w of order)
    if (!served.has(w) && w.deadline <= now) {
      served.add(w);
      refuse(p, w.priority, now);
      w.resolve(false);
    }
  p.queue = p.queue.filter((w) => !served.has(w));
  schedule(p, now);
}

function schedule(p: Pace, now: number) {
  if (p.timer || p.queue.length === 0) return;
  refill(p, now);
  const nextToken = p.tokens >= 1 ? now : now + (1 - p.tokens) / RATE_PER_MS;
  const nextDeadline = Math.min(...p.queue.map((w) => w.deadline));
  const at = Math.min(Math.max(nextToken, p.pausedUntil), nextDeadline);
  p.timer = setTimeout(drain, Math.max(20, Math.ceil(at - now)));
  p.timer.unref?.();
}

/** GoPlus answered "too many requests" (HTTP 429 or a limit message): stop asking for a while. */
export function pauseGoPlus(now = Date.now()) {
  const p = pace();
  if (p.pausedUntil < now) console.warn("[crypy] GoPlus said too many requests: pausing GoPlus calls for 60 s");
  p.pausedUntil = now + PAUSE_MS;
  // Waiters who can't outlast the pause are told at once rather than at their deadline.
  for (const w of p.queue.filter((w) => w.deadline < p.pausedUntil)) {
    refuse(p, w.priority, now);
    w.resolve(false);
  }
  p.queue = p.queue.filter((w) => w.deadline >= p.pausedUntil);
}

/** A GoPlus call that was sent failed (counted for the once-a-minute log line). */
export function noteGoPlusFailure() {
  pace().stats.failed += 1;
}

/** GoPlus answers some limit errors with HTTP 200 and a message instead of HTTP 429. */
export const isLimitMessage = (message: unknown) =>
  typeof message === "string" && /limit|too many|frequen/i.test(message);

/** For tests. */
export function resetGoPlusPace() {
  const p = state.__crypyGoPlusPace;
  if (p?.timer) clearTimeout(p.timer);
  for (const w of p?.queue ?? []) w.resolve(false);
  state.__crypyGoPlusPace = fresh();
}
