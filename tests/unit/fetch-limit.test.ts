import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_IN_FLIGHT, limitedFetch, resetFetchGate, takeFetchStats } from "@/server/http/limit";

describe("shared outbound request cap", () => {
  beforeEach(() => resetFetchGate());
  afterEach(() => vi.unstubAllGlobals());

  it("never has more than the cap in flight, and every request still completes", async () => {
    let inFlight = 0;
    let most = 0;
    vi.stubGlobal("fetch", async () => {
      inFlight += 1;
      most = Math.max(most, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return new Response("ok");
    });
    const results = await Promise.all(Array.from({ length: MAX_IN_FLIGHT * 3 }, () => limitedFetch("https://x.test")));
    expect(results).toHaveLength(MAX_IN_FLIGHT * 3);
    expect(most).toBe(MAX_IN_FLIGHT);
    const stats = takeFetchStats();
    expect(stats.active).toBe(0);
    expect(stats.peak).toBe(MAX_IN_FLIGHT);
    expect(stats.queued).toBe(MAX_IN_FLIGHT * 2);
  });

  it("frees the slot when a request fails", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("network down");
    });
    const failures = await Promise.allSettled(
      Array.from({ length: MAX_IN_FLIGHT + 5 }, () => limitedFetch("https://x.test")),
    );
    expect(failures.every((f) => f.status === "rejected")).toBe(true);
    expect(takeFetchStats().active).toBe(0);
  });
});
