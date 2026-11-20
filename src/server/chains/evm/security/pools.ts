import "server-only";
import { type PublicClient, getAddress, parseAbi } from "viem";
import type { ChainKey } from "@/config/chains";
import { type DexDeployment, dexDeployments, pairTokens } from "./dex-registry";

const ZERO = "0x0000000000000000000000000000000000000000";
const v2FactoryAbi = parseAbi(["function getPair(address, address) view returns (address)"]);
const v3FactoryAbi = parseAbi(["function getPool(address, address, uint24) view returns (address)"]);
const pairAbi = parseAbi([
  "function getReserves() view returns (uint112, uint112, uint32)",
  "function token0() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
]);

export interface FoundPool {
  dex: DexDeployment;
  address: string;
  /** Paired token (stablecoin or wrapped native). */
  quote: { address: string; decimals: number; role: "stable" | "wrapped-native" };
  fee: number | null;
}

/** Round 1: ask every registered factory for the token's pools against each pair token. */
export async function findPools(client: PublicClient, chain: ChainKey, token: string): Promise<FoundPool[]> {
  const t = getAddress(token);
  const queries: { dex: DexDeployment; quote: FoundPool["quote"]; fee: number | null }[] = [];
  for (const dex of dexDeployments[chain] ?? []) {
    for (const quote of pairTokens(chain)) {
      if (quote.address.toLowerCase() === t.toLowerCase()) continue;
      if (dex.protocol === "uniswap-v2") queries.push({ dex, quote, fee: null });
      else for (const fee of dex.fees ?? []) queries.push({ dex, quote, fee });
    }
  }
  const results = await client.multicall({
    allowFailure: true,
    contracts: queries.map(({ dex, quote, fee }) =>
      dex.protocol === "uniswap-v2"
        ? {
            address: getAddress(dex.factory),
            abi: v2FactoryAbi,
            functionName: "getPair" as const,
            args: [t, getAddress(quote.address)] as const,
          }
        : {
            address: getAddress(dex.factory),
            abi: v3FactoryAbi,
            functionName: "getPool" as const,
            args: [t, getAddress(quote.address), fee!] as const,
          },
    ),
  });
  return queries.flatMap((q, i) => {
    const r = results[i];
    const address = r?.status === "success" ? String(r.result) : ZERO;
    return address.toLowerCase() === ZERO ? [] : [{ ...q, address: getAddress(address) }];
  });
}

export interface PoolReading {
  pool: FoundPool;
  /** Paired-token amount in the pool (raw). */
  quoteReserve: bigint;
  /** Token amount in the pool (raw). */
  tokenReserve: bigint;
  /** v2-style pools: LP token supply (raw); null for v3-style pools or when unreadable. */
  lpSupply: bigint | null;
}

/** Round 2: reserves (v2) or pool balances (v3), and the LP token supply. */
export async function readPools(client: PublicClient, token: string, pools: FoundPool[]): Promise<PoolReading[]> {
  if (pools.length === 0) return [];
  type Read = {
    address: `0x${string}`;
    abi: typeof pairAbi;
    functionName: "getReserves" | "token0" | "totalSupply" | "balanceOf";
    args?: readonly [`0x${string}`];
  };
  const contracts = pools.flatMap((p): Read[] =>
    p.dex.protocol === "uniswap-v2"
      ? [
          { address: getAddress(p.address), abi: pairAbi, functionName: "getReserves" as const },
          { address: getAddress(p.address), abi: pairAbi, functionName: "token0" as const },
          { address: getAddress(p.address), abi: pairAbi, functionName: "totalSupply" as const },
        ]
      : [
          // Same balanceOf signature as an ERC-20, so one ABI covers both pool kinds.
          {
            address: getAddress(p.quote.address),
            abi: pairAbi,
            functionName: "balanceOf" as const,
            args: [getAddress(p.address)] as const,
          },
          {
            address: getAddress(token),
            abi: pairAbi,
            functionName: "balanceOf" as const,
            args: [getAddress(p.address)] as const,
          },
        ],
  );
  const results = await client.multicall({ allowFailure: true, contracts });
  let i = 0;
  const value = () => {
    const r = results[i++];
    return r?.status === "success" ? r.result : null;
  };
  return pools.map((pool) => {
    if (pool.dex.protocol !== "uniswap-v2") {
      const quoteReserve = (value() as bigint | null) ?? 0n;
      const tokenReserve = (value() as bigint | null) ?? 0n;
      return { pool, quoteReserve, tokenReserve, lpSupply: null };
    }
    const reserves = value() as readonly [bigint, bigint, number] | null;
    const token0 = value() as string | null;
    const supply = value() as bigint | null;
    const tokenIs0 = token0?.toLowerCase() === token.toLowerCase();
    const [r0, r1] = reserves ? [reserves[0], reserves[1]] : [0n, 0n];
    return { pool, quoteReserve: tokenIs0 ? r1 : r0, tokenReserve: tokenIs0 ? r0 : r1, lpSupply: supply };
  });
}

