import "server-only";
import type { ChainConfig } from "@/config/chains";
import { type PublicClient, parseAbi } from "viem";
import { type FeeHistory, type GasAction, type GasFacts, TYPICAL_BYTES } from "@/lib/gas/compute";
import { getOnchainPrices } from "./prices";
import { getEvmClient } from "./providers";

/**
 * Fee history for the Gas Tracker: one eth_feeHistory call (1,024 blocks, tips at the 25th, 50th and 90th
 * percentile) gives both the current speeds (last 20 blocks) and the trend. Free on every node tested.
 */
const BLOCKS = 1024;
const toNum = (hex: unknown): number =>
  typeof hex === "string" && /^0x[0-9a-fA-F]+$/.test(hex) ? Number(BigInt(hex)) : NaN;

export function parseFeeHistory(raw: unknown): FeeHistory | null {
  const r = raw as { oldestBlock?: string; baseFeePerGas?: unknown[]; reward?: unknown[][] } | null;
  if (!r || !Array.isArray(r.baseFeePerGas) || !Array.isArray(r.reward)) return null;
  const oldest = toNum(r.oldestBlock);
  const baseFees = r.baseFeePerGas.map(toNum);
  const rewards = r.reward.map((row) =>
    Array.isArray(row) ? [toNum(row[0]), toNum(row[1]), toNum(row[2])] : [NaN, NaN, NaN],
  ) as [number, number, number][];
  if (!Number.isFinite(oldest) || baseFees.length === 0 || baseFees.some((b) => !Number.isFinite(b))) return null;
  return { baseFees, rewards, newestBlock: oldest + rewards.length - 1 };
}

export async function getEvmGas(chain: ChainConfig): Promise<GasFacts> {
  const client = getEvmClient(chain);
  const raw = await client.request({
    method: "eth_feeHistory",
    params: [`0x${BLOCKS.toString(16)}`, "latest", [25, 50, 90]],
  });
  const history = parseFeeHistory(raw);
  if (!history) throw new Error("Fee history unreadable");
  const oldest = history.newestBlock - history.rewards.length + 1;
  const [newestBlock, oldestBlock, prices, l1Fees] = await Promise.all([
    client.getBlock({ blockNumber: BigInt(history.newestBlock) }).catch(() => null),
    client.getBlock({ blockNumber: BigInt(oldest) }).catch(() => null),
    Promise.race([
      getOnchainPrices(client, chain, []).catch(() => null),
      new Promise<null>((r) => setTimeout(() => r(null), 5_000)),
    ]),
    readL1Fees(client, chain.key).catch(() => null),
  ]);
  return {
    chain: chain.key,
    checkedAt: Date.now(),
    history,
    spanSeconds: newestBlock && oldestBlock ? Number(newestBlock.timestamp - oldestBlock.timestamp) : null,
    coinUsd: prices?.native?.usd ?? null,
    l1Fees,
  };
}

const actions = Object.keys(TYPICAL_BYTES) as GasAction[];

/**
 * Rollups charge for posting the transaction to Ethereum on top of gas:
 * - Base (OP stack): the GasPriceOracle predeploy's getL1FeeUpperBound(size), an upper bound by design;
 * - Arbitrum: ArbGasInfo.getPricesInWei()[1], the price per byte of Ethereum data (often 0 since blobs).
 * Other chains: null (no separate data fee).
 */
async function readL1Fees(client: PublicClient, chainKey: string): Promise<Record<GasAction, number> | null> {
  if (chainKey === "base") {
    const results = await client.multicall({
      allowFailure: false,
      contracts: actions.map((a) => ({
        address: "0x420000000000000000000000000000000000000F" as const,
        abi: parseAbi(["function getL1FeeUpperBound(uint256) view returns (uint256)"]),
        functionName: "getL1FeeUpperBound" as const,
        args: [BigInt(TYPICAL_BYTES[a])] as const,
      })),
    });
    return Object.fromEntries(actions.map((a, i) => [a, Number(results[i])])) as Record<GasAction, number>;
  }
  if (chainKey === "arbitrum") {
    const prices = await client.readContract({
      address: "0x000000000000000000000000000000000000006C",
      abi: parseAbi(["function getPricesInWei() view returns (uint256,uint256,uint256,uint256,uint256,uint256)"]),
      functionName: "getPricesInWei",
    });
    const perByte = Number(prices[1]);
    return Object.fromEntries(actions.map((a) => [a, perByte * TYPICAL_BYTES[a]])) as Record<GasAction, number>;
  }
  return null;
}
