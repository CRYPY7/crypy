import { beforeEach, describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
import { runInBackground } from "@/server/background";
import {
  alchemyUnits,
  budgetExhausted,
  providerLabel,
  providersFor,
  recordUsage,
  resetUsage,
  usageSnapshot,
} from "@/server/chains/evm/providers";

describe("provider rotation", () => {
  beforeEach(() => resetUsage());

  it("labels providers by host name only, never exposing keys in paths or queries", () => {
    expect(providerLabel("https://rpc.ankr.com/bsc/SECRETKEY")).toBe("ankr.com");
    expect(providerLabel("https://lb.drpc.org/ogrpc?network=bsc&dkey=SECRET")).toBe("drpc.org");
    expect(providerLabel("https://bsc-mainnet.core.chainstack.com/SECRET")).toBe("chainstack.com");
    expect(providerLabel("not a url")).toBe("custom");
  });

  it("always ends with the free public nodes", () => {
    const list = providersFor(getChain("bsc")!);
    expect(list.at(-1)?.kind).toBe("public");
    expect(list.filter((p) => p.kind === "public").length).toBeGreaterThan(0);
  });

  it("uses Alchemy's published compute-unit costs", () => {
    expect(alchemyUnits("eth_call")).toBe(26);
    expect(alchemyUnits("eth_getBalance")).toBe(20);
    expect(alchemyUnits("alchemy_getTokenBalances")).toBe(20);
  });

  it("skips a provider once its daily budget is used, but never a public node", () => {
    const alchemy = { name: "alchemy", kind: "alchemy" as const, url: "https://x.invalid" };
    const extra = { name: "ankr.com", kind: "extra" as const, url: "https://x.invalid" };
    const pub = { name: "public:publicnode.com", kind: "public" as const, url: "https://x.invalid" };
    // Defaults: 1,000,000 Alchemy CU and 50,000 requests per provider per day.
    for (let i = 0; i < 38_462; i++) recordUsage(alchemy, "eth_call");
    expect(budgetExhausted(alchemy)).toBe(true);
    for (let i = 0; i < 49_999; i++) recordUsage(extra, "eth_call");
    expect(budgetExhausted(extra)).toBe(false);
    recordUsage(extra, "eth_call");
    expect(budgetExhausted(extra)).toBe(true);
    for (let i = 0; i < 100_000; i++) recordUsage(pub, "eth_call");
    expect(budgetExhausted(pub)).toBe(false);
    expect(usageSnapshot().find((u) => u.provider === "alchemy")).toMatchObject({ requests: 38_462 });
  });
});

describe("Alchemy budget tiers", () => {
  beforeEach(() => resetUsage());
  const alchemy = { name: "alchemy", kind: "alchemy" as const, url: "https://x.invalid" };
  // 26 CU per eth_call; the default day is 1,000,000 CU.
  const spend = (calls: number) => {
    for (let i = 0; i < calls; i++) recordUsage(alchemy, "eth_call");
  };

  it("ordinary reads stop using Alchemy at 30% of the day; Alchemy-only calls go on", () => {
    spend(11_538); // 299,988 CU
    expect(budgetExhausted(alchemy, true)).toBe(false);
    spend(1); // 300,014 CU
    expect(budgetExhausted(alchemy, true)).toBe(true);
    expect(budgetExhausted(alchemy)).toBe(false);
  });

  it("background work stops at 50%; visitors keep the rest", () => {
    spend(19_231); // 500,006 CU
    expect(budgetExhausted(alchemy)).toBe(false);
    expect(runInBackground(() => budgetExhausted(alchemy))).toBe(true);
    spend(19_231); // 1,000,012 CU
    expect(budgetExhausted(alchemy)).toBe(true);
  });

  it("counts units by method and the part spent by background work", async () => {
    recordUsage(alchemy, "alchemy_getTokenBalances");
    runInBackground(() => recordUsage(alchemy, "alchemy_getAssetTransfers"));
    // Background is kept across awaits inside the task.
    await runInBackground(async () => {
      await new Promise((r) => setTimeout(r, 1));
      recordUsage(alchemy, "alchemy_getAssetTransfers");
    });
    const row = usageSnapshot().find((u) => u.provider === "alchemy")!;
    expect(row.units).toBe(20 + 2 * alchemyUnits("alchemy_getAssetTransfers"));
    expect(row.alchemy?.backgroundUnits).toBe(2 * alchemyUnits("alchemy_getAssetTransfers"));
    expect(row.alchemy?.methods[0]).toEqual({
      method: "alchemy_getAssetTransfers",
      units: 2 * alchemyUnits("alchemy_getAssetTransfers"),
    });
    expect(row.alchemy).toMatchObject({ ordinaryLimit: 300_000, backgroundLimit: 500_000 });
  });
});

describe("unreachable providers", () => {
  it("only connection problems count, never a node's answer", async () => {
    const { isUnreachable } = await import("@/server/chains/evm/providers");
    const named = (name: string, extra: Record<string, unknown> = {}) =>
      Object.assign(new Error("x"), { name, ...extra });
    expect(isUnreachable(named("TimeoutError"))).toBe(true);
    expect(isUnreachable(named("HttpRequestError"))).toBe(true);
    expect(isUnreachable(named("HttpRequestError", { status: 503 }))).toBe(true);
    expect(isUnreachable(named("HttpRequestError", { status: 429 }))).toBe(true);
    expect(isUnreachable(named("HttpRequestError", { status: 400 }))).toBe(false);
    expect(isUnreachable(named("ContractFunctionRevertedError"))).toBe(false);
    expect(isUnreachable(named("RpcRequestError"))).toBe(false);
  });

  it("a provider that timed out is skipped for a while, then tried again", async () => {
    const { COOL_DOWN_MS, isCoolingDown, meteredHttp, resetCoolDown } = await import("@/server/chains/evm/providers");
    resetCoolDown();
    const provider = { name: "test", kind: "extra" as const, url: "http://127.0.0.1:9/never" };
    const transport = meteredHttp(provider, 200)({ chain: undefined, retryCount: 0 });
    await expect(transport.request({ method: "eth_blockNumber" })).rejects.toThrow();
    expect(isCoolingDown(provider)).toBe(true);
    await expect(transport.request({ method: "eth_blockNumber" })).rejects.toThrow(/skipped for a moment/);
    expect(isCoolingDown(provider, Date.now() + COOL_DOWN_MS + 1)).toBe(false);
    resetCoolDown();
  });
});

describe("speed ranking", () => {
  const alchemy = { name: "alchemy", kind: "alchemy" as const, url: "https://alchemy.test" };
  const extra = { name: "extra", kind: "extra" as const, url: "https://extra.test" };
  const pub = { name: "public", kind: "public" as const, url: "https://public.test" };

  it("keeps the configured preference until speeds are measured", async () => {
    const { rankProviders, resetSpeeds, resetCoolDown, resetUsage } = await import("@/server/chains/evm/providers");
    resetSpeeds();
    resetCoolDown();
    resetUsage();
    expect(rankProviders([pub, extra, alchemy]).map((p) => p.name)).toEqual(["alchemy", "extra", "public"]);
  });

  it("puts the fastest measured provider first and forgets old measurements", async () => {
    const { rankProviders, recordLatency, resetSpeeds, resetUsage } = await import("@/server/chains/evm/providers");
    resetSpeeds();
    resetUsage();
    const now = 1_000_000;
    recordLatency(alchemy, 2_500, now);
    recordLatency(pub, 450, now);
    expect(rankProviders([alchemy, extra, pub], now).map((p) => p.name)).toEqual(["extra", "public", "alchemy"]);
    // Ten minutes later the slow measurement is forgotten and Alchemy gets another chance.
    expect(rankProviders([alchemy, pub], now + 11 * 60_000).map((p) => p.name)).toEqual(["alchemy", "public"]);
    resetSpeeds();
  });

  it("averages measurements so one slow answer doesn't flip the order", async () => {
    const { expectedLatency, recordLatency, resetSpeeds } = await import("@/server/chains/evm/providers");
    resetSpeeds();
    recordLatency(pub, 400, 1);
    recordLatency(pub, 2_000, 2);
    expect(expectedLatency(pub, 3)).toBe(880);
    resetSpeeds();
  });
});