const pairInfoAbi = parseAbi([
  "function factory() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
]);

/**
 * Pools named by an outside lead (GoPlus) that the registry search didn't find. Each is accepted only if it is a real
 * v2-style pair: its factory() confirms it with getPair(token0, token1), one side is the scanned token and the other a
 * known pair token (so it can be valued). Exchanges outside the registry get the name "Other exchange".
 */
export async function verifyLeadPools(
  client: PublicClient,
  chain: ChainKey,
  token: string,
  leads: string[],
  known: FoundPool[],
): Promise<FoundPool[]> {
  const seen = new Set(known.map((p) => p.address.toLowerCase()));
  const list = [...new Set(leads.map((a) => a.toLowerCase()))].filter((a) => !seen.has(a)).slice(0, 10);
  if (list.length === 0) return [];
  const info = await client.multicall({
    allowFailure: true,
    contracts: list.flatMap((a) =>
      (["factory", "token0", "token1"] as const).map(
        (functionName): { address: `0x${string}`; abi: typeof pairInfoAbi; functionName: typeof functionName } => ({
          address: getAddress(a),
          abi: pairInfoAbi,
          functionName,
        }),
      ),
    ),
  });
  const quotes = pairTokens(chain);
  const candidates = list.flatMap((address, i) => {
    const [f, t0, t1] = [0, 1, 2].map((j) => info[i * 3 + j]);
    if (f?.status !== "success" || t0?.status !== "success" || t1?.status !== "success") return [];
    const [a0, a1] = [String(t0.result).toLowerCase(), String(t1.result).toLowerCase()];
    const other = a0 === token.toLowerCase() ? a1 : a1 === token.toLowerCase() ? a0 : null;
    const quote = other ? quotes.find((q) => q.address.toLowerCase() === other) : undefined;
    return quote ? [{ address, factory: String(f.result), t0: a0, t1: a1, quote }] : [];
  });
  if (candidates.length === 0) return [];
  const confirm = await client.multicall({
    allowFailure: true,
    contracts: candidates.map((c) => ({
      address: getAddress(c.factory),
      abi: v2FactoryAbi,
      functionName: "getPair" as const,
      args: [getAddress(c.t0), getAddress(c.t1)] as const,
    })),
  });
  return candidates.flatMap((c, i) => {
    const r = confirm[i];
    if (r?.status !== "success" || String(r.result).toLowerCase() !== c.address) return [];
    const dex = (dexDeployments[chain] ?? []).find((d) => d.factory.toLowerCase() === c.factory.toLowerCase()) ?? {
      name: "Other exchange",
      protocol: "uniswap-v2" as const,
      factory: getAddress(c.factory),
      unlisted: true,
    };
    return [{ dex, address: getAddress(c.address), quote: c.quote, fee: null }];
  });
}

/** USD value of a pool, estimated as twice its paired-token side (exact for v2; an estimate for v3). */
export function poolUsd(reading: PoolReading, nativeUsd: number | null): number | null {
  const amount = Number(reading.quoteReserve) / 10 ** reading.pool.quote.decimals;
  const price = reading.pool.quote.role === "stable" ? 1 : nativeUsd;
  return price === null ? null : amount * price * 2;
}
