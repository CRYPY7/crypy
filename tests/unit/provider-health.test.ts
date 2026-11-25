import { beforeEach, describe, expect, it } from "vitest";
import { providerHealth, recordOutcome, resetProviderHealth } from "@/server/chains/evm/provider-health";

const URL = "https://node.example/key";
const T = 10 * 60 * 60_000;

describe("provider health", () => {
  beforeEach(() => resetProviderHealth());

  it("is idle without requests", () => {
    expect(providerHealth(URL, T)).toMatchObject({ requests: 0, score: null, state: "idle", averageMs: null });
  });

  it("scores answered requests; refusals don't count against the provider", () => {
    for (let i = 0; i < 98; i++) recordOutcome(URL, "eth_call", "ok", 100, T);
    recordOutcome(URL, "eth_getLogs", "failed", 5000, T);
    recordOutcome(URL, "eth_getLogs", "limited", 50, T);
    for (let i = 0; i < 20; i++) recordOutcome(URL, "eth_getBalance", "refused", 30, T);
    const h = providerHealth(URL, T);
    expect(h.requests).toBe(120);
    expect(h.score).toBeCloseTo(0.98);
    expect(h.state).toBe("good");
    expect(h.averageMs).toBe(100);
    expect(h.worstMethods).toEqual([
      { method: "eth_getBalance", count: 20 },
      { method: "eth_getLogs", count: 2 },
    ]);
  });

  it("marks uneven and poor providers", () => {
    for (let i = 0; i < 9; i++) recordOutcome(URL, "eth_call", "ok", 100, T);
    recordOutcome(URL, "eth_call", "failed", 100, T);
    expect(providerHealth(URL, T).state).toBe("uneven");
    for (let i = 0; i < 5; i++) recordOutcome(URL, "eth_call", "failed", 100, T);
    expect(providerHealth(URL, T).state).toBe("poor");
  });

  it("forgets requests older than an hour", () => {
    recordOutcome(URL, "eth_call", "failed", 100, T);
    recordOutcome(URL, "eth_call", "ok", 100, T + 61 * 60_000);
    expect(providerHealth(URL, T + 61 * 60_000)).toMatchObject({ requests: 1, state: "good" });
  });

  it("keeps providers apart", () => {
    recordOutcome(URL, "eth_call", "failed", 100, T);
    expect(providerHealth("https://other.example", T).requests).toBe(0);
  });
});
