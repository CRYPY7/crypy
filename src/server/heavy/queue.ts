import "server-only";
import { isBackground } from "@/server/background";

/**
 * Stabilization S3: one line for heavy checks (token security reports, approval scans per chain). Each runs several
 * node rounds, GoPlus and simulations; many at once overload the 1-CPU server and the free nodes, and slow everyone.
 *
 *  - At most MAX_RUNNING run at a time per server process, of which at most MAX_PORTFOLIO_RUNNING are a visitor's
 *    Portfolio safety checks (B-034: a big portfolio asks for many at once) and at most MAX_BACKGROUND_RUNNING are
 *    background work (daily token checks, alerts, health checks), so neither can fill the server.
 *  - Waiting checks are started pages first, then Portfolio, then background, each in arrival order.
 *  - More than MAX_QUEUED waiting: a new check is refused with HeavyBusyError (pages then show the saved reading, or
 *    "couldn't check right now", as for any failed check). Background checks also give up after BACKGROUND_WAIT_MS.
 *
 * Page waits are short in practice: a page shows its saved reading after 2.5 s (fresh-or-saved.ts) while the check
 * keeps its place. In memory per process; a shared queue replaces it if CRYPY runs on several servers.
 */
export type HeavyPriority = "page" | "portfolio" | "background";

/** Lower goes first. */
const RANK: Record<HeavyPriority, number> = { page: 0, portfolio: 1, background: 2 };

const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
export const MAX_RUNNING = num(process.env.HEAVY_MAX_RUNNING, 6);
export const MAX_BACKGROUND_RUNNING = num(process.env.HEAVY_MAX_BACKGROUND, 2);
export const MAX_PORTFOLIO_RUNNING = num(process.env.HEAVY_MAX_PORTFOLIO, 3);
export const MAX_QUEUED = num(process.env.HEAVY_MAX_QUEUED, 60);
export const BACKGROUND_WAIT_MS = 120_000;

export class HeavyBusyError extends Error {
  constructor() {
    super("Too many checks are waiting; try again shortly");
    this.name = "HeavyBusyError";
  }
}

interface Waiter {
  priority: HeavyPriority;
  since: number;
  start: () => void;
  reject: (error: Error) => void;
}

interface Line {
  running: Record<HeavyPriority, number>;
  queue: Waiter[];
  timer: ReturnType<typeof setTimeout> | null;
  stats: { since: number; started: number; waited: number; refused: number; maxQueued: number };
}

const state = globalThis as typeof globalThis & { __crypyHeavyLine?: Line };
const fresh = (): Line => ({
  running: { page: 0, portfolio: 0, background: 0 },
  queue: [],
  timer: null,
  stats: { since: Date.now(), started: 0, waited: 0, refused: 0, maxQueued: 0 },
});
const line = () => (state.__crypyHeavyLine ??= fresh());

const canStart = (l: Line, priority: HeavyPriority) =>
  l.running.page + l.running.portfolio + l.running.background < MAX_RUNNING &&
  (priority === "page" ||
    (priority === "portfolio" && l.running.portfolio < MAX_PORTFOLIO_RUNNING) ||
    (priority === "background" && l.running.background < MAX_BACKGROUND_RUNNING));

function logMinute(l: Line, now: number) {
  if (now - l.stats.since < 60_000) return;
  const s = l.stats;
  if (s.waited || s.refused)
    console.warn(
      `[crypy] heavy checks last minute: ${s.started} started, ${s.waited} after waiting, ${s.refused} refused, ` +
        `at most ${s.maxQueued} waiting`,
    );
  l.stats = { since: now, started: 0, waited: 0, refused: 0, maxQueued: l.queue.length };
}

/** Starts waiting checks that fit, pages first, then Portfolio; drops background checks that waited too long. */
function pump() {
  const l = line();
  const now = Date.now();
  logMinute(l, now);
  for (const w of l.queue.filter((w) => w.priority === "background" && now - w.since > BACKGROUND_WAIT_MS)) {
    l.stats.refused += 1;
    w.reject(new HeavyBusyError());
  }
  l.queue = l.queue.filter((w) => !(w.priority === "background" && now - w.since > BACKGROUND_WAIT_MS));
  const order = [...l.queue].sort((a, b) => RANK[a.priority] - RANK[b.priority]); // stable: arrival order kept
  for (const w of order) {
    if (!canStart(l, w.priority)) {
      if (w.priority === "page") break; // a waiting page keeps its turn ahead of background work
      continue;
    }
    l.queue.splice(l.queue.indexOf(w), 1);
    l.stats.waited += 1;
    w.start();
  }
  if (!l.timer && l.queue.some((w) => w.priority === "background")) {
    l.timer = setTimeout(() => {
      line().timer = null;
      pump();
    }, 5_000);
    l.timer.unref?.();
  }
}

/**
 * Runs a heavy check when there is room. `priority` defaults to "background" inside background work
 * (runInBackground), else "page".
 */
export function runHeavy<T>(task: () => Promise<T>, priority?: HeavyPriority): Promise<T> {
  const l = line();
  const p: HeavyPriority = priority ?? (isBackground() ? "background" : "page");
  logMinute(l, Date.now());
  const run = async () => {
    l.running[p] += 1;
    l.stats.started += 1;
    try {
      return await task();
    } finally {
      l.running[p] -= 1;
      pump();
    }
  };
  const ahead = l.queue.some((w) => RANK[w.priority] <= RANK[p]);
  if (!ahead && canStart(l, p)) return run();
  if (l.queue.length >= MAX_QUEUED) {
    l.stats.refused += 1;
    return Promise.reject(new HeavyBusyError());
  }
  return new Promise<T>((resolve, reject) => {
    l.queue.push({ priority: p, since: Date.now(), start: () => void run().then(resolve, reject), reject });
    l.stats.maxQueued = Math.max(l.stats.maxQueued, l.queue.length);
    if (p === "background") pump();
  });
}

/** Running and waiting counts (admin and tests). */
export function heavyLoad() {
  const l = line();
  return {
    running: { ...l.running },
    waiting: {
      page: l.queue.filter((w) => w.priority === "page").length,
      portfolio: l.queue.filter((w) => w.priority === "portfolio").length,
      background: l.queue.filter((w) => w.priority === "background").length,
    },
  };
}

/** For tests. */
export function resetHeavyLine() {
  const l = state.__crypyHeavyLine;
  if (l?.timer) clearTimeout(l.timer);
  state.__crypyHeavyLine = fresh();
}
