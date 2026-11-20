import "server-only";
import { type PublicClient, getAddress, parseAbi } from "viem";
import type { ChainKey } from "@/config/chains";
import type { PoolFact } from "@/lib/security/types";
import { type DexDeployment, dexDeployments, lpLockers, pairTokens } from "./dex-registry";

const ZERO = "0x0000000000000000000000000000000000000000";
const DEAD = "0x000000000000000000000000000000000000dEaD";
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
  lp: PoolFact["lp"];
}

/** Round 2: reserves (or balances for v3) and, for v2 pools, who holds the LP tokens. */
export async function readPools(
  client: PublicClient,
  chain: ChainKey,
  token: string,
  pools: FoundPool[],
  owner: string | null,
): Promise<PoolReading[]> {
  if (pools.length === 0) return [];
  const lockers = Object.keys(lpLockers[chain] ?? {});
  const holders = [DEAD, ZERO, ...(owner ? [owner] : []), ...lockers].map((a) => getAddress(a));
  const contracts = pools.flatMap((p) =>
    p.dex.protocol === "uniswap-v2"
      ? [
          { address: getAddress(p.address), abi: pairAbi, functionName: "getReserves" as const },
          { address: getAddress(p.address), abi: pairAbi, functionName: "token0" as const },
          { address: getAddress(p.address), abi: pairAbi, functionName: "totalSupply" as const },
          ...holders.map((h) => ({
            address: getAddress(p.address),
            abi: pairAbi,
            functionName: "balanceOf" as const,
            args: [h] as const,
          })),
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
      return { pool, quoteReserve, tokenReserve, lp: null };
    }
    const reserves = value() as readonly [bigint, bigint, number] | null;
    const token0 = value() as string | null;
    const supply = (value() as bigint | null) ?? 0n;
    const balances = holders.map(() => (value() as bigint | null) ?? 0n);
    const tokenIs0 = token0?.toLowerCase() === token.toLowerCase();
    const [r0, r1] = reserves ? [reserves[0], reserves[1]] : [0n, 0n];
    const share = (n: bigint) => (supply > 0n ? Number((n * 1_000_000n) / supply) / 1_000_000 : 0);
    const burned = share(balances[0]! + balances[1]!);
    const ownerShare = owner ? share(balances[2]!) : 0;
    const locked = share(balances.slice(owner ? 3 : 2).reduce((a, b) => a + b, 0n));
    return {
      pool,
      quoteReserve: tokenIs0 ? r1 : r0,
      tokenReserve: tokenIs0 ? r0 : r1,
      lp:
        supply > 0n
          ? { burned, locked, owner: ownerShare, other: Math.max(0, 1 - burned - locked - ownerShare) }
          : null,
    };
  });
}

/** USD value of a pool, estimated as twice its paired-token side (exact for v2; an estimate for v3). */
export function poolUsd(reading: PoolReading, nativeUsd: number | null): number | null {
  const amount = Number(reading.quoteReserve) / 10 ** reading.pool.quote.decimals;
  const price = reading.pool.quote.role === "stable" ? 1 : nativeUsd;
  return price === null ? null : amount * price * 2;
}
