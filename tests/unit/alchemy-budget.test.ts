import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { alchemyDailyLimit, daysInMonth, monthDays } from "@/server/chains/evm/alchemy-budget";

process.env.PGLITE_DIR = "memory";
const { resetDb, getDb } = await import("@/server/db/client");
const { providerUsage } = await import("@/server/db/schema");
const providers = await import("@/server/chains/evm/providers");
const store = await import("@/server/chains/evm/usage-store");

const at = (iso: string) => Date.parse(iso);
const MONTH = 30_000_000;

describe("Alchemy's limit for today follows the monthly plan", () => {
  it("knows the length of each month (UTC)", () => {
    expect(daysInMonth(at("2026-11-24T12:00:00Z"))).toBe(30);
    expect(daysInMonth(at("2026-12-01T00:00:00Z"))).toBe(31);
    expect(daysInMonth(at("2028-02-10T00:00:00Z"))).toBe(29);
    expect(monthDays(at("2026-11-24T23:59:00Z"))).toEqual({ today: "2026-11-24", monthStart: "2026-11-01" });
  });

  it("spreads what is left (90% of the plan) over the days left, at most twice a normal day", () => {
    // 1 Nov, nothing spent: 27M over 30 days = 900,000.
    expect(alchemyDailyLimit({ monthly: MONTH, usedEarlierThisMonth: 0, now: at("2026-11-01T08:00:00Z") })).toBe(
      900_000,
    );
    // 24 Nov with 3.5M spent: 23.5M over 7 days = 3.36M, capped at 2M.
    expect(
      alchemyDailyLimit({ monthly: MONTH, usedEarlierThisMonth: 3_500_000, now: at("2026-11-24T08:00:00Z") }),
    ).toBe(2_000_000);
    // 24 Nov with 20M spent: 7M over 7 days = 1M.
    expect(
      alchemyDailyLimit({ monthly: MONTH, usedEarlierThisMonth: 20_000_000, now: at("2026-11-24T08:00:00Z") }),
    ).toBe(1_000_000);
    // Month nearly used: never below zero.
    expect(
      alchemyDailyLimit({ monthly: MONTH, usedEarlierThisMonth: 28_000_000, now: at("2026-11-30T08:00:00Z") }),
    ).toBe(0);
  });

  it("uses a normal day while earlier use is unknown", () => {
    expect(alchemyDailyLimit({ monthly: MONTH, usedEarlierThisMonth: null, now: at("2026-11-24T08:00:00Z") })).toBe(
      1_000_000,
    );
  });
});

describe("usage store", () => {
  const alchemy = { name: "alchemy", kind: "alchemy" as const, url: "https://x.invalid" };
  beforeEach(() => {
    providers.resetUsage();
    store.resetUsageStore();
  });
  afterAll(() => resetDb());

  it("saves today's counts, adds them back after a restart, and learns the month", async () => {
    const now = Date.now();
    const { today, monthStart } = monthDays(now);
    const db = await getDb();
    // An earlier day this month (if today isn't the 1st), and last month (not counted).
    if (today !== monthStart)
      await db.insert(providerUsage).values({ day: monthStart, provider: "alchemy", requests: 10, units: 400_000 });
    await db.insert(providerUsage).values({ day: "2000-01-01", provider: "alchemy", requests: 1, units: 9_999_999 });
    // A process saved 1,000 units earlier today, then restarted.
    await db.insert(providerUsage).values({ day: today, provider: "alchemy", requests: 40, units: 1_000 });

    providers.recordUsage(alchemy, "alchemy_getTokenBalances"); // 20 units in this process
    await store.saveProviderUsage(now);
    const row = providers.usageSnapshot().find((u) => u.provider === "alchemy")!;
    expect(row.units).toBe(1_020);
    expect(row.requests).toBe(41);
    expect(row.alchemy?.usedEarlierThisMonth).toBe(today !== monthStart ? 400_000 : 0);

    // Saved again: absolute values, no double counting.
    providers.recordUsage(alchemy, "alchemy_getTokenBalances");
    await store.saveProviderUsage(now);
    const saved = (await db.select().from(providerUsage)).find((r) => r.day === today && r.provider === "alchemy");
    expect(saved).toMatchObject({ requests: 42, units: 1_040 });
    expect(providers.alchemyLimitToday(now)).toBe(
      alchemyDailyLimit({ monthly: MONTH, usedEarlierThisMonth: today !== monthStart ? 400_000 : 0, now }),
    );
  });
});
