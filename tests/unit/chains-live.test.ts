/**
 * Base, Arbitrum and Polygon (M7) against real nodes. Run with:  LIVE=1 pnpm test tests/unit/chains-live.test.ts
 * Each chain is shown as supported only after these pass.
 */
import { describe, expect, it } from "vitest";
import { erc20Abi, getAddress } from "viem";
import { getChain } from "@/config/chains";
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
