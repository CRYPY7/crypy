import { beforeEach, describe, expect, it } from "vitest";
import { getChain } from "@/config/chains";
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
