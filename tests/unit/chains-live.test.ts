/**
 * Base, Arbitrum and Polygon (M7) against real nodes. Run with:  LIVE=1 pnpm test tests/unit/chains-live.test.ts
 * Each chain is shown as supported only after these pass.
 */
import { describe, expect, it } from "vitest";
import { erc20Abi, getAddress } from "viem";
import { getChain } from "@/config/chains";
import { evaluate } from "@/lib/security/evaluate";
import { evmAdapter } from "@/server/chains/evm/adapter";
import { chainDex, poolFactories } from "@/server/chains/evm/dex";
import { getEvmClient } from "@/server/chains/evm/providers";

const live = process.env.LIVE === "1";
const NEW = ["base", "arbitrum", "polygon"] as const;
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";

describe.skipIf(!live)("new EVM chains (live)", () => {
  for (const key of NEW) {
    const chain = getChain(key)!;

    it(`${key}: every node answers with the configured chain id`, async () => {
      expect(await getEvmClient(chain).getChainId()).toBe(chain.evmChainId);
    }, 60_000);

    it(`${key}: every common token and price quote is a token with readable decimals`, async () => {
      const client = getEvmClient(chain);
      const quotes = chainDex[key].quotes;
      const tokens = [...new Set([...chain.commonTokens, ...quotes.map((q) => q.address)])];
      const decimals = await client.multicall({
        allowFailure: false,
        contracts: tokens.map((t) => ({ address: getAddress(t), abi: erc20Abi, functionName: "decimals" as const })),
      });
      decimals.forEach((d) => expect(d).toBeGreaterThan(0));
      for (const q of quotes) expect(decimals[tokens.indexOf(q.address)], q.address).toBe(q.decimals);
    }, 60_000);

    it(`${key}: every listed factory is a contract`, async () => {
      const client = getEvmClient(chain);
      for (const f of poolFactories[key]) {
        const code = await client.getCode({ address: getAddress(f.factory) });
        expect(code && code.length > 2, `${f.name}`).toBe(true);
      }
    }, 60_000);

    it(`${key}: the coin has an on-chain dollar price`, async () => {
      const prices = await evmAdapter.getUsdPrices!(chain, []);
      const usd = prices.get("native")?.usd ?? 0;
      console.info(key, chain.nativeSymbol, usd);
      // ETH on Base and Arbitrum; POL on Polygon. Wide bands: this checks the engine, not the market.
      if (chain.nativeSymbol === "ETH") expect(usd).toBeGreaterThan(300);
      else expect(usd).toBeGreaterThan(0.01);
    }, 60_000);

    it(`${key}: gas speeds, and the data fee on rollups`, async () => {
      const gas = await evmAdapter.getGas!(chain);
      expect(gas.history.rewards.length).toBeGreaterThan(10);
      if (key === "polygon") expect(gas.l1Fees).toBeNull();
      else {
        expect(gas.l1Fees).not.toBeNull();
        expect(gas.l1Fees!.swap).toBeGreaterThanOrEqual(gas.l1Fees!.sendCoin);
      }
    }, 60_000);

    it(`${key}: balances for a real wallet`, async () => {
      const balances = await evmAdapter.getBalances!(chain, VITALIK);
      expect(["full", "truncated", "common-only"]).toContain(balances.coverage);
      expect(BigInt(balances.native.raw)).toBeGreaterThanOrEqual(0n);
    }, 60_000);
  }

  // Token Security: the trade test on each chain's exchange designs (v3 pool called directly, v2 through its router,
  // and a stablecoin-only pool reached through a hop from the coin).
  const trades: [string, string, string, Record<string, unknown>][] = [
    ["base", "DEGEN (Uniswap v3)", "0x4ed4E862860beD51a9570b96d89aF5E1B0Efefed", { protocol: "uniswap-v3" }],
    ["arbitrum", "ARB (Uniswap v3)", "0x912CE59144191C1204E64559FE8253a0e49E6548", { protocol: "uniswap-v3" }],
    ["polygon", "QUICK (QuickSwap v2)", "0xB5C064F955D8e7F38fE0460C556a72987494eE17", { dex: "QuickSwap" }],
    ["polygon", "LINK (stablecoin pool, via USD)", "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39", { via: "USD" }],
  ];
  for (const [key, label, token, venue] of trades)
    it(`${key}: token security trade test, ${label}: bought, sent and sold without tax`, async () => {
      const facts = await evmAdapter.getTokenSecurity!(getChain(key)!, token);
      expect(facts).not.toBeNull();
      expect(facts!.trade).toMatchObject({ outcome: "ok", buyTax: 0, sellTax: 0, transferTax: 0 });
      expect(facts!.trade!.venue).toMatchObject(venue);
      // Never a "safe" verdict: the best level is "no major risks found".
      expect(["none-found", "warnings", "risks", "serious"]).toContain(evaluate(facts!).level);
    }, 120_000);

  it("base: a transaction's fee includes the Ethereum data fee from its receipt", async () => {
    const chain = getChain("base")!;
    const client = getEvmClient(chain);
    const block = await client.getBlock({ blockTag: "latest", includeTransactions: true });
    const tx = block.transactions.find((t) => typeof t !== "string" && (t.type as string) !== "deposit" && t.to)!;
    const details = await evmAdapter.getTransactionDetails!(chain, (tx as { hash: `0x${string}` }).hash);
    expect(details).not.toBeNull();
    expect(details!.l1Fee).not.toBeNull();
    const fee = BigInt(details!.fee!);
    expect(fee).toBe(BigInt(details!.gasUsed!) * BigInt(details!.gasPrice!) + BigInt(details!.l1Fee!));
    expect(details!.finalized).toBe(false); // just made: not final on Ethereum yet
  }, 90_000);
});
