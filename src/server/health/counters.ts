import "server-only";

/**
 * Today's counts for the admin dashboard (M9 Part 5): GoPlus calls sent and held back, requests refused by the rate
 * limit. Numbers only, nothing about who asked. Kept in memory per server process and reset at midnight UTC.
 */
export type CounterName = "goplus.sent" | "goplus.heldBack" | "rateLimit.refused";

const key = Symbol.for("crypy.dailyCounters");
const store = globalThis as typeof globalThis & { [key]?: { day: string; counts: Map<CounterName, number> } };

const today = (now: number) => new Date(now).toISOString().slice(0, 10);

function current(now: number) {
  const day = today(now);
  if (store[key]?.day !== day) store[key] = { day, counts: new Map() };
  return store[key]!;
}

export function countToday(name: CounterName, now = Date.now()): void {
  const { counts } = current(now);
  counts.set(name, (counts.get(name) ?? 0) + 1);
}

export function todayCounts(now = Date.now()): Record<CounterName, number> {
  const { counts } = current(now);
  return {
    "goplus.sent": counts.get("goplus.sent") ?? 0,
    "goplus.heldBack": counts.get("goplus.heldBack") ?? 0,
    "rateLimit.refused": counts.get("rateLimit.refused") ?? 0,
  };
}

/** Test helper. */
export function resetCounters(): void {
  delete store[key];
}
