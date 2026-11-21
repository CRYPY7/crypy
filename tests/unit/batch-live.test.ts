/**
 * Batch Balance Scanner live checks (real nodes). Run with:  LIVE=1 pnpm test tests/unit/batch-live.test.ts
 */
import { describe, expect, it } from "vitest";
import { erc20Abi, getAddress } from "viem";
import { getChain, liveChains } from "@/config/chains";
import { batchAssets } from "@/config/batch-assets";
import { readBatchBalances } from "@/server/chains/evm/batch";
import { getEvmClient } from "@/server/chains/evm/providers";

const live = process.env.LIVE === "1";
const eth = getChain("ethereum")!;
const bsc = getChain("bsc")!;
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"; // EIP-7702 delegated wallet (checked 2026-11-20)
const USDT_ETH = "0xdAC17F958D2ee523a2206206994597C13D831ec7";
const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";
const BINANCE_8 = "0xF977814e90dA44bFA03b6295A0616a897441aceC";

describe.skipIf(!live)("batch balances (live)", () => {
  it("every picker token has the listed decimals on its chain", async () => {
    for (const chain of liveChains) {
      const client = getEvmClient(chain);
      const list = batchAssets.flatMap((a) => (a.chains[chain.key] ? [{ key: a.key, ...a.chains[chain.key]! }] : []));
      const decimals = await client.multicall({
        allowFailure: false,
        contracts: list.map((t) => ({
          address: getAddress(t.address),
          abi: erc20Abi,
          functionName: "decimals" as const,
        })),
      });
      list.forEach((t, i) => expect([t.key, Number(decimals[i])]).toEqual([t.key, t.decimals]));
    }
  }, 60_000);

  it("Ethereum: types (wallet, contract, delegated wallet) and balances match single reads", async () => {
    const client = getEvmClient(eth);
    const addresses = [BINANCE_8, USDT_ETH, VITALIK, "0x000000000000000000000000000000000000dEaD"];
    const result = await readBatchBalances(client, addresses, [USDT_ETH]);
    expect(result.rows.map((r) => r.type)).toEqual(["wallet", "contract", "delegated", "wallet"]);
    const block = BigInt(result.block);
    const [native, usdt] = await Promise.all([
      client.getBalance({ address: BINANCE_8, blockNumber: block }),
      client.readContract({
        address: USDT_ETH,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [BINANCE_8],
        blockNumber: block,
      }),
    ]);
    expect(result.rows[0]).toMatchObject({ native: native.toString(), tokens: [usdt.toString()] });
  }, 60_000);

  it("BNB Chain: a full batch of 100 addresses at a fixed block", async () => {
    const client = getEvmClient(bsc);
    const head = await client.getBlockNumber();
    const addresses = Array.from({ length: 100 }, (_, i) => `0x${(i + 1).toString(16).padStart(40, "0")}`);
    addresses[0] = BINANCE_8;
    const result = await readBatchBalances(client, addresses, [USDT_BSC], head - 2n);
    expect(result.block).toBe((head - 2n).toString());
    expect(result.rows).toHaveLength(100);
    expect(result.rows.every((r) => r.native !== null && r.tokens[0] !== null && r.type !== null)).toBe(true);
    expect(BigInt(result.rows[0]!.native!)).toBeGreaterThan(0n);
  }, 60_000);

  it("answers at the requested block, or at the latest block when the node no longer keeps it", async () => {
    const client = getEvmClient(bsc);
    const result = await readBatchBalances(client, [BINANCE_8], [], 1n);
    // Archive nodes (Alchemy) can answer block 1; free nodes can't, and the reader moves to the latest block.
    expect(result.block === "1" || BigInt(result.block) > 1_000_000n).toBe(true);
    expect(result.rows[0]!.native).not.toBeNull();
  }, 60_000);
});
