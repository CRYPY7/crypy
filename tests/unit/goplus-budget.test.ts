import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_PER_MINUTE,
  BURST,
  RESERVE,
  isLimitMessage,
  pauseGoPlus,
  resetGoPlusPace,
  takeGoPlusSlot,
  waitForGoPlusSlot,
} from "@/server/security/goplus-budget";

const T0 = 1_000_000;

describe("GoPlus pace", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    resetGoPlusPace();
  });
  afterEach(() => {
    resetGoPlusPace();
    vi.useRealTimers();
  });

  it("allows a burst, then one call every 2 seconds", () => {
    for (let i = 0; i < BURST; i++) expect(takeGoPlusSlot("page", T0)).toBe(true);
    expect(takeGoPlusSlot("page", T0)).toBe(false);
    expect(takeGoPlusSlot("page", T0 + 1_000)).toBe(false);
    expect(takeGoPlusSlot("page", T0 + 2_000)).toBe(true);
  });

  it("background checks never take the last slots, and use at most their share a minute", () => {
    let taken = 0;
    while (takeGoPlusSlot("background", T0)) taken++;
    expect(taken).toBe(BURST - RESERVE);
    for (let i = 0; i < RESERVE; i++) expect(takeGoPlusSlot("page", T0)).toBe(true);
    // Over a full minute of refills, background still stops at its share.
    let later = taken;
    for (let t = T0; t < T0 + 59_000; t += 500) if (takeGoPlusSlot("background", t)) later++;
    expect(later).toBe(BACKGROUND_PER_MINUTE);
  });

  it("a page call waits for the next slot instead of failing", async () => {
    for (let i = 0; i < BURST; i++) takeGoPlusSlot("page", T0);
    const waiting = waitForGoPlusSlot("page");
    await vi.advanceTimersByTimeAsync(2_100);
    await expect(waiting).resolves.toBe(true);
  });

  it("page calls are served before background calls that waited longer", async () => {
    for (let i = 0; i < BURST; i++) takeGoPlusSlot("page", T0);
    const order: string[] = [];
    const bg = waitForGoPlusSlot("background").then((ok) => order.push(`background:${ok}`));
    const page = waitForGoPlusSlot("page").then((ok) => order.push(`page:${ok}`));
    await vi.advanceTimersByTimeAsync(2_100);
    await page;
    expect(order).toEqual(["page:true"]);
    // Background needs RESERVE + 1 slots saved up (10 s), well within its 20 s wait.
    await vi.advanceTimersByTimeAsync(12_000);
    await bg;
    expect(order).toEqual(["page:true", "background:true"]);
  });

  it("gives up when the wait would be too long", async () => {
    for (let i = 0; i < BURST; i++) takeGoPlusSlot("page", T0);
    const many = Array.from({ length: 5 }, () => waitForGoPlusSlot("page"));
    await vi.advanceTimersByTimeAsync(4_100);
    // About 2 slots come back in 4 s; the rest are refused at their deadline.
    const results = await Promise.all(many);
    expect(results.filter(Boolean).length).toBe(2);
    expect(results.filter((ok) => !ok).length).toBe(3);
  });

  it("pauses everyone after GoPlus says too many requests, refusing waits that can't outlast it", async () => {
    pauseGoPlus(T0);
    expect(takeGoPlusSlot("page", T0 + 1)).toBe(false);
    await expect(waitForGoPlusSlot("page")).resolves.toBe(false);
    expect(takeGoPlusSlot("page", T0 + 60_001)).toBe(true);
  });

  it("a pause tells waiting calls at once", async () => {
    for (let i = 0; i < BURST; i++) takeGoPlusSlot("page", T0);
    const waiting = waitForGoPlusSlot("page");
    pauseGoPlus(T0);
    await expect(waiting).resolves.toBe(false);
  });

  it("recognises limit messages", () => {
    expect(isLimitMessage("request limit reached")).toBe(true);
    expect(isLimitMessage("Too many requests")).toBe(true);
    expect(isLimitMessage("OK")).toBe(false);
    expect(isLimitMessage(undefined)).toBe(false);
  });
});
