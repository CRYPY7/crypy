import "server-only";
import { type PublicClient, erc20Abi, getAddress, parseAbi } from "viem";
import type { ChainKey } from "@/config/chains";
import type { TxAllowanceRead, TxApproval, TxPool, TxProtocolEvent } from "@/lib/chains/types";
import { poolFactories } from "./dex";

/**
 * Extra on-chain reads for the transaction page (pools, permissions, balances, codes).
 * Each one is optional: a failure returns an empty / null result, never an error, and the page says less.
 */

const MAX_POOLS = 12;
const MAX_ALLOWANCES = 10;
const MAX_CODES = 10;

const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function factory() view returns (address)",
  "function fee() view returns (uint24)",
]);
const factoryAbi = parseAbi([
  "function getPair(address, address) view returns (address)",
  "function getPool(address, address, uint24) view returns (address)",
]);

/**
 * Two rounds: what each pool says about itself (tokens, factory, fee), then whether that factory — if it is a
 * known deployment — lists the pool. A pool is "verified" only after the second check.
 */
export async function readPools(
  client: PublicClient,
  chain: ChainKey,
  events: TxProtocolEvent[],
): Promise<Record<string, TxPool>> {
  const versions = new Map<string, "v2" | "v3">();
  for (const event of events) {
    if (event.type === "pool-swap") versions.set(event.pool.toLowerCase(), event.version);
    else if (event.type === "pool-sync" || event.type === "pool-mint" || event.type === "pool-burn") {
      if (!versions.has(event.pool.toLowerCase())) versions.set(event.pool.toLowerCase(), "v2");
    }
  }
  const list = [...versions.keys()].slice(0, MAX_POOLS).map((a) => getAddress(a));
  if (list.length === 0) return {};
  const meta = await client.multicall({
    allowFailure: true,
    contracts: list.flatMap((address) => [
      { address, abi: poolAbi, functionName: "token0" as const },
      { address, abi: poolAbi, functionName: "token1" as const },
      { address, abi: poolAbi, functionName: "factory" as const },
      { address, abi: poolAbi, functionName: "fee" as const },
    ]),
  });
  const known = poolFactories[chain] ?? [];
  const pools: TxPool[] = [];
  list.forEach((address, i) => {
    const [t0, t1, factory, fee] = meta.slice(i * 4, i * 4 + 4);
    if (t0?.status !== "success" || t1?.status !== "success") return;
    const version = versions.get(address.toLowerCase())!;
    pools.push({
      address,
      version,
      token0: getAddress(String(t0.result)),
      token1: getAddress(String(t1.result)),
      fee: version === "v3" && fee?.status === "success" ? Number(fee.result) : null,
      factory: factory?.status === "success" ? getAddress(String(factory.result)) : null,
      dex: null,
      verified: false,
    });
  });

  const checks = pools.map((pool) => ({
    pool,
    entry: known.find(
      (f) => pool.factory && f.factory.toLowerCase() === pool.factory.toLowerCase() && f.protocol === pool.version,
    ),
  }));
  const toVerify = checks.filter((c) => c.entry && (c.pool.version === "v2" || c.pool.fee !== null));
  if (toVerify.length > 0) {
    const answers = await client.multicall({
      allowFailure: true,
      contracts: toVerify.map(({ pool, entry }) =>
        pool.version === "v2"
          ? {
              address: getAddress(entry!.factory),
              abi: factoryAbi,
              functionName: "getPair" as const,
              args: [pool.token0, pool.token1] as const,
            }
          : {
              address: getAddress(entry!.factory),
              abi: factoryAbi,
              functionName: "getPool" as const,
              args: [pool.token0, pool.token1, pool.fee!] as const,
            },
      ),
    });
    toVerify.forEach(({ pool, entry }, i) => {
      const answer = answers[i];
      if (answer?.status === "success" && String(answer.result).toLowerCase() === pool.address.toLowerCase()) {
        pool.verified = true;
        pool.dex = entry!.name;
      }
    });
  }
  return Object.fromEntries(pools.map((pool) => [pool.address.toLowerCase(), pool]));
}

/** Unique ERC-20 permissions touched by the transaction (NFT approvals are shown from events only). */
function permissionKeys(approvals: TxApproval[]) {
  const seen = new Map<string, { token: string; owner: string; spender: string }>();
  for (const a of approvals) {
    if (a.kind !== "amount") continue;
    const key = `${a.token}:${a.owner}:${a.spender}`.toLowerCase();
    if (!seen.has(key)) seen.set(key, { token: a.token, owner: a.owner, spender: a.spender });
  }
  return [...seen.values()].slice(0, MAX_ALLOWANCES);
}

async function allowanceAt(
  client: PublicClient | null,
  keys: { token: string; owner: string; spender: string }[],
  blockNumber?: bigint,
): Promise<(string | null)[]> {
  if (!client || keys.length === 0) return keys.map(() => null);
  const results = await client
    .multicall({
      allowFailure: true,
      ...(blockNumber !== undefined ? { blockNumber } : {}),
      contracts: keys.map((k) => ({
        address: getAddress(k.token),
        abi: erc20Abi,
        functionName: "allowance" as const,
        args: [getAddress(k.owner), getAddress(k.spender)] as const,
      })),
    })
    .catch(() => null);
  return keys.map((_, i) => (results?.[i]?.status === "success" ? String(results[i]!.result) : null));
}

/**
 * Allowance now (latest block) and, when the node keeps it, just before the transaction's block.
 * `before` uses the state at the end of the previous block; transactions earlier in the same block could
 * also have changed it, which the page mentions.
 */
export async function readAllowances(
  client: PublicClient,
  pastClient: PublicClient | null,
  approvals: TxApproval[],
  blockNumber: bigint | null,
): Promise<TxAllowanceRead[]> {
  const keys = permissionKeys(approvals);
  if (keys.length === 0) return [];
  const [now, before] = await Promise.all([
    allowanceAt(client, keys),
    blockNumber !== null && blockNumber > 0n ? allowanceAt(pastClient, keys, blockNumber - 1n) : keys.map(() => null),
  ]);
  return keys.map((key, i) => ({ ...key, now: now[i] ?? null, before: before[i] ?? null }));
}

/** Native balance at the end of the previous block and at the end of the transaction's block. */
export async function readNativeBalance(
  pastClient: PublicClient | null,
  address: string,
  blockNumber: bigint | null,
): Promise<{ address: string; before: string; after: string } | null> {
  if (!pastClient || blockNumber === null || blockNumber === 0n) return null;
  const account = getAddress(address);
  try {
    const [before, after] = await Promise.all([
      pastClient.getBalance({ address: account, blockNumber: blockNumber - 1n }),
      pastClient.getBalance({ address: account, blockNumber }),
    ]);
    return { address: account, before: before.toString(), after: after.toString() };
  } catch {
    return null;
  }
}

/** Whether each address has code (contract or delegated account). Unknown addresses are left out. */
export async function readCodes(client: PublicClient, addresses: string[]): Promise<Record<string, boolean>> {
  const list = [...new Set(addresses.map((a) => a.toLowerCase()))].slice(0, MAX_CODES);
  const results = await Promise.all(
    list.map((address) =>
      client
        .getCode({ address: getAddress(address) })
        .then((code) => code !== undefined && code !== "0x")
        .catch(() => null),
    ),
  );
  const out: Record<string, boolean> = {};
  list.forEach((address, i) => {
    if (results[i] !== null) out[address] = results[i]!;
  });
  return out;
}
