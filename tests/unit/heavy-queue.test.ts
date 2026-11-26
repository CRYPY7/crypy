import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInBackground } from "@/server/background";
import {
  BACKGROUND_WAIT_MS,
  HeavyBusyError,
  MAX_BACKGROUND_RUNNING,
  MAX_PORTFOLIO_RUNNING,
  MAX_QUEUED,
  MAX_RUNNING,
  heavyLoad,
  resetHeavyLine,
  runHeavy,
} from "@/server/heavy/queue";

/** A task that runs until released. */
function gate() {
  let open!: () => void;
  const opened = new Promise<void>((r) => (open = r));
  return { open, task: () => opened.then(() => "done") };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("heavy-check line", () => {
  beforeEach(() => resetHeavyLine());
  afterEach(() => {
    resetHeavyLine();
    vi.useRealTimers();
  });

  it("runs at most MAX_RUNNING at once and starts the next when one ends", async () => {
    const gates = Array.from({ length: MAX_RUNNING + 2 }, gate);
    const runs = gates.map((g) => runHeavy(g.task, "page"));
    expect(heavyLoad()).toEqual({
      running: { page: MAX_RUNNING, portfolio: 0, background: 0 },
      waiting: { page: 2, portfolio: 0, background: 0 },
    });
    gates[0]!.open();
    await runs[0];
    await flush();
    expect(heavyLoad().running.page).toBe(MAX_RUNNING);
    expect(heavyLoad().waiting.page).toBe(1);
    gates.forEach((g) => g.open());
    await expect(Promise.all(runs)).resolves.toHaveLength(MAX_RUNNING + 2);
    expect(heavyLoad()).toEqual({
      running: { page: 0, portfolio: 0, background: 0 },
      waiting: { page: 0, portfolio: 0, background: 0 },
    });
  });

  it("background work never fills the server, and pages that wait start before it", async () => {
    const bg = Array.from({ length: MAX_BACKGROUND_RUNNING + 1 }, gate);
    const bgRuns = bg.map((g) => runHeavy(g.task, "background"));
    expect(heavyLoad().running.background).toBe(MAX_BACKGROUND_RUNNING);
    expect(heavyLoad().waiting.background).toBe(1);
    const pages = Array.from({ length: MAX_RUNNING - MAX_BACKGROUND_RUNNING + 1 }, gate);
    const pageRuns = pages.map((g) => runHeavy(g.task, "page"));
    expect(heavyLoad().running.page).toBe(MAX_RUNNING - MAX_BACKGROUND_RUNNING);
    // A background check ends: the waiting page goes, not the waiting background check.
    bg[0]!.open();
    await bgRuns[0];
    await flush();
    expect(heavyLoad().running.page).toBe(MAX_RUNNING - MAX_BACKGROUND_RUNNING + 1);
    expect(heavyLoad().waiting).toEqual({ page: 0, portfolio: 0, background: 1 });
    [...bg, ...pages].forEach((g) => g.open());
    await Promise.all([...bgRuns, ...pageRuns]);
  });

  it("work inside runInBackground counts as background", async () => {
    const g = gate();
    const run = runInBackground(() => runHeavy(g.task));
    expect(heavyLoad().running.background).toBe(1);
    g.open();
    await run;
  });

  it("refuses new checks when the line is full", async () => {
    const gates = Array.from({ length: MAX_RUNNING + MAX_QUEUED }, gate);
    const runs = gates.map((g) => runHeavy(g.task, "page"));
    await expect(runHeavy(async () => 1, "page")).rejects.toBeInstanceOf(HeavyBusyError);
    gates.forEach((g) => g.open());
    await Promise.all(runs);
  });

  it("background checks give up after waiting too long", async () => {
    vi.useFakeTimers();
    const gates = Array.from({ length: MAX_RUNNING }, gate);
    const runs = gates.map((g) => runHeavy(g.task, "page"));
    const late = runHeavy(async () => 1, "background");
    const caught = late.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(BACKGROUND_WAIT_MS + 6_000);
    expect(await caught).toBeInstanceOf(HeavyBusyError);
    gates.forEach((g) => g.open());
    await Promise.all(runs);
  });

  it("a failing check frees its place", async () => {
    await expect(runHeavy(() => Promise.reject(new Error("node down")), "page")).rejects.toThrow("node down");
    expect(heavyLoad().running.page).toBe(0);
  });

  it("Portfolio checks have their own share: they can't fill the server or hold up pages and background", async () => {
    const portfolio = Array.from({ length: MAX_PORTFOLIO_RUNNING + 2 }, gate);
    const pRuns = portfolio.map((g) => runHeavy(g.task, "portfolio"));
    expect(heavyLoad().running.portfolio).toBe(MAX_PORTFOLIO_RUNNING);
    expect(heavyLoad().waiting.portfolio).toBe(2);
    // Pages still start at once.
    const page = gate();
    const pageRun = runHeavy(page.task, "page");
    expect(heavyLoad().running.page).toBe(1);
    // Background work runs in its own share even while Portfolio checks wait at their limit.
    const bg = gate();
    const bgRun = runHeavy(bg.task, "background");
    expect(heavyLoad().running.background).toBe(1);
    portfolio[0]!.open();
    await pRuns[0];
    await flush();
    expect(heavyLoad().running.portfolio).toBe(MAX_PORTFOLIO_RUNNING);
    expect(heavyLoad().waiting.portfolio).toBe(1);
    [...portfolio, page, bg].forEach((g) => g.open());
    await Promise.all([...pRuns, pageRun, bgRun]);
  });
});
