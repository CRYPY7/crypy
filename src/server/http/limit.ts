import "server-only";

/**
 * One cap on how many outbound requests (blockchain nodes, Alchemy, GoPlus, Sourcify) this server has in flight at
 * once. Extra requests wait their turn. Found on the owner's Windows PC: with the Portfolio's checks running beside many
 * page loads, Node itself aborted (exit code 0xC0000409, no JavaScript error, normal memory). Each part alone never
 * crashed; together they did. Keeping the number of open requests bounded also spares the free providers.
 */
export const MAX_IN_FLIGHT = 32;

interface Gate {
  active: number;
  peak: number;
  queued: number;
  waiting: (() => void)[];
}

const state = globalThis as typeof globalThis & { __crypyFetchGate?: Gate };
const gate = () => (state.__crypyFetchGate ??= { active: 0, peak: 0, queued: 0, waiting: [] });

async function acquire(): Promise<void> {
  const g = gate();
  if (g.active < MAX_IN_FLIGHT) {
    g.active += 1;
  } else {
    g.queued += 1;
    // The releasing request hands its slot straight to the next waiter, so `active` stays unchanged.
    await new Promise<void>((resolve) => g.waiting.push(resolve));
  }
  g.peak = Math.max(g.peak, g.active);
}

function release(): void {
  const g = gate();
  const next = g.waiting.shift();
  if (next) next();
  else g.active -= 1;
}

/**
 * `fetch` with the shared cap. The slot is held until the response headers arrive (or the request fails): the
 * waiting-for-an-answer part is what piles up under load, and releasing here can never leak a slot.
 */
export async function limitedFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  await acquire();
  try {
    return await fetch(input, init);
  } finally {
    release();
  }
}

/** For the opt-in memory log and tests: requests in flight now, the most at once since the last read, and how many waited. */
export function takeFetchStats(): { active: number; peak: number; queued: number } {
  const g = gate();
  const stats = { active: g.active, peak: g.peak, queued: g.queued };
  g.peak = g.active;
  g.queued = 0;
  return stats;
}

/** For tests. */
export function resetFetchGate(): void {
  state.__crypyFetchGate = { active: 0, peak: 0, queued: 0, waiting: [] };
}
