/**
 * Token security live checks (real nodes). Run with:  LIVE=1 pnpm test tests/unit/security-live.test.ts
 * Outside providers (GoPlus, Sourcify) use Next.js caching and are checked by the browser tests instead.
 */
import { describe, expect, it } from "vitest";
import { getAddress, parseAbi } from "viem";
import { getChain } from "@/config/chains";
import { evaluate } from "@/lib/security/evaluate";
import { evmAdapter } from "@/server/chains/evm/adapter";
import { getEvmClient } from "@/server/chains/evm/providers";
import { dexDeployments, wrappedNative } from "@/server/chains/evm/security/dex-registry";
import { type AbiEntry, powersFromSource } from "@/server/chains/evm/security/source";

const live = process.env.LIVE === "1";
const routerAbi = parseAbi(["function factory() view returns (address)", "function WETH() view returns (address)"]);
const run = (chain: string, address: string) => evmAdapter.getTokenSecurity!(getChain(chain)!, address);

describe.skipIf(!live)("token security (live)", () => {
  it("every registered router uses its factory and the chain's wrapped coin", async () => {
    for (const key of ["ethereum", "bsc", "base", "arbitrum", "polygon"] as const) {
      const client = getEvmClient(getChain(key)!);
      for (const dex of dexDeployments[key].filter((d) => d.router)) {
        const [factory, weth] = await Promise.all([
          client.readContract({ address: getAddress(dex.router!), abi: routerAbi, functionName: "factory" }),
          client.readContract({ address: getAddress(dex.router!), abi: routerAbi, functionName: "WETH" }),
        ]);
        expect([dex.name, factory.toLowerCase(), weth.toLowerCase()]).toEqual([
          dex.name,
          dex.factory.toLowerCase(),
          wrappedNative(key).address.toLowerCase(),
        ]);
      }
    }
  }, 90_000);

  it("CAKE: trades with no tax; mint power held by a contract owner", async () => {
    const f = (await run("bsc", "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82"))!;
    expect(f.trade).toMatchObject({ outcome: "ok", buyTax: 0, sellTax: 0, transferTax: 0 });
    const r = evaluate(f);
    expect(r.checks.find((c) => c.id === "power.mint")?.severity).toBe("medium");
    expect(r.counts.critical).toBe(0);
  }, 60_000);

  it("FLOKI: measures its 0.3% buy and sell fee; ownership renounced", async () => {
    const f = (await run("bsc", "0xfb5B838b6cfEEdC2873aB27866079AC55363D37E"))!;
    expect(f.trade.outcome).toBe("ok");
    expect(f.trade.buyTax).toBeCloseTo(0.003, 3);
    expect(f.trade.sellTax).toBeCloseTo(0.003, 3);
    expect(f.owner.renounced).toBe(true);
  }, 60_000);

  it("USDC: older OpenZeppelin proxy found, with powers read from its implementation", async () => {
    const f = (await run("ethereum", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"))!;
    expect(f.proxy.kind).toBe("zeppelinos");
    expect(f.powers.map((p) => p.power)).toEqual(expect.arrayContaining(["mint", "blacklist", "pause"]));
  }, 60_000);

  it("a contract that isn't a token returns null", async () => {
    expect(await run("ethereum", "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D")).toBeNull();
  }, 60_000);

  it("v3-only token: the trade test calls the PancakeSwap v3 pool directly", async () => {
    const f = (await run("bsc", "0x72885fBFA330d1a8fA95880A85b73d699943053B"))!;
    expect(f.trade).toMatchObject({ outcome: "ok", venue: { protocol: "uniswap-v3", router: null, via: null } });
  }, 60_000);

  it("stablecoin-only token: the trade test swaps BNB to USDT first, then trades on the v3 pool", async () => {
    const f = (await run("bsc", "0x12C45413746Fd1C294b6aB0a6A30852801B3546d"))!;
    expect(f.trade).toMatchObject({ outcome: "ok", venue: { protocol: "uniswap-v3", via: "USDT" } });
  }, 60_000);

  it("verified source (Sourcify): CAKE's mint is owner-only; USDC's powers belong to named accounts", async () => {
    const read = async (chainId: number, address: string) => {
      const r = await fetch(`https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=abi,sources`);
      const j = (await r.json()) as { abi: AbiEntry[]; sources: Record<string, { content: string }> };
      return powersFromSource(j.abi, Object.fromEntries(Object.entries(j.sources).map(([k, v]) => [k, v.content])));
    };
    const cake = await read(56, "0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82");
    expect(cake.find((p) => p.power === "mint")?.details?.every((d) => d.access === "owner")).toBe(true);
    const usdc = await read(1, "0x43506849D7C04F9138D1A2050bbF3A0c054402dd"); // USDC implementation
    expect(usdc.find((p) => p.power === "mint")?.details?.[0]?.access).toBe("restricted");
    expect(usdc.find((p) => p.power === "blacklist")?.details?.[0]?.access).toBe("restricted");
  }, 60_000);
});
